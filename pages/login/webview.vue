<template>
	<view class="webview-page" :class="themeClass">
		<!-- #ifdef APP-PLUS || APP-HARMONY -->
		<web-view class="webview" :src="loginUrl"></web-view>
		<!-- #endif -->

		<!-- #ifndef APP-PLUS -->
		<!-- #ifndef APP-HARMONY -->
		<view class="unsupported">
			<template v-if="isDesktop">
				<text class="unsupported-title">请在登录窗口中完成登录</text>
				<text class="unsupported-text">登录窗口关掉后可以点下面的按钮重新打开。</text>
				<button class="unsupported-btn" @click="startElectronLogin">重新打开登录窗口</button>
			</template>
			<template v-else>
				<text class="unsupported-title">请使用 App 登录</text>
				<text class="unsupported-text">NGA 网页登录需要在 App 的内置网页中完成。</text>
			</template>
		</view>
		<!-- #endif -->
		<!-- #endif -->

		<view v-if="checking" class="checking">
			<text>正在确认登录状态...</text>
		</view>
	</view>
</template>

<script>
	import { setAuth } from '../../utils/auth'
	// #ifdef APP-PLUS || APP-HARMONY
	import { getWebviewCookie } from '@/uni_modules/uts-webview-cookie'
	// #endif

	import { syncTheme } from '../../utils/theme'

	export default {
		data() {
			return {
				loginUrl: 'https://bbs.nga.cn/nuke.php?__lib=login&__act=account&login',
				cookieUrl: 'https://bbs.nga.cn',
				themeClass: '',
				pollTimer: null,
				checking: false,
				fetching: false,
				// Electron 登录事件的退订函数，onUnload 调用
				offLoginSuccess: null,
				offLoginCancel: null
			}
		},
		computed: {
			// 同一份 H5 产物既跑在 Electron 里也跑在手机浏览器里，用来区分提示文案
			isDesktop() {
				return typeof window !== 'undefined' && Boolean(window.electronAPI)
			}
		},
		onShow() {
			this.themeClass = syncTheme()
		},
		onLoad() {
			// #ifdef APP-PLUS || APP-HARMONY
			this.startCookiePolling()
			// #endif
			// #ifdef H5
			// Electron 桌面端：由主进程开登录窗口抓 cookie，回传后走统一的 onCookieRead
			if (typeof window !== 'undefined' && window.electronAPI) {
				this.startElectronLogin()
			}
			// #endif
		},
		onUnload() {
			this.stopCookiePolling()
			this.stopElectronLogin()
		},
		methods: {
			// Electron 桌面端登录：打开主进程登录子窗口，抓 cookie 成功后回传全串
			startElectronLogin() {
				this.checking = true
				window.electronAPI.openLogin()
				// 来回切页面会重复订阅，退订函数留着 onUnload 调，避免回调堆叠
				this.offLoginSuccess = window.electronAPI.onLoginSuccess((cookie) => {
					this.onCookieRead(cookie)
				})
				this.offLoginCancel = window.electronAPI.onLoginCancel(() => {
					// 关掉登录窗口就是放弃登录，收掉提示，别一直停在「正在确认登录状态」
					this.checking = false
				})
			},
			stopElectronLogin() {
				if (this.offLoginSuccess) {
					this.offLoginSuccess()
					this.offLoginSuccess = null
				}
				if (this.offLoginCancel) {
					this.offLoginCancel()
					this.offLoginCancel = null
				}
			},
			startCookiePolling() {
				this.checkCookie()
				this.pollTimer = setInterval(() => {
					this.checkCookie()
				}, 1000)
			},
			stopCookiePolling() {
				if (this.pollTimer) {
					clearInterval(this.pollTimer)
					this.pollTimer = null
				}
			},
			checkCookie() {
				if (this.checking || this.fetching) {
					return
				}

				// 两个 App 平台都用 UTS 插件读系统 webview 的 cookie（鸿蒙 WebCookieManager / 安卓 CookieManager）
				this.fetching = true
				getWebviewCookie({
					url: this.cookieUrl,
					success: (res) => {
						this.onCookieRead(res.cookie || '')
					},
					fail: (err) => {
						console.error('读取 NGA 登录 Cookie 失败', err.errMsg)
						this.onCookieRead(this.readCookieFallback())
					},
					complete: () => {
						this.fetching = false
					}
				})
			},
			// 安卓上用 HBuilderX 标准基座时插件不生效（跳过了自定义基座/打包），退回 plus 的读取
			readCookieFallback() {
				// #ifdef APP-PLUS
				try {
					return plus.navigator.getCookie(this.cookieUrl) || ''
				} catch (error) {
					return ''
				}
				// #endif
				// #ifndef APP-PLUS
				return ''
				// #endif
			},
			onCookieRead(cookie) {
				try {
					const uid = this.readCookie(cookie, 'ngaPassportUid')
					const cid = this.readCookie(cookie, 'ngaPassportCid')

					if (!uid || !cid) {
						return
					}

					this.checking = true
					setAuth({ uid, cid, cookie })
					this.stopCookiePolling()
					uni.showToast({
						title: '登录成功',
						icon: 'success'
					})
					setTimeout(() => {
						uni.reLaunch({
							url: '/pages/index/index'
						})
					}, 350)
				} catch (error) {
					console.error('读取 NGA 登录 Cookie 失败', error)
				}
			},
			readCookie(cookie, name) {
				const item = cookie
					.split(';')
					.map(part => part.trim())
					.find(part => part.indexOf(`${name}=`) === 0)

				return item ? decodeURIComponent(item.slice(name.length + 1)) : ''
			}
		}
	}
</script>

<style>
	.webview-page {
		position: relative;
		height: 100vh;
		background: var(--nga-bg);
	}

	.webview {
		width: 100%;
		height: 100%;
	}

	.unsupported {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		padding: 48rpx;
		box-sizing: border-box;
	}

	.unsupported-title {
		color: var(--nga-text);
		font-size: 36rpx;
		font-weight: 600;
	}

	.unsupported-text {
		margin-top: 20rpx;
		color: var(--nga-text-muted);
		font-size: 28rpx;
		text-align: center;
		line-height: 1.6;
	}

	.unsupported-btn {
		margin-top: 40rpx;
		padding: 0 44rpx;
		border: 1rpx solid var(--nga-border);
		border-radius: 8rpx;
		background: var(--nga-card);
		color: var(--nga-accent);
		font-size: 28rpx;
		line-height: 68rpx;
	}

	.unsupported-btn::after {
		border: none;
	}

	.checking {
		position: absolute;
		left: 50%;
		bottom: 48rpx;
		transform: translateX(-50%);
		padding: 18rpx 28rpx;
		border-radius: 10rpx;
		background: rgba(32, 36, 43, 0.88);
		color: #fff;
		font-size: 24rpx;
		white-space: nowrap;
	}
</style>
