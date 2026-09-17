// 把 HBuilderX 打出的 H5 产物收集到 electron/h5-dist，
// 再由 electron-builder 通过 extraResources 放进安装包（resources/h5）。
// HBuilderX 不同版本输出目录可能是 web 或 h5，这里统一收口，打包配置只认 h5-dist。
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..', '..')
const candidates = [
  path.join(projectRoot, 'unpackage', 'dist', 'build', 'web'),
  path.join(projectRoot, 'unpackage', 'dist', 'build', 'h5')
]
const target = path.resolve(__dirname, '..', 'h5-dist')

const source = candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html')))

if (!source) {
  console.error('[prepare-h5] 找不到 H5 产物。')
  console.error('[prepare-h5] 请先在 HBuilderX 中打开本项目，执行「发行 → 网站-H5」。')
  console.error('[prepare-h5] 已查找：')
  candidates.forEach((dir) => console.error('  - ' + dir))
  process.exit(1)
}

fs.rmSync(target, { recursive: true, force: true })
fs.cpSync(source, target, { recursive: true })

if (!fs.existsSync(path.join(target, 'index.html'))) {
  console.error('[prepare-h5] 产物收集失败：' + target + ' 下没有 index.html')
  process.exit(1)
}

console.log('[prepare-h5] ' + source + ' -> ' + target)