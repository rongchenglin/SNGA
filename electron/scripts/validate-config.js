// 用 electron-builder 自带校验，提前发现 build 配置里的字段错误（不触发下载/打包）
const path = require('path')
const { validateConfiguration } = require('app-builder-lib/out/util/config/config')
const pkg = require(path.resolve(__dirname, '..', 'package.json'))

const config = Object.assign({}, pkg.build, {
  electronVersion: require('electron/package.json').version
})

validateConfiguration(config)
  .then(() => console.log('OK: build 配置通过 schema 校验'))
  .catch((e) => {
    console.error('FAIL: ' + e.message)
    process.exit(1)
  })