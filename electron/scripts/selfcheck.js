// 自检脚本：拉起应用并在页面加载后输出渲染结果，跑完自动退出。
// 用于快速确认 H5 产物、代理转发、登录态注入都正常，不需要人工点界面。
const path = require('path')
const { spawn } = require('child_process')
const electronPath = require('electron')

const child = spawn(electronPath, [path.resolve(__dirname, '..')], {
  env: Object.assign({}, process.env, { SNGA_SELFCHECK: '1' }),
  stdio: 'inherit'
})

child.on('exit', (code) => {
  process.exit(code === null ? 1 : code)
})