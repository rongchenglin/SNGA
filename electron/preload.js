// Electron 预加载脚本：以安全方式把主进程能力暴露给页面（contextBridge）
const { contextBridge, ipcRenderer } = require('electron')

// 回调集合在预加载层统一维护，页面每次订阅/退订只改集合，
// 避免来回进页面时往 ipcRenderer 上挂一堆同名监听
const loginCallbacks = new Set()
const cancelCallbacks = new Set()

function dispatch(set, payload) {
  set.forEach((callback) => {
    try {
      callback(payload)
    } catch (error) {
      console.error('登录回调执行失败：', error)
    }
  })
}

ipcRenderer.on('nga-login-success', (event, cookie) => dispatch(loginCallbacks, cookie))
ipcRenderer.on('nga-login-cancel', () => dispatch(cancelCallbacks, null))

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  // 接口代理地址，由主进程给：dev server 模式下页面 origin 是 dev server，不是代理
  apiBase: ipcRenderer.sendSync('nga-api-base'),
  // 打开 NGA 登录子窗口（主进程负责抓 cookie）
  openLogin: () => ipcRenderer.send('nga-open-login'),
  // 登录态回传主进程，用于接口转发时附加 Cookie
  setAuth: (auth) => ipcRenderer.send('nga-set-auth', auth),
  // 退出登录：让主进程清掉内存登录态和 NGA 的 Cookie
  clearAuth: () => ipcRenderer.send('nga-clear-auth'),
  // 订阅登录成功，返回退订函数；页面 onUnload 里调用
  onLoginSuccess: (callback) => {
    loginCallbacks.add(callback)
    return () => loginCallbacks.delete(callback)
  },
  // 用户在登录窗口里放弃登录时触发，同样返回退订函数
  onLoginCancel: (callback) => {
    cancelCallbacks.add(callback)
    return () => cancelCallbacks.delete(callback)
  },
  // 交给系统默认浏览器打开（帖子正文里的外链走这里）
  openExternal: (url) => ipcRenderer.send('nga-open-external', url)
})
