// 用户字段解析，与 NGA 各接口返回的 author / result 对象保持一致

// 历史图床域名，与 utils/bbcode.js 的归一化规则一致（保留 img 编号只换后缀）
const LEGACY_HOST = /^https?:\/\/img(\d*)\.(?:nga\.178\.com|ngacn\.cc)/i

/**
 * avatar 字段可能是纯图片地址，也可能是内嵌地址的 JSON 片段
 * （形如 { "t":1,"l":2,"0":{ "0":"http://..."}}），取其中第一个 http 地址
 */
export function avatarUrl(raw) {
	if (typeof raw !== 'string') {
		return ''
	}
	const start = raw.indexOf('http')
	if (start === -1) {
		return ''
	}
	const end = raw.indexOf('"', start)
	const url = end === -1 ? raw.slice(start) : raw.slice(start, end)
	return url.replace(LEGACY_HOST, 'https://img$1.nga.cn')
}

/**
 * NGA 是 GBK 站点，用户名这类字段有时是 %XX 百分号编码的 GBK 字节
 * （资料接口 user&__act=detail 的 username 就是这样），有时是被按单字节解出来的字符。
 * 统一还原成可显示文本：
 * - 已经是正常文本（含多字节字符）→ 原样返回
 * - 含替换符 \uFFFD（之前解坏过）→ 返回空串，交给调用方兜底
 */
export function decodeNgaText(value) {
	if (typeof value !== 'string' || !value) {
		return ''
	}
	if (value.indexOf('\uFFFD') !== -1) {
		return ''
	}
	// 含非单字节字符，说明已经是正常文本
	if (/[^\u0000-\u00ff]/.test(value)) {
		return value
	}

	// 剥掉百分号编码，得到「一字符一字节」的中间态
	let text = value
	if (/%[0-9A-Fa-f]{2}/.test(text)) {
		let percentDecoded = ''
		for (let i = 0; i < text.length; i += 1) {
			const hex = text.slice(i + 1, i + 3)
			if (text[i] === '%' && /^[0-9A-Fa-f]{2}$/.test(hex)) {
				percentDecoded += String.fromCharCode(parseInt(hex, 16))
				i += 2
			} else {
				percentDecoded += text[i]
			}
		}
		text = percentDecoded
		if (/[^\u0000-\u00ff]/.test(text)) {
			return text
		}
	}

	let highByte = 0
	const bytes = new Uint8Array(text.length)
	for (let i = 0; i < text.length; i += 1) {
		const code = text.charCodeAt(i)
		if (code >= 0x80) {
			highByte += 1
		}
		bytes[i] = code
	}
	if (!highByte) {
		return text
	}
	if (typeof TextDecoder === 'undefined') {
		return ''
	}

	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
	} catch (error) {
		// 不是合法 UTF-8，按站点编码 GBK 解
	}
	try {
		const decoded = new TextDecoder('gbk').decode(bytes)
		return decoded.indexOf('\uFFFD') === -1 ? decoded : ''
	} catch (error) {
		return ''
	}
}
