<script>
	import { getAuth } from './utils/auth'
	import { syncTheme, themeMode } from './utils/theme'

	export default {
		onLaunch: function() {
			// #ifdef H5
			// Electron 桌面端：登录态存在本地存储里，重启后主进程是空的，
			// 这里补推一次，否则接口转发带不上 Cookie，界面会退回未登录
			if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.setAuth) {
				const auth = getAuth()
				if (auth && auth.uid && auth.cid) {
					window.electronAPI.setAuth({ uid: auth.uid, cid: auth.cid })
				}
			}
			// #endif
			// 系统深浅色变化时，若当前是「跟随系统」，就地刷新当前页面的配色
			if (typeof uni.onThemeChange === 'function') {
				uni.onThemeChange(() => {
					if (themeMode() !== 'auto') {
						return
					}
					const pages = getCurrentPages()
					const current = pages[pages.length - 1]
					const vm = current && (current.$vm || current)
					if (vm) {
						vm.themeClass = syncTheme()
					}
				})
			}
			console.log('App Launch')
		},
		onShow: function() {
			console.log('App Show')
		},
		onHide: function() {
			console.log('App Hide')
		}
	}
</script>

<style>
	/* 主题变量：各页面统一用 var(--nga-*) 取色 */
	/* page 与 :root 双写，避免个别平台 page 选择器不生效导致变量取不到 */
	page,
	:root {
		--nga-bg: #f5f6f8;
		--nga-card: #ffffff;
		--nga-fill: #eef1f5;
		--nga-line: #f0f2f5;
		--nga-border: #d8dde5;
		--nga-text: #20242b;
		--nga-text-sub: #5e6876;
		--nga-text-muted: #8b96a5;
		--nga-text-faint: #a3acb9;
		--nga-accent: #2b6cb0;
		--nga-danger: #d94c4c;
		--nga-danger-line: #f0c9c9;
		--nga-shadow: rgba(32, 36, 43, 0.05);
	}

	/* 页面根节点挂 .theme-dark 时覆盖成深色取值（class 优先级高于 page） */
	.theme-dark {
		--nga-bg: #14161a;
		--nga-card: #1f232a;
		--nga-fill: #262b33;
		--nga-line: #2a2f38;
		--nga-border: #333a45;
		--nga-text: #e6e9ee;
		--nga-text-sub: #aeb6c2;
		--nga-text-muted: #7f8896;
		--nga-text-faint: #666f7d;
		--nga-accent: #6aa9e9;
		--nga-danger: #e57373;
		--nga-danger-line: #4a2a2a;
		--nga-shadow: rgba(0, 0, 0, 0.5);
	}
</style>
