import { getAuth } from './auth'

const HOST = 'https://bbs.nga.cn'
// Electron 桌面端由主进程做同源代理：/nga-api -> app_api.php、/nga-read -> read.php，绕开浏览器跨域
function isElectron() {
	return typeof window !== 'undefined' && window.electronAPI && window.electronAPI.apiBase
}
const API_BASE = isElectron()
	? `${window.electronAPI.apiBase}/nga-api`
	: `${HOST}/app_api.php`
const READ_BASE = isElectron()
	? `${window.electronAPI.apiBase}/nga-read`
	: `${HOST}/read.php`
// 个人主页的「主题 / 回复」列表走网页版 thread.php，见 fetchUserActivity
const THREAD_BASE = isElectron()
	? `${window.electronAPI.apiBase}/nga-thread`
	: `${HOST}/thread.php`
// 收藏 / 回复提醒等走 nuke.php（收藏动作、__lib=noti 等）
const NUKE_BASE = isElectron()
	? `${window.electronAPI.apiBase}/nga-nuke`
	: `${HOST}/nuke.php`
// NGA 按客户端身份头决定返回内容：缺了它会把用户名降级成 "UID:<uid>" 并清空 avatar
const CLIENT_HEADERS = {
	'X-User-Agent': 'Nga_Official'
}

function buildCookieHeader() {
	const auth = getAuth()
	if (!auth || !auth.uid || !auth.cid) {
		return ''
	}
	return `ngaPassportUid=${auth.uid}; ngaPassportCid=${auth.cid}`
}

/**
 * 统一发送请求，resolve 原始响应
 * 注意：POST 必须传非空 body，否则 nginx 因缺少 Content-Length 返回 411
 */
function send(url, method, body) {
	return new Promise((resolve, reject) => {
		const cookie = buildCookieHeader()
		const header = Object.assign({}, CLIENT_HEADERS)
		if (cookie) {
			header.Cookie = cookie
		}
		if (body) {
			header['Content-Type'] = 'application/x-www-form-urlencoded'
		}

		const options = {
			url,
			method,
			header,
			success: (res) => resolve(res),
			fail: (err) => reject(new Error(err.errMsg || '网络请求失败'))
		}
		if (body) {
			options.data = body
		}
		uni.request(options)
	})
}

/**
 * 调用返回 { code, msg, result } 的接口（app_api.php 与 thread.php?__output=14 同构）
 * 带 body 时用 POST，否则用 GET
 * 成功时 resolve 整个响应体，失败时 reject 带 message 的 Error
 */
async function requestJson(base, query, body) {
	const res = await send(`${base}?${query}`, body ? 'POST' : 'GET', body)
	const data = res.data
	if (data && data.code === 0) {
		return data
	}
	throw new Error((data && data.msg) || `请求失败（${res.statusCode}）`)
}

export function request(query, body) {
	return requestJson(API_BASE, query, body)
}

export function fetchForumCategory() {
	return request('__lib=home&__act=category&_v=2')
}

/**
 * 板块主题列表
 * 参数只能放在 POST body 里，放 query 会返回「参数错误」
 * orderBy 传 'postdatedesc' 是按发帖时间倒序（最新发布），不传是默认的最新回复
 * 返回 result.data 为主题数组，result.subForum 为子版块
 */
export function fetchTopicList(fid, page, orderBy) {
	let body = `fid=${encodeURIComponent(fid)}&page=${page}`
	if (orderBy) {
		body += `&order_by=${encodeURIComponent(orderBy)}`
	}
	return request('__lib=subject&__act=list', body)
}

/**
 * 帖子楼层列表
 * 参数放 POST body
 * 返回 data.__R 为楼层字典，data.__U 为作者字典（按 authorid）
 * authorid 非空时只返回该用户的楼层（只看某人），响应结构与普通列表一致
 */
export function fetchPostList(tid, page, authorid) {
	let body = `tid=${encodeURIComponent(tid)}&page=${page}`
	if (authorid) {
		body += `&authorid=${encodeURIComponent(authorid)}`
	}
	return request('__lib=post&__act=list', body)
}

/**
 * 用户主题 / 回复列表（个人主页的「查看此人主题 / 回复」）
 * 走网页版 thread.php：authorid 指定用户，reply 为真时加 searchpost=1（ta 回复过的主题）
 * 必须带 __output=14：该端点默认输出 GBK（Content-Type: text/javascript; charset=GBK，
 * 中文是原始 GBK 字节，App 端按 UTF-8 解会乱码），__output=14 返回 UTF-8 JSON
 * 返回 result.__T 为条目数组，result.__T__ROWS 为总条数；
 * 条目含 tid/fid/author/authorid/subject/postdate/replies，parent 是版面信息（可能没有）
 * 回复模式的条目里 __P 是 ta 本人的那层回复（authorid/postdate/content）
 */
export function fetchUserActivity(uid, page, reply) {
	let query = `authorid=${encodeURIComponent(uid)}&page=${page}&noprefix&__output=14`
	if (reply) {
		query += '&searchpost=1'
	}
	return requestJson(THREAD_BASE, query, null)
}

/**
 * 主题搜索（首页搜索入口）
 * 全部主题：key 为关键词、fidgroup=user（跨版面）；与 fetchUserActivity 同一个端点，
 * 同样必须带 __output=14 才能拿到 UTF-8 JSON
 * searchContent 为真时加 content=1，连正文一起搜（实测同一个词命中数 135750 → 403691）
 * 返回 result.__T 为条目数组，字段与板块主题列表一致（无 parent，所以拿不到版面名）
 * 无结果时实测返回 { code: 2048, msg: '没有符合条件的结果' }，调用方要按空结果处理
 * 全部主题搜索传 key + fidgroup=user；key 按 UTF-8 编码后拼接，content 参数控制是否搜正文
 */
export function searchTopic(keyword, page, searchContent) {
	let query = `key=${encodeURIComponent(keyword)}&fidgroup=user&page=${page}&noprefix&__output=14`
	if (searchContent) {
		query += '&content=1'
	}
	return requestJson(THREAD_BASE, query, null)
}

/**
 * 按用户名查 uid（搜索用户的前置步骤）
 * thread.php 的 author=<名字> 只认 GBK 编码（服务端按 GBK 解 URL 参数），
 * JS 端只能生成 UTF-8，实测传 UTF-8 名字会返回「无此用户」，所以改成先查 uid 再用 authorid 搜
 * 游客可用；实测不存在的名字返回 { code: 2048, msg: '找不到用户' }
 */
export function fetchUidByName(username) {
	return request(`__lib=user&__act=detailname&username=${encodeURIComponent(username)}`)
}

/**
 * 收藏 / 取消收藏帖子。两个动作的参数形态不同：
 * - 收藏：POST nuke.php?__lib=topic_favor&lite=js&noprefix&__act=topic_favor&action=add&tid=<tid>
 *   （参数在 query，body 空）
 * - 取消：POST nuke.php，表单 body 为
 *   __lib=topic_favor&__act=topic_favor&__output=8&action=del&page=1&tidarray=<tid>
 *   注意字段名是 tidarray 且要带 page，不是 tid —— 写成 tid 会静默失败（踩过）
 * 响应用 __output=8（GBK），中文提示在 JS 端解不出来，所以不看响应文案，
 * 成败一律由调用方重拉收藏夹列表核对
 */
export function toggleFavorite(tid, favor) {
	if (favor) {
		const query = `__lib=topic_favor&lite=js&noprefix&__act=topic_favor&action=add&tid=${encodeURIComponent(tid)}`
		return send(`${NUKE_BASE}?${query}`, 'POST', null)
	}
	const body = `__lib=topic_favor&__act=topic_favor&__output=8&action=del&page=1&tidarray=${encodeURIComponent(tid)}`
	return send(NUKE_BASE, 'POST', body)
}

/**
 * 我的收藏帖子列表
 * 走 thread.php?favor=1，返回结构与板块主题列表一致（result.__T 数组）
 * 需登录；走 THREAD_BASE 通道，必须带 __output=14 才是 UTF-8
 */
export function fetchFavorites(page) {
	return requestJson(THREAD_BASE, `favor=1&page=${page}&noprefix&__output=14`, null)
}

/**
 * 回复提醒（最近被回复 + 短消息）
 * 列表：nuke.php?__lib=noti&__act=get_all；清空：__act=del；需登录
 * __output 用 14 尽量拿 UTF-8（8 是 GBK，JS 端解不出来）
 * 返回结构：
 *   { data: { "0": { "0": [被喷条目], "1": [短消息条目], unread } } }
 *   每条是数组 [type, uid, 用户名, , 标题, tid, pid/pid2, 时间戳]（下标见下）
 */
export function fetchNotifications() {
	return send(`${NUKE_BASE}?__lib=noti&__output=14&__act=get_all`, 'GET', null).then((res) => {
		const data = res.data
		if (data && typeof data === 'object' && data.msg) {
			throw new Error(data.msg)
		}
		return data
	})
}

export function clearNotifications() {
	return send(`${NUKE_BASE}?__lib=noti&raw=3&__act=del`, 'POST', null).then((res) => {
		const data = res.data
		if (data && typeof data === 'object' && data.msg) {
			throw new Error(data.msg)
		}
		return data
	})
}

/**
 * 用户资料
 * 返回 result 为用户对象：uid/username/group/avatar/posts/money/rvrc/regdate/ipLoc/honor/signature…
 */
export function fetchUserProfile(uid) {
	return request(`__lib=user&__act=detail&uid=${encodeURIComponent(uid)}`)
}

/**
 * 读取单楼原文（折叠引用展开用）。
 * 走 read.php 而不是 app_api.php，响应结构与帖子楼层列表一致：
 * 返回 data.__R 为楼层字典（键为字符串序号），data.__U 为作者字典（按 authorid）。
 * 参数必须放进 query；tid+pid 二者至少给一个。
 */
export function fetchPostByPid(tid, pid) {
	let query = 'page=1&__output=8&noprefix&v2'
	if (tid != null && tid !== '') {
		query += `&tid=${encodeURIComponent(tid)}`
	}
	if (pid != null && pid !== '') {
		query += `&pid=${encodeURIComponent(pid)}`
	}
	return send(`${READ_BASE}?${query}`, 'GET', null).then((res) => {
		const data = res.data
		// 无 code 字段；接口错误时会返回带 msg 的对象
		if (data && typeof data === 'object' && data.msg) {
			throw new Error(data.msg)
		}
		return data
	})
}

