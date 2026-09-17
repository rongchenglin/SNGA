const THEME_KEY = 'nga_theme'
// auto 跟随系统；light / dark 是手动指定
const MODES = ['auto', 'light', 'dark']
// 按钮上显示的模式名
export const MODE_LABELS = {
	auto: '跟随系统',
	light: '日间',
	dark: '夜间'
}

/**
 * 当前主题模式：auto（跟随系统）/ light / dark
 * 没存过或存了非法值都按 auto 处理；老版本只存过 light/dark，继续沿用
 */
export function themeMode() {
	const mode = uni.getStorageSync(THEME_KEY)
	return MODES.indexOf(mode) === -1 ? 'auto' : mode
}

// 系统当前是不是深色：H5 有 matchMedia 可以直接问；App 读 osTheme
// （App 端要拿到系统主题需开启 uni 的暗黑模式配置，没开时取不到就按浅色处理）
function systemDark() {
	try {
		if (typeof window !== 'undefined' && window.matchMedia) {
			return window.matchMedia('(prefers-color-scheme: dark)').matches
		}
		return uni.getSystemInfoSync().osTheme === 'dark'
	} catch (error) {
		return false
	}
}

export function isDark() {
	const mode = themeMode()
	if (mode === 'auto') {
		return systemDark()
	}
	return mode === 'dark'
}

/**
 * 页面 onShow 调用：同步根节点 class、原生导航栏配色和文档 color-scheme
 * 返回要挂到页面根节点的 class（浅色返回空串，走 App.vue 里的默认变量）
 */
export function syncTheme() {
	const dark = isDark()
	uni.setNavigationBarColor(dark
		? { frontColor: '#ffffff', backgroundColor: '#1f232a' }
		: { frontColor: '#000000', backgroundColor: '#f8f8f8' })
	// color-scheme 影响浏览器自己绘制的部分（滚动条、表单控件），也避免系统强制反色
	if (typeof document !== 'undefined' && document.documentElement) {
		document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
	}
	return dark ? 'theme-dark' : ''
}

/**
 * 首页按钮：跟随系统 -> 日间 -> 夜间 -> 跟随系统 循环，返回切换后的模式
 * （换模式后再调一次 syncTheme() 就能拿到新的根节点 class）
 */
export function switchTheme() {
	const next = MODES[(MODES.indexOf(themeMode()) + 1) % MODES.length]
	uni.setStorageSync(THEME_KEY, next)
	return next
}
