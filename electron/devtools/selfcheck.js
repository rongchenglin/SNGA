const fs = require('fs')
const path = require('path')
const { app } = require('electron')

// 开发时产物写在 electron/ 下方便直接看；打包后 asar 只读，落到用户数据目录
function outputDir() {
  return app.isPackaged ? app.getPath('userData') : path.resolve(__dirname, '..')
}

function runSelfCheck(win) {
  setTimeout(async () => {
    try {
      const report = await win.webContents.executeJavaScript(`(async () => {
        const out = {
          electron: !!window.electronAPI,
          apiBase: (window.electronAPI && window.electronAPI.apiBase) || '',
          title: document.title,
          hash: location.hash,
          text: (document.body ? document.body.innerText : '').slice(0, 120)
        }
        try {
          const ctl = new AbortController()
          const timer = setTimeout(() => ctl.abort(), 6000)
          const r = await fetch((window.electronAPI.apiBase || '') + '/nga-api?__lib=home&__act=category&_v=2', { signal: ctl.signal })
          clearTimeout(timer)
          out.proxyStatus = r.status
          const data = await r.json()
          out.proxyCode = data && data.code
          out.proxyHasResult = !!(data && data.result && data.result.length)
        } catch (e) {
          out.proxyErr = String(e)
        }
        return out
      })()`)

      const dir = outputDir()
      const logPath = path.join(dir, 'selfcheck_out.log')
      const pngPath = path.join(dir, 'selfcheck.png')

      fs.writeFileSync(logPath, '[selfcheck] ' + JSON.stringify(report, null, 2), 'utf8')
      console.log('[selfcheck] ' + JSON.stringify(report, null, 2))

      const img = await win.webContents.capturePage()
      fs.writeFileSync(pngPath, img.toPNG())
      console.log('[selfcheck] 截图已保存: ' + pngPath)
    } catch (e) {
      console.error('[selfcheck] 失败:', e)
    } finally {
      app.quit()
    }
  }, 3500)
}

module.exports = { runSelfCheck }