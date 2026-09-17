// 帖子收藏状态。
// NGA 没有「查单帖是否已收藏」的接口：帖子列表接口（app_api 的 __lib=post&__act=list）
// 里既没有 favor 字段，html_body_extra 也是空的，只能做单向收藏。
// 所以这里只能拉「我的收藏」列表来比对 tid，并做一层内存缓存，避免每进一个帖子都请求一次。
import { fetchFavorites } from './api'

// 缓存有效期：收藏夹变动不频繁，5 分钟内复用
const MAX_AGE = 5 * 60 * 1000
// 只比对收藏夹第一页（约几十条，按收藏时间倒序，最近收藏的都在里面）
const PAGES = 1

let ids = null
let fetchedAt = 0
let pending = null
// 收藏状态被改过（详情页收藏/取消后置位），收藏夹列表据此决定回到前台时要不要重拉
let changed = false

/** 详情页收藏 / 取消成功后调用 */
export function markFavoriteChanged() {
	changed = true
}

/** 收藏夹页取用一次：返回期间是否改动过，并清零 */
export function consumeFavoriteChanged() {
	const value = changed
	changed = false
	return value
}

/** 取缓存里的收藏 tid 集合，过期或没拉过返回 null */
function cachedFavoriteIds() {
	if (ids && Date.now() - fetchedAt < MAX_AGE) {
		return ids
	}
	return null
}

/** 拉收藏夹首页得到 tid 集合（有缓存直接用；force 为真则重新拉；带防重入） */
export function loadFavoriteIds(force) {
	if (!force) {
		const cached = cachedFavoriteIds()
		if (cached) {
			return Promise.resolve(cached)
		}
	}
	if (pending) {
		return pending
	}
	const tasks = []
	for (let page = 1; page <= PAGES; page += 1) {
		tasks.push(fetchFavorites(page))
	}
	pending = Promise.all(tasks)
		.then((results) => {
			const set = new Set()
			results.forEach((body) => {
				const rows = (body.result && body.result.__T) || []
				rows.forEach((row) => {
					if (row && row.tid != null) {
						set.add(String(row.tid))
					}
				})
			})
			ids = set
			fetchedAt = Date.now()
			return ids
		})
		.finally(() => {
			pending = null
		})
	return pending
}
