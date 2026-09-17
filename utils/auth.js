import { decodeNgaText } from './user'
// #ifdef APP-HARMONY
// 鸿蒙没有 plus，写 cookie 只能走这支 UTS 插件（WebCookieManager）
import { getWebviewCookie, setWebviewCookie, clearWebviewCookies } from '@/uni_modules/uts-webview-cookie'
// #endif

const AUTH_STORAGE_KEY = 'nga_auth'

export function getAuth() {
	try {
		return uni.getStorageSync(AUTH_STORAGE_KEY) || null
	} catch (error) {
		return null
	}
}

export function setAuth(auth) {
	uni.setStorageSync(AUTH_STORAGE_KEY, {
		uid: String(auth.uid),
		cid: auth.cid,
		cookie: auth.cookie,
		loginAt: Date.now()
	})
	// #ifdef H5
	// Electron 桌面端：同步登录态给主进程，供接口转发时附加 Cookie
	if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.setAuth) {
		window.electronAPI.setAuth({ uid: String(auth.uid), cid: auth.cid })
	}
	// #endif
}

// 退出登录时把网页登录留下的 NGA Cookie 一并清掉。
// 不清的话：登录页是轮询系统 WebView 的 Cookie 判断登录成功的，再次进登录页会立刻读到旧
// Cookie，表现成「没输密码就直接登录成功了」（而且用的还是旧账号）。
// 注意 plus.navigator.removeAllCookie 在部分安卓机型上不生效，所以按域名把两个 token 置成过期。
function clearNgaCookies() {
	// #ifdef APP-PLUS
	// 安卓：没有 UTS 插件的卸载能力，用 plus.navigator.setCookie 把两个 token 置成过期。
	// 注意 plus.navigator.removeAllCookie 在部分安卓机型上不生效，所以按域名精确清。
	const expired = 'path=/; domain=.nga.cn; expires=Thu, 01 Jan 1970 00:00:00 GMT'
	;['ngaPassportUid', 'ngaPassportCid'].forEach((name) => {
		try {
			plus.navigator.setCookie('https://bbs.nga.cn', `${name}=; ${expired}`)
		} catch (error) {
			console.error('清除 NGA 登录 Cookie 失败：', name, error)
		}
	})
	// #endif
	// #ifdef APP-HARMONY
	// 鸿蒙没有 plus，走 UTS 插件的 setWebviewCookie（内部是 WebCookieManager.configCookie）。
	// value 要写完整的 Set-Cookie：空 value（name=）会被系统按 RFC 6265 拒成 17100005，
	// 而 NGA 的 token 是 HttpOnly，value 里不带 HttpOnly 也覆盖不掉。
	// configCookie 是按 host+path+name 精确覆盖的，属性对不上不会报错、只是静默不生效，
	// 所以写完回读一次校验，发现 token 还在就整个清空兜底。
	const names = ['ngaPassportUid', 'ngaPassportCid']
	names.forEach((name) => {
		setWebviewCookie({
			url: 'https://bbs.nga.cn',
			cookie: `${name}=deleted; Path=/; Domain=.nga.cn; HttpOnly; Secure; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
		})
	})
	getWebviewCookie({
		url: 'https://bbs.nga.cn',
		success: (res) => {
			const cookie = res.cookie || ''
			// fetchCookie 在一条 cookie 都没有时会直接失败（17100002），所以只有回读到 token 才需要兜底
			if (names.some((name) => cookie.indexOf(`${name}=`) !== -1)) {
				// 兜底是同步 native 调用（内部没写 try/catch，ArkTS 不支持带类型的 catch），
				// 这里兜住异常，别让它把退出登录流程带崩
				try {
					clearWebviewCookies()
				} catch (error) {
					console.error('清空 webview cookie 失败', error)
				}
			}
		}
	})
	// #endif
}

export function clearAuth() {
	uni.removeStorageSync(AUTH_STORAGE_KEY)
	// #ifdef H5
	// Electron：登录态和 Cookie 都握在主进程手里，只清本地会让接口继续带着旧 Cookie 请求，
	// 重启时主进程还会从 Cookie 把登录态恢复回来
	if (typeof window !== 'undefined' && window.electronAPI && window.electronAPI.clearAuth) {
		window.electronAPI.clearAuth()
	}
	// #endif
	clearNgaCookies()
}

const USER_NAME_KEY = 'ngaPassportUrlencodedUname='

/**
 * 登录时抓到的 Cookie 里带了 URL 编码的用户名（ngaPassportUrlencodedUname）
 * 取不到或解不出来返回空串，由调用方兜底
 */
export function getUserName() {
	const auth = getAuth()
	const cookie = (auth && auth.cookie) || ''
	const item = cookie
		.split(';')
		.map((part) => part.trim())
		.find((part) => part.indexOf(USER_NAME_KEY) === 0)
	return item ? decodeNgaText(item.slice(USER_NAME_KEY.length)) : ''
}

export function isLoggedIn() {
	const auth = getAuth()
	return Boolean(auth && auth.uid && auth.cid)
}
