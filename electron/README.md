# SNGA Electron 桌面端

把 `nga` 这个 uni-app 项目打好的 H5 产物套一层 Electron 壳，做成 Windows 桌面客户端。

## 前提

H5 产物由 HBuilderX 生成，项目里没有 `@dcloudio/*` 依赖，命令行打不出来：

1. 用 HBuilderX 打开本项目
2. 菜单「发行 → 网站-H5」
3. 产物落在 `unpackage/dist/build/web`（部分版本是 `h5`）

`electron/scripts/prepare-h5.js` 会自动识别这两个目录。

## 命令

在项目根目录执行：

```bash
npm run desktop:install    # 安装 Electron 依赖（首次）
npm run desktop            # 开发运行（直接用 unpackage 下的 H5 产物）
npm run desktop:dev        # 开发运行 + 热更新（连 HBuilderX 的调试服务器）
npm run desktop:selfcheck  # 无头自检，跑完自动退出
npm run desktop:dist       # 打安装包
npm run desktop:pack       # 只打免安装目录（release/win-unpacked，不生成安装器）
```

在 `electron` 目录内等价于 `npm start` / `npm run selfcheck` / `npm run dist`。

## 一边改一边看效果

分两种代码，刷新方式不一样：

- **改 `pages/`、`utils/`、`App.vue`（页面代码）**：可以先在 HBuilderX 里执行
  「运行 → 运行到浏览器」把带 HMR 的调试服务器起起来，然后

  ```bash
  npm run desktop:dev                          # 自动探测端口（8080/8081/8082/5173/3000）
  npm run desktop:dev -- --dev-server=http://localhost:8080   # 端口不固定时手动指定
  ```

  此时窗口加载的是 dev server，改页面代码即时生效，同时仍然有 `window.electronAPI`、
  登录窗口和接口代理，和正式运行环境一致。dev 模式下不需要先打 H5 产物。

- **改 `electron/main.js`、`preload.js`（桌面外壳）**：没有热重载，关掉窗口重新
  `npm run desktop`。

如果只想用普通浏览器看页面（不经过 Electron），登录和接口代理都不可用，
因为浏览器里没有 `window.electronAPI`，拿不到登录 Cookie。

## 打包产物

`npm run desktop:dist` 输出到 `electron/release`：

- `SNGA-1.0.0-setup.exe`：NSIS 安装包，可选安装目录、带桌面和开始菜单快捷方式
- `SNGA-1.0.0-portable.exe`：免安装单文件

打包前会自动执行 `prepare-h5`，把 H5 产物收集到 `electron/h5-dist`，
再由 electron-builder 通过 `extraResources` 放到安装包的 `resources/h5`。
主进程按 `app.isPackaged` 区分：开发读 `unpackage/dist/build/{web,h5}`，打包后读 `resources/h5`。

## 网络

electron-builder 首次打包要从 GitHub 下载 Electron 压缩包、NSIS、winCodeSign。
`electron/package.json` 里已经配了 Electron 的 npmmirror 镜像；如果 NSIS 那部分下载失败，
在 PowerShell 里临时加一个镜像环境变量再跑：

```powershell
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run desktop:dist
```

不需要镜像（或镜像不可用）时，把 `package.json` 的 `build.electronDownload` 整段删掉即可。

## 目录结构

- `main.js`：主进程。静态服务 + NGA 接口代理 + 登录窗口 + 窗口/菜单/外链处理
- `preload.js`：contextBridge 暴露给页面的能力（`window.electronAPI`）
- `devtools/selfcheck.js`：自检脚本，截图和结果写到 `electron/`（打包后写到用户数据目录）
- `scripts/prepare-h5.js`：收集 H5 产物到 `h5-dist`
- `scripts/selfcheck.js`：以 `SNGA_SELFCHECK=1` 拉起应用跑自检
- `build/icon.ico`、`build/icon.png`：应用图标

## 桌面端行为

- **接口代理**：渲染进程请求同源的 `/nga-api`（→ `app_api.php`）和 `/nga-read`（→ `read.php`），
  主进程转发时附加 `X-User-Agent: Nga_Official` 和登录 Cookie，绕开浏览器跨域与 `Cookie` 请求头限制。
  首选端口 8973，被占用时自动退回随机端口。
  代理地址由主进程通过 `nga-api-base` 同步给 preload，所以 `desktop:dev` 下页面来自
  dev server 时接口照样走代理；这条路径是跨域的，服务端已放行 `OPTIONS` 预检。
- **登录**：登录按钮打开一个 NGA 登录子窗口，主进程每秒读一次 session cookie，拿到
  `ngaPassportUid`/`ngaPassportCid` 就算成功，回传渲染进程走统一的 `setAuth` 流程。
  登录态会持久化在 session 里，重启后主进程启动时先读回一次，渲染进程 `App.vue` 的
  `onLaunch` 再补推一次本地存储里的登录态。
- **外链**：帖子正文里的 `<a href>` 和 `target=_blank` 一律交给系统浏览器打开，避免整个窗口跳走。
- **窗口**：默认 480x840，尺寸/位置/最大化状态记在用户数据目录的 `window-state.json`，
  上次关在副屏的坐标会在启动时拉回可视区。
- **单实例**：重复启动只聚焦已有窗口。
- **菜单**：`autoHideMenuBar`，按 Alt 显示；含刷新、缩放、全屏、开发者工具（F12）、关于。
