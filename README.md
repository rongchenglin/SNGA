# SNGA

非官方的 NGA 论坛客户端。uni-app（Vue 3）一套代码，跑 Android / HarmonyOS / Windows 桌面。

## 功能

- 板块主题列表、24 小时热帖
- 楼层阅读：只看楼主、只看某人、跳页、折叠引用展开、图片点击看大图
- 搜索（主题 / 正文）、收藏、回复提醒、个人主页与 ta 的主题/回复、阅读历史、按链接打开
- 正文 BBCode 转 rich-text：表情、表格、`[noimg]` 附件、图床域名归一化
- 主题三态：跟随系统 / 浅色 / 深色

只做浏览和收藏，没有发帖、回帖、评分。

## 平台

| 平台 | 说明 |
| --- | --- |
| Android | HBuilderX 运行到手机或云打包 |
| HarmonyOS | HBuilderX 运行到鸿蒙；cookie 读写走 `uni_modules/uts-webview-cookie`（WebCookieManager / CookieManager） |
| Windows | H5 产物套 Electron 壳，登录态与接口代理都在主进程，详见 [electron/README.md](electron/README.md) |
| H5 | 只用于 Electron 壳与调试，浏览器里直接打开拿不到登录态 |

## 登录

在 App 内置网页里登录，登录页轮询系统 WebView 的 cookie，拿到 `ngaPassportUid` / `ngaPassportCid` 即算成功，存本地后由请求带上。退出登录会把网页登录留下的 cookie 一并清掉，否则再进登录页会直接判定已登录。

请求统一带 `X-User-Agent: Nga_Official`：缺这个头，NGA 会把用户名降级成 `UID:<uid>` 并清空头像。

## 开发

用 HBuilderX 打开项目直接运行，命令行不出 App 产物。

- 打鸿蒙包前要在 `manifest.json` 的 `app-harmony.distribute.signingConfigs` 里填签名口令（仓库里是空的）
- 桌面端：`npm run desktop:install` → `npm run desktop`（开发）/ `npm run desktop:dist`（打安装包）

## 目录

| 路径 | 内容 |
| --- | --- |
| `pages/` | 首页、搜索、登录、板块、帖子、个人相关页面 |
| `utils/` | 接口、BBCode 渲染、登录态、主题、历史与收藏缓存 |
| `uni_modules/uts-webview-cookie/` | 读写系统 webview cookie 的 UTS 插件（鸿蒙 / 安卓） |
| `electron/` | 桌面端外壳 |
| `api.md` | 用到的 NGA AppAPI 接口清单 |

## 说明

接口都来自 NGA 官方 App 使用的端点，实现细节见 `api.md`。项目与 NGA 官方无关，仅供学习交流。
