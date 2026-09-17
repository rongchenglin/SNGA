const { app, BrowserWindow, Menu, dialog, session, shell, ipcMain, screen } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const https = require('https')
const { URL } = require('url')

const NGA_HOST = 'https://bbs.nga.cn'
const LOGIN_URL = 'https://bbs.nga.cn/nuke.php?__lib=login&__act=account&login'
// 本机静态服务首选端口：加载 H5 产物 + 转发 NGA 接口，渲染进程同源请求，绕开浏览器跨域限制
const PREFERRED_PORT = 8973
const APP_USER_MODEL_ID = 'com.simple.nga.desktop'
// 未登录时窗口尺寸；桌面端默认按手机版比例开一个窄窗
const DEFAULT_BOUNDS = { width: 480, height: 840 }
const MIN_BOUNDS = { width: 360, height: 520 }

let mainWindow = null
let loginWindow = null
let cookiePollTimer = null
// 当前登录态（uid/cid），API 转发时附加到 Cookie 头
let ngaAuth = { uid: '', cid: '' }
// 本地服务地址，渲染进程通过 preload 同步取走当接口 base
let apiBase = ''

// ---------- 开发服务器 ----------
// HBuilderX「运行 → 运行到浏览器」会起一个带 HMR 的 dev server。
// 窗口指过去就能一边改 pages/utils 一边看效果，同时保留 electronAPI 和接口代理。
// 用法：npm run desktop:dev            （自动探测端口）
//      npm run desktop:dev -- --dev-server=http://localhost:8080
const DEV_SERVER_CANDIDATES = [8080, 8081, 8082, 5173, 3000]

function devServerArg() {
  const matched = process.argv.find((item) => item.startsWith('--dev-server='))
  return matched ? matched.slice('--dev-server='.length) : ''
}

function isDevMode() {
  return Boolean(
    process.env.SNGA_DEV_SERVER ||
    process.argv.some((item) => item === '--dev-server' || item.startsWith('--dev-server='))
  )
}

function normalizeDevServerUrl(raw) {
  if (!raw) {
    return ''
  }
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`
  try {
    return new URL(withScheme).origin
  } catch (e) {
    console.warn('[SNGA] 无法解析 dev server 地址：' + raw)
    return ''
  }
}

// 探测候选端口上是不是 uni-app 的 H5 dev server（认 index.html 里的挂载点）
function probeDevServer(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1500 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        resolve('')
        return
      }
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        body += chunk
        if (body.length > 4096) {
          req.destroy()
        }
      })
      res.on('end', () => resolve(/id=["']app["']/.test(body) ? `http://127.0.0.1:${port}` : ''))
    })
    req.on('timeout', () => {
      req.destroy()
      resolve('')
    })
    req.on('error', () => resolve(''))
  })
}

async function resolveDevServer() {
  if (!isDevMode()) {
    return ''
  }
  const explicit = normalizeDevServerUrl(process.env.SNGA_DEV_SERVER || devServerArg())
  if (explicit) {
    console.log('[SNGA] 使用 dev server: ' + explicit)
    return explicit
  }
  for (const port of DEV_SERVER_CANDIDATES) {
    const found = await probeDevServer(port)
    if (found) {
      console.log('[SNGA] 探测到 dev server: ' + found)
      return found
    }
  }
  console.warn('[SNGA] 没探测到 dev server（试过 ' + DEV_SERVER_CANDIDATES.join(', ') +
    '），请先在 HBuilderX 里执行「运行 → 运行到浏览器」')
  return ''
}

// ---------- 定位 H5 产物目录 ----------
// 开发时直接用 HBuilderX 打出的产物；打包后由 electron-builder 通过 extraResources 放到 resources/h5
function findH5Root() {
  const candidates = []
  if (process.env.SNGA_H5_DIR) {
    candidates.push(path.resolve(process.env.SNGA_H5_DIR))
  }
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'h5'))
  } else {
    const projectRoot = path.resolve(__dirname, '..')
    candidates.push(path.join(projectRoot, 'unpackage', 'dist', 'build', 'web'))
    candidates.push(path.join(projectRoot, 'unpackage', 'dist', 'build', 'h5'))
    candidates.push(path.join(__dirname, 'h5-dist'))
  }
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      return dir
    }
  }
  return null
}

// ---------- 静态资源 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8'
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not Found')
      return
    }
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(data)
  })
}

// ---------- NGA 接口代理 ----------
// 渲染进程请求本机 /nga-api、/nga-read、/nga-thread、/nga-nuke，这里原样转发到 NGA，并附加客户端身份头与登录 Cookie
const PROXY_TARGETS = {
  '/nga-api': '/app_api.php',
  '/nga-read': '/read.php',
  '/nga-thread': '/thread.php',
  '/nga-nuke': '/nuke.php'
}
function proxyRequest(req, res, targetUrl) {
  const headers = {
    'X-User-Agent': 'Nga_Official'
  }
  if (req.headers['content-type']) {
    headers['Content-Type'] = req.headers['content-type']
  }
  if (ngaAuth.uid && ngaAuth.cid) {
    headers['Cookie'] = `ngaPassportUid=${ngaAuth.uid}; ngaPassportCid=${ngaAuth.cid}`
  }

  const upstream = https.request(
    targetUrl,
    { method: req.method, headers },
    (pres) => {
      // 剔除逐跳响应头，避免二次转发时出错
      const HOP_BY_HOP = ['connection', 'transfer-encoding', 'keep-alive', 'proxy-authenticate',
        'proxy-authorization', 'te', 'trailer', 'upgrade', 'content-length']
      const out = {}
      Object.keys(pres.headers).forEach((k) => {
        if (!HOP_BY_HOP.includes(k.toLowerCase())) {
          out[k] = pres.headers[k]
        }
      })
      res.writeHead(pres.statusCode, out)
      pres.pipe(res)
    }
  )
  upstream.on('error', (err) => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('proxy error: ' + err.message)
  })
  req.pipe(upstream)
}

// ---------- 本地服务器 ----------
// dev server 模式下页面和代理不同源，且请求带了自定义头 X-User-Agent，
// 浏览器会先发 OPTIONS 预检，这里统一放行
function applyCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Agent')
  res.setHeader('Access-Control-Max-Age', '600')
}

function handleRequest(rootDir, req, res) {
  let url
  try {
    url = new URL(req.url, 'http://127.0.0.1')
  } catch (e) {
    res.writeHead(400)
    res.end()
    return
  }

  // 接口代理
  const target = PROXY_TARGETS[url.pathname]
  if (target) {
    applyCorsHeaders(res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    proxyRequest(req, res, `${NGA_HOST}${target}${url.search}`)
    return
  }

  // dev server 模式下没有 H5 产物，本地服务只承担接口代理
  if (!rootDir) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not Found')
    return
  }

  // 静态资源（兜底 index.html）
  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch (e) {
    pathname = url.pathname
  }
  if (pathname === '/') {
    pathname = '/index.html'
  }
  const filePath = path.normalize(path.join(rootDir, pathname))
  // 防目录穿越
  if (!filePath.startsWith(path.normalize(rootDir))) {
    res.writeHead(403)
    res.end()
    return
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA 回退到 index.html
    sendFile(res, path.join(rootDir, 'index.html'))
    return
  }
  sendFile(res, filePath)
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('listening', onListening)
      reject(err)
    }
    const onListening = () => {
      server.removeListener('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '127.0.0.1')
  })
}

// 首选端口被占用时退回随机端口：页面用的是 location.origin，端口变了也能正常工作
async function startServer(rootDir) {
  const server = http.createServer((req, res) => handleRequest(rootDir, req, res))
  try {
    await listen(server, PREFERRED_PORT)
  } catch (error) {
    console.warn(`[SNGA] 端口 ${PREFERRED_PORT} 不可用（${error.code || error.message}），改用随机端口`)
    await listen(server, 0)
  }
  return server
}

// ---------- 登录：抓 cookie ----------
function parseCookies(cookies) {
  const uid = cookies.find((c) => c.name === 'ngaPassportUid' && c.value)
  const cid = cookies.find((c) => c.name === 'ngaPassportCid' && c.value)
  if (!uid || !cid) {
    return null
  }
  return {
    uid: uid.value,
    cid: cid.value,
    cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ')
  }
}

async function checkLoginCookies() {
  if (!loginWindow || loginWindow.isDestroyed()) {
    return null
  }
  try {
    const cookies = await loginWindow.webContents.session.cookies.get({ url: NGA_HOST })
    return parseCookies(cookies)
  } catch (e) {
    console.error('读取登录 cookie 失败：', e.message)
    return null
  }
}

// 重启后不依赖渲染进程也能恢复登录态：cookie 存在会话里，直接读回来
async function restoreAuthFromSession() {
  try {
    const cookies = await session.defaultSession.cookies.get({ url: NGA_HOST })
    const auth = parseCookies(cookies)
    if (auth) {
      ngaAuth = { uid: auth.uid, cid: auth.cid }
      console.log('[SNGA] 已从会话恢复登录态 uid=' + auth.uid)
    }
  } catch (e) {
    console.error('恢复登录态失败：', e.message)
  }
}

function stopLoginPolling() {
  if (cookiePollTimer) {
    clearInterval(cookiePollTimer)
    cookiePollTimer = null
  }
}

function openLoginWindow() {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.focus()
    return
  }
  loginWindow = new BrowserWindow({
    width: 480,
    height: 720,
    parent: mainWindow || undefined,
    modal: Boolean(mainWindow),
    autoHideMenuBar: true,
    title: 'NGA 登录'
  })
  loginWindow.loadURL(LOGIN_URL)

  // 只关心「这一次」登录有没有成功：已登录用户重新走一遍登录页再关掉，也应该收掉页面上的等待提示
  let loginSucceeded = false

  // 每 1s 查一次登录态，拿到 uid/cid 即算登录成功（沿用 App 端轮询抓 cookie 的思路）
  cookiePollTimer = setInterval(async () => {
    const auth = await checkLoginCookies()
    if (!auth) {
      return
    }
    stopLoginPolling()
    loginSucceeded = true
    ngaAuth = { uid: auth.uid, cid: auth.cid }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('nga-login-success', auth.cookie)
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
    }
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.close()
    }
  }, 1000)

  loginWindow.on('closed', () => {
    stopLoginPolling()
    loginWindow = null
    // 窗口关掉时如果还没拿到登录态，就是用户主动放弃，通知页面把「正在确认登录状态」收掉
    if (!loginSucceeded && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('nga-login-cancel')
    }
  })
}

// ---------- 外链 ----------
// 帖子里的 <a href> 会直接导航到外站，桌面端必须拦下来交给系统浏览器，否则整个窗口就离开应用了
const EXTERNAL_SCHEMES = ['http:', 'https:', 'mailto:']
// 算作「应用自己」的来源：本地静态服务，dev 模式下再加上 dev server，
// 这些来源的跳转放行，其余一律交给系统浏览器
let appOrigins = []

function isAppUrl(target) {
  try {
    return appOrigins.includes(new URL(target).origin)
  } catch (e) {
    return false
  }
}

function openExternal(target) {
  let url
  try {
    url = new URL(target)
  } catch (e) {
    return
  }
  if (!EXTERNAL_SCHEMES.includes(url.protocol)) {
    return
  }
  shell.openExternal(url.toString()).catch((err) => {
    console.error('打开外部链接失败：', err.message)
  })
}

function guardExternalNavigation(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAppUrl(url)) {
      openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault()
      openExternal(url)
    }
  })
}

// ---------- 窗口状态记忆 ----------
function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState() {
  try {
    const state = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'))
    if (state && Number.isFinite(state.width) && Number.isFinite(state.height)) {
      return state
    }
  } catch (e) {
    // 没存过或文件坏了都走默认尺寸
  }
  return null
}

// 上次关在副屏、副屏又被拔掉时，坐标会落到可视区外，这里拉回主屏
function normalizeBounds(state) {
  if (!state || !Number.isFinite(state.x) || !Number.isFinite(state.y)) {
    return Object.assign({}, DEFAULT_BOUNDS)
  }
  const area = screen.getDisplayMatching(state).workArea
  return {
    x: Math.min(Math.max(state.x, area.x), area.x + area.width - MIN_BOUNDS.width),
    y: Math.min(Math.max(state.y, area.y), area.y + area.height - MIN_BOUNDS.height),
    width: Math.max(state.width, MIN_BOUNDS.width),
    height: Math.max(state.height, MIN_BOUNDS.height)
  }
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) {
    return
  }
  try {
    const bounds = win.getNormalBounds()
    fs.writeFileSync(windowStatePath(), JSON.stringify({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: win.isMaximized()
    }), 'utf8')
  } catch (e) {
    console.error('保存窗口状态失败：', e.message)
  }
}

// ---------- IPC ----------
// preload 在页面加载时同步取接口 base：dev server 下页面 origin 是 dev server，不是代理地址
ipcMain.on('nga-api-base', (event) => {
  event.returnValue = apiBase
})
ipcMain.on('nga-open-login', (event) => {
  mainWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow
  openLoginWindow()
})
// 渲染进程 setAuth 后回传，与抓 cookie 结果互为备份（重启后由渲染进程补推一次）
ipcMain.on('nga-set-auth', (event, auth) => {
  if (auth && auth.uid && auth.cid) {
    ngaAuth = { uid: String(auth.uid), cid: String(auth.cid) }
  }
})
// 退出登录：清内存登录态，并把 NGA 域下的 Cookie 删掉。
// 不删 Cookie 的话，重新打开登录窗口会带着旧登录态直接判定「登录成功」，
// 重启时 restoreAuthFromSession 也会把登录态又恢复回来
ipcMain.on('nga-clear-auth', async () => {
  ngaAuth = { uid: '', cid: '' }
  try {
    const cookies = await session.defaultSession.cookies.get({ url: NGA_HOST })
    await Promise.all(cookies.map((cookie) => session.defaultSession.cookies.remove(NGA_HOST, cookie.name)))
  } catch (e) {
    console.error('清除登录 cookie 失败：', e.message)
  }
})
ipcMain.on('nga-open-external', (event, url) => {
  if (typeof url === 'string') {
    openExternal(url)
  }
})

// ---------- 菜单 ----------
function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '关闭窗口', role: 'close' },
        { type: 'separator' },
        { label: '退出 SNGA', role: 'quit' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '刷新', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.reload() },
        { label: '强制刷新', accelerator: 'CmdOrCtrl+Shift+R', click: () => mainWindow && mainWindow.webContents.reloadIgnoringCache() },
        { type: 'separator' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { label: '恢复默认缩放', role: 'resetZoom' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' },
        { label: '开发者工具', accelerator: 'F12', click: (item, win) => win && win.webContents.toggleDevTools() }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: '打开 NGA 网页版', click: () => openExternal(NGA_HOST) },
        {
          label: '关于 SNGA',
          click: () => {
            dialog.showMessageBox(mainWindow || undefined, {
              type: 'info',
              title: '关于 SNGA',
              message: `SNGA ${app.getVersion()}`,
              detail: `NGA 非官方桌面客户端\nElectron ${process.versions.electron} / Chromium ${process.versions.chrome}\nH5 产物目录：${currentH5Root || '未加载'}`,
              buttons: ['确定']
            })
          }
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---------- 主窗口 ----------
let currentH5Root = ''

function createMainWindow(port, devServerUrl) {
  const state = loadWindowState()
  const bounds = normalizeBounds(state)
  mainWindow = new BrowserWindow(Object.assign({}, bounds, {
    minWidth: MIN_BOUNDS.width,
    minHeight: MIN_BOUNDS.height,
    show: false,
    autoHideMenuBar: true,
    title: 'SNGA',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  }))
  if (state && state.maximized) {
    mainWindow.maximize()
  }
  guardExternalNavigation(mainWindow)
  mainWindow.loadURL(devServerUrl || `http://127.0.0.1:${port}/`)

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
    }
  })
  mainWindow.webContents.on('did-finish-load', () => {
    if (process.env.SNGA_SELFCHECK === '1') {
      try {
        require('./devtools/selfcheck').runSelfCheck(mainWindow)
      } catch (e) {
        console.error('[selfcheck] 加载失败：', e.message)
      }
    }
  })
  // 窗口状态写入频繁（拖动/缩放会连发），节流后再落盘
  let saveTimer = null
  const scheduleSave = () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveWindowState(mainWindow), 400)
  }
  mainWindow.on('resize', scheduleSave)
  mainWindow.on('move', scheduleSave)
  mainWindow.on('close', () => {
    clearTimeout(saveTimer)
    saveWindowState(mainWindow)
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const PLACEHOLDER_HTML = `<!DOCTYPE html><html lang="zh"><meta charset="utf-8">
<title>SNGA</title>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f6f8">
<div style="max-width:420px;color:#20242b">
<h2 style="margin:0 0 12px">尚未构建 H5 产物</h2>
<p style="line-height:1.7">请在 HBuilderX 中打开本项目，执行「发行 → 网站-H5」，产物会输出到
<code>unpackage/dist/build/web</code> 或 <code>unpackage/dist/build/h5</code>，然后重新启动本应用。</p>
</div></body></html>`

function showPlaceholderWindow() {
  console.warn('[SNGA] 未找到 H5 产物，请先在 HBuilderX 发行网站-H5')
  mainWindow = new BrowserWindow({ width: 480, height: 320, autoHideMenuBar: true, title: 'SNGA' })
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PLACEHOLDER_HTML)}`)
}

// 桌面端重复双击图标时聚焦已有窗口，而不是再开一个
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId(APP_USER_MODEL_ID)
    buildMenu()
    await restoreAuthFromSession()

    const devServerUrl = await resolveDevServer()
    const rootDir = findH5Root()
    // dev 模式下页面来自 dev server，没打 H5 产物也能跑
    if (!devServerUrl && !rootDir) {
      showPlaceholderWindow()
      return
    }
    currentH5Root = rootDir || ''
    const server = await startServer(rootDir)
    const port = server.address().port
    apiBase = `http://127.0.0.1:${port}`
    appOrigins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`]
    if (devServerUrl) {
      appOrigins.push(devServerUrl)
    }
    console.log(`[SNGA] 静态服务已启动: ${apiBase}  (H5: ${rootDir || '无，dev 模式'})`)
    if (devServerUrl) {
      console.log(`[SNGA] 页面来自 dev server: ${devServerUrl}（改 pages/utils 会热更新）`)
    }
    createMainWindow(port, devServerUrl)
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
