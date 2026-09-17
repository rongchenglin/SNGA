// 本地阅读历史：进帖子时记一条，按 tid 去重（最近看的在最前），"我的"里可以回看。
// 纯本地存储，不涉及任何接口。
const KEY = 'nga_history'
const MAX = 60

/** 记一条；同一帖子已有记录时更新标题并顶到最前 */
export function addHistory(item) {
	if (!item || !item.tid) {
		return
	}
	const tid = String(item.tid)
	const list = readHistory().filter((row) => String(row.tid) !== tid)
	list.unshift({
		tid,
		subject: item.subject || '',
		time: Date.now()
	})
	uni.setStorageSync(KEY, list.slice(0, MAX))
}

export function readHistory() {
	const list = uni.getStorageSync(KEY)
	return Array.isArray(list) ? list : []
}

export function clearHistory() {
	uni.removeStorageSync(KEY)
}
