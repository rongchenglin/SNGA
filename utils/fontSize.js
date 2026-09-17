// 阅读字号。
// 只作用于帖子正文页：把比例写成页面根节点的 CSS 变量 --nga-scale，各处正文用 calc 乘上去。
// 纯本地，不涉及接口。
const FONT_KEY = 'nga_font_scale'
const MODES = ['small', 'normal', 'large']
const SCALES = { small: 0.88, normal: 1, large: 1.16 }

/** 三档的名字，界面上用 */
export const FONT_LABELS = {
	small: '小',
	normal: '标准',
	large: '大'
}

export function fontSizeMode() {
	const mode = uni.getStorageSync(FONT_KEY)
	return MODES.indexOf(mode) === -1 ? 'normal' : mode
}

/** 当前字号比例，给页面根节点当 CSS 变量用 */
export function fontScale() {
	return SCALES[fontSizeMode()]
}

export function setFontSizeMode(mode) {
	uni.setStorageSync(FONT_KEY, MODES.indexOf(mode) === -1 ? 'normal' : mode)
}
