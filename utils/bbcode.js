// 楼层内容（BBCode + 少量 HTML 混合）转成 rich-text 可渲染的 HTML。
// 表情映射见 EMOTICON_DATA，与渲染环境相关的取舍见文件末尾。

const NGA_HOST = 'https://bbs.nga.cn/'
export const EMOTICON_BASE = 'https://img4.nga.cn/ngabbs/post/smile/'
// 附件族只有 img.nga.cn / img9.nga.cn 提供，表情族的 img4 对该路径 404，故两者分开
const ATTACH_BASE = 'https://img.nga.cn/attachments'
const LEGACY_IMAGE_HOST = 'img(\\d*)\\.(?:nga\\.178\\.com|ngacn\\.cc)'
// NGA 的缩略图地址是原图地址拼后缀，如 xxx.jpg.thumb.jpg
const THUMB_SUFFIX = '\\.(png|jpg|jpeg|gif)\\.(thumb_s|medium|thumb|thumb_ss)\\.jpg$'

const END_DIV = '</div>'
const LINK_STYLE = 'font-weight:bold;color:#3181f4'
const ALIGN_STYLE = 'text-align:'
const CELL_STYLE = 'border-left:1px solid #aaa;border-bottom:1px solid #aaa'
// rich-text 不会加载页面 CSS，引用 / 代码块样式必须内联，而内联样式拿不到 --nga-* 主题变量，
// 所以只能选一组「浅色、夜间都成立」的颜色：用类夜间强调色 #6aa9e9 的低透明度蓝，
// 浅色底上是极浅的蓝灰，夜间底上是深蓝灰，两边都能一眼看出是引用，也省了另配文字颜色。
const QUOTE_OPEN =
	"<div style='background:rgba(106,169,233,0.10);border-left:3px solid rgba(106,169,233,0.55);padding:8px 12px;margin:0 0 10px 0'>"
const CODE_OPEN = QUOTE_OPEN + 'Code:'
const COLLAPSE_STYLE = 'border:1px solid #888;padding:5px;margin:5px 0 0 0'
const LESSER_NUKE_OPEN =
	"<div style='border:1px solid #B63F32;margin:10px;padding:10px'><span style='color:#EE8A9E'>用户因此贴被暂时禁言，此效果不会累加</span><br/>"

// 表情名 -> 文件名，形如 `ac15.png`。分类内表情名唯一，故可直接扁平化。
const EMOTICON_DATA = {
	ac: 'blink=ac0.png,goodjob=ac1.png,上=ac2.png,中枪=ac3.png,偷笑=ac4.png,冷=ac5.png,凌乱=ac6.png,吓=ac8.png,吻=ac9.png,呆=ac10.png,咦=ac11.png,哦=ac12.png,哭=ac13.png,哭1=ac14.png,哭笑=ac15.png,喘=ac17.png,心=ac23.png,囧=ac21.png,晕=ac33.png,汗=ac34.png,瞎=ac35.png,羞=ac36.png,羡慕=ac37.png,委屈=ac22.png,忧伤=ac24.png,怒=ac25.png,怕=ac26.png,惊=ac27.png,愁=ac28.png,抓狂=ac29.png,哼=ac16.png,喷=ac18.png,嘲笑=ac19.png,嘲笑1=ac20.png,抠鼻=ac30.png,无语=ac32.png,衰=ac40.png,黑枪=ac44.png,花痴=ac38.png,闪光=ac43.png,擦汗=ac31.png,茶=ac39.png,计划通=ac41.png,反对=ac7.png,赞同=ac42.png',
	a2: 'goodjob=a2_02.png,诶嘿=a2_05.png,偷笑=a2_03.png,怒=a2_04.png,笑=a2_07.png,那个…=a2_08.png,哦嗬嗬嗬=a2_09.png,舔=a2_10.png,鬼脸=a2_14.png,冷=a2_16.png,大哭=a2_15.png,哭=a2_17.png,恨=a2_21.png,中枪=a2_23.png,囧=a2_24.png,你看看你=a2_25.png,doge=a2_27.png,自戳双目=a2_28.png,偷吃=a2_30.png,冷笑=a2_31.png,壁咚=a2_32.png,不活了=a2_33.png,不明觉厉=a2_36.png,是在下输了=a2_51.png,你为猴这么=a2_53.png,干杯=a2_54.png,干杯2=a2_55.png,异议=a2_47.png,认真=a2_48.png,你已经死了=a2_45.png,你这种人…=a2_49.png,妮可妮可妮=a2_18.png,惊=a2_19.png,抢镜头=a2_52.png,yes=a2_26.png,有何贵干=a2_11.png,病娇=a2_12.png,lucky=a2_13.png,poi=a2_20.png,囧2=a2_22.png,威吓=a2_42.png,jojo立=a2_37.png,jojo立2=a2_38.png,jojo立3=a2_39.png,jojo立4=a2_41.png,jojo立5=a2_40.png',
	ng: '呲牙笑=ng_1.png,奸笑=ng_2.png,问号=ng_3.png,茶=ng_4.png,笑指=ng_5.png,燃尽=ng_6.png,晕=ng_7.png,扇笑=ng_8.png,寄=ng_9.png,别急=ng_10.png,doge=ng_11.png,丧=ng_12.png,汗=ng_13.png,叹气=ng_15.png,吃饼=ng_16.png,吃瓜=ng_17.png,吐舌=ng_18.png,哭=ng_19.png,喘=ng_20.png,心=ng_21.png,喷=ng_22.png,困=ng_24.png,大哭=ng_25.png,大惊=ng_26.png,害怕=ng_27.png,惊=ng_28.png,暴怒=ng_30.png,气愤=ng_31.png,热=ng_32.png,瓜不熟=ng_33.png,瞎=ng_34.png,色=ng_35.png,斜眼=ng_37.png,问号大=ng_38.png',
	pg: '战斗力=pg01.png,哈啤=pg02.png,满分=pg03.png,衰=pg04.png,拒绝=pg05.png,心=pg06.png,严肃=pg07.png,吃瓜=pg08.png,嘣=pg09.png,嘣2=pg10.png,冻=pg11.png,谢=pg12.png,哭=pg13.png,响指=pg14.png,转身=pg15.png',
	pst: '举手=pt00.png,亲=pt01.png,偷笑=pt02.png,偷笑2=pt03.png,偷笑3=pt04.png,傻眼=pt05.png,傻眼2=pt06.png,兔子=pt07.png,发光=pt08.png,呆=pt09.png,呆2=pt10.png,呆3=pt11.png,呕=pt12.png,呵欠=pt13.png,哭=pt14.png,哭2=pt15.png,哭3=pt16.png,嘲笑=pt17.png,基=pt18.png,宅=pt19.png,安慰=pt20.png,幸福=pt21.png,开心=pt22.png,开心2=pt23.png,开心3=pt24.png,怀疑=pt25.png,怒=pt26.png,怒2=pt27.png,怨=pt28.png,惊吓=pt29.png,惊吓2=pt30.png,惊呆=pt31.png,惊呆2=pt32.png,惊呆3=pt33.png,惨=pt34.png,斜眼=pt35.png,晕=pt36.png,汗=pt37.png,泪=pt38.png,泪2=pt39.png,泪3=pt40.png,泪4=pt41.png,满足=pt42.png,满足2=pt43.png,火星=pt44.png,牙疼=pt45.png,电击=pt46.png,看戏=pt47.png,眼袋=pt48.png,眼镜=pt49.png,笑而不语=pt50.png,紧张=pt51.png,美味=pt52.png,背=pt53.png,脸红=pt54.png,脸红2=pt55.png,腐=pt56.png,星星眼=pt57.png,谢=pt58.png,醉=pt59.png,闷=pt60.png,闷2=pt61.png,音乐=pt62.png,黑脸=pt63.png,鼻血=pt64.png',
	dt: 'ROLL=dt01.png,上=dt02.png,傲娇=dt03.png,叉出去=dt04.png,发光=dt05.png,呵欠=dt06.png,哭=dt07.png,啃古头=dt08.png,嘲笑=dt09.png,心=dt10.png,怒=dt11.png,怒2=dt12.png,怨=dt13.png,惊=dt14.png,惊2=dt15.png,无语=dt16.png,星星眼=dt17.png,星星眼2=dt18.png,晕=dt19.png,注意=dt20.png,注意2=dt21.png,泪=dt22.png,泪2=dt23.png,烧=dt24.png,笑=dt25.png,笑2=dt26.png,笑3=dt27.png,脸红=dt28.png,药=dt29.png,衰=dt30.png,鄙视=dt31.png,闲=dt32.png,黑脸=dt33.png'
}

const EMOTICON = {}
Object.keys(EMOTICON_DATA).forEach((category) => {
	EMOTICON_DATA[category].split(',').forEach((pair) => {
		const [name, file] = pair.split('=')
		// BBCode 标签大小写不敏感，统一按小写建索引（如 dt 分类的 ROLL）
		EMOTICON[`${category}:${name.toLowerCase()}`] = file
	})
})

function emoticonTag(category, name) {
	const file = EMOTICON[`${category.toLowerCase()}:${name.toLowerCase()}`]
	if (!file) {
		return ''
	}
	return `<img src="${EMOTICON_BASE}${file}" style="vertical-align:middle">`
}

// 缩略图地址还原成原图地址
function originalImageUrl(url) {
	return url.replace(new RegExp(THUMB_SUFFIX, 'i'), '.$1')
}

// 图片只输出 <img>，不套 <a>：H5 的 rich-text 在捕获阶段先派发外层 a 的 itemclick，
// 套了锚点后点图片只会命中外层 a（被当成链接点击），拿不到图片自己的点击
function imageTag(url) {
	const src = originalImageUrl(url)
	return `<img src="${src}" style="max-width:100%">`
}

// [noimg] 里是附件媒体（图片/视频）的文件名，不带目录；目录按发帖日期还原成 NGA 图床的
// mon_YYYYMM/DD/（mon=month）。NGA 网页版自己不渲染这个标签，未适配的客户端只会看到字面文字。
// 已经带目录的（./mon_202407/04/x.jpg）直接补域名，推不出日期就保持标签原样。
const NOIMG_TAG = /\[noimg]\s*([^[|\]]+?)\s*\[\/noimg]/gi
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i

// 楼层列表（app_api）给 'YYYY-MM-DD HH:mm'（北京时间），个人主页（thread.php）给秒级时间戳
function attachmentDatePrefix(postDate) {
	if (typeof postDate === 'string') {
		const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(postDate.trim())
		if (parts) {
			return `mon_${parts[1]}${parts[2]}/${parts[3]}/`
		}
	}
	const seconds = Number(postDate)
	if (!seconds) {
		return ''
	}
	// 时间戳是 UTC，附件目录按北京时间（UTC+8）算
	const date = new Date(seconds * 1000 + 8 * 3600 * 1000)
	const pad = (value) => (value < 10 ? `0${value}` : `${value}`)
	return `mon_${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}/`
}

/**
 * 把楼层原始内容转成 rich-text 可渲染的 HTML。
 * 入参应已完成 %uXXXX 解码。
 * postDate 是该楼的时间，只有 [noimg] 还原附件目录时用得到（见 attachmentDatePrefix），
 * 拿不到就保持标签原样，不拼必然 404 的地址。
 */
// App 返回的内容里引用头可能是 HTML/BB 混排方言：开头 <b> 或 [b]，闭合可能是 </b> 或 [/b]，
// 统一归一化回纯 BBCode 的 [b]...[/b]，供折叠引用正则识别
function normalizeQuotedHead(raw) {
	return raw.replace(
		/(?:<b>|\[b\])(Reply to \[pid=\d+,\d+,\d+\]Reply\[\/pid\][\s\S]*?)(?:<\/b>|\[\/b\])/gi,
		'[b]$1[/b]'
	)
}

export function renderContent(raw, postDate) {
	if (typeof raw !== 'string' || !raw) {
		return ''
	}
	let content = normalizeQuotedHead(raw)

	content = content.replace(/&amp;/gi, '&')

	content = content.replace(/\[l\]/gi, "<div style='float:left'>")
	content = content.replace(/\[\/l\]/gi, END_DIV)
	content = content.replace(/\[r\]/gi, "<div style='float:right'>")
	content = content.replace(/\[\/r\]/gi, END_DIV)

	content = content.replace(/\[align=right\]/gi, `<div style='${ALIGN_STYLE}right'>`)
	content = content.replace(/\[align=left\]/gi, `<div style='${ALIGN_STYLE}left'>`)
	content = content.replace(/\[align=center\]/gi, `<div style='${ALIGN_STYLE}center'>`)
	content = content.replace(/\[\/align\]/gi, END_DIV)

	content = content.replace(
		/\[b\]Reply to \[pid=(.+?),(.+?),(.+?)\]Reply\[\/pid\] (.+?)\[\/b\]/gi,
		`[quote]Reply to [b]<a href='${NGA_HOST}read.php?searchpost=1&pid=$1&tid=$2' style='${LINK_STYLE}'>[Reply]</a> $4[/b][/quote]`
	)

	content = content.replace(
		/\[pid=(.+?),(.+?),(.+?)\]Reply\[\/pid\]/gi,
		`<a href='${NGA_HOST}read.php?searchpost=1&pid=$1&tid=$2' style='${LINK_STYLE}'>[Reply]</a>`
	)

	content = content.replace(/\[quote\]/gi, QUOTE_OPEN)
	content = content.replace(/\[\/quote\]/gi, END_DIV)

	content = content.replace(/\[code\]/gi, CODE_OPEN)
	content = content.replace(/\[code(.+?)\]/gi, QUOTE_OPEN)
	content = content.replace(/\[\/code\]/gi, END_DIV)

	content = content.replace(/\[tid=\d+\]Topic\[\/pid\]/gi, 'Topic')
	content = content.replace(
		/\[tid=?(\d{0,50})\]Topic\[\/tid\]/gi,
		`<a href='${NGA_HOST}read.php?tid=$1' style='${LINK_STYLE}'>[Topic]</a>`
	)

	content = content.replace(/\[b\]/gi, '<b>')
	content = content.replace(/\[\/b\]/gi, '</b>')
	content = content.replace(/\[item\]/gi, '<b>')
	content = content.replace(/\[\/item\]/gi, '</b>')
	content = content.replace(/\[u\]/gi, "<span style='text-decoration:underline'>")
	content = content.replace(/\[\/u\]/gi, '</span>')

	// 旧版数字表情的图床文件已不存在，降级成占位文字
	content = content.replace(/\[s:\d+\]/gi, "<span style='color:#a3acb9'>[表情]</span>")
	content = content.replace(/\[s:([a-z0-9]+):([^[\]]+)\]/gi, (match, category, name) => {
		return emoticonTag(category, name) || match
	})

	// 历史图床域名重写：附件族迁到当前附件主机，其余族保留原编号只换后缀
	content = content.replace(
		new RegExp(`https?://${LEGACY_IMAGE_HOST}/attachments(?=/|[?#]|$)`, 'gi'),
		ATTACH_BASE
	)
	content = content.replace(
		new RegExp(`https?://${LEGACY_IMAGE_HOST}(?=[/:?#\\s"'<>]|$)`, 'gi'),
		'https://img$1.nga.cn'
	)

	content = content.replace(/\[img]\s*\.(\/[^[|\]]+?)\s*\[\/img]/gi, (match, path) => {
		return imageTag(`${ATTACH_BASE}${path}`)
	})
	content = content.replace(/\[img]\s*(http[^[|\]]+?)\s*\[\/img]/gi, (match, url) => {
		return imageTag(url)
	})

	const noimgPrefix = attachmentDatePrefix(postDate)
	content = content.replace(NOIMG_TAG, (match, name) => {
		const value = String(name).trim().replace(/^(?:\.\/|\/)+/, '')
		if (!value) {
			return match
		}
		// 带目录的（mon_202407/04/x.jpg）直接补域名，纯文件名的才需要按日期推目录
		let url = ''
		if (value.indexOf('/') !== -1) {
			url = `${ATTACH_BASE}/${value}`
		} else if (noimgPrefix) {
			url = `${ATTACH_BASE}/${noimgPrefix}${value}`
		}
		if (!url) {
			return match
		}
		// 视频不在 rich-text 的节点白名单里，和 [flash=video] 一样给可点链接
		return VIDEO_EXT.test(value) ? `<a href="${url}" style='color:#3181f4'>[视频]</a>` : imageTag(url)
	})

	content = content.replace(
		/\[url\]\/([^[|\]]+)\[\/url\]/gi,
		`<a href="${NGA_HOST}$1" style='color:#3181f4'>${NGA_HOST}$1</a>`
	)
	content = content.replace(/\[url\]([^[|\]]+)\[\/url\]/gi, `<a href="$1" style='color:#3181f4'>$1</a>`)
	content = content.replace(
		/\[url=\/([^[|\]]+)\]\s*(.+?)\s*\[\/url\]/gi,
		`<a href="${NGA_HOST}$1" style='color:#3181f4'>$2</a>`
	)
	content = content.replace(/\[url=([^[|\]]+)\]\s*(.+?)\s*\[\/url\]/gi, `<a href="$1" style='color:#3181f4'>$2</a>`)

	content = content.replace(/\[uid=?(\d{0,50})\](.+?)\[\/uid\]/gi, '$2')
	content = content.replace(
		/Post by\s*([^[\s]{1,})\s*\(/gi,
		`Post by <a href='${NGA_HOST}nuke.php?func=ucp&username=$1' style='${LINK_STYLE}'>[$1]</a> (`
	)
	content = content.replace(
		/\[@(.{2,20}?)\]/gi,
		`<a href='${NGA_HOST}nuke.php?func=ucp&username=$1' style='${LINK_STYLE}'>[@$1]</a>`
	)
	content = content.replace(/\[uid=-?(\d{0,50})\](.+?)\[\/uid\]/gi, '$2')
	content = content.replace(/\[hip\](.+?)\[\/hip\]/gi, '$1')
	content = content.replace(
		/\[tid=?(\d{0,50})\](.+?)\[\/tid\]/gi,
		`<a href='${NGA_HOST}read.php?tid=$1' style='${LINK_STYLE}'>[$2]</a>`
	)
	content = content.replace(
		/\[pid=(.+?)\]\[\/pid\]/gi,
		`<a href='${NGA_HOST}read.php?pid=$1' style='${LINK_STYLE}'>[Reply]</a>`
	)
	content = content.replace(
		/\[pid=(.+?)\](.+?)\[\/pid\]/gi,
		`<a href='${NGA_HOST}read.php?pid=$1' style='${LINK_STYLE}'>[$2]</a>`
	)

	// rich-text 白名单里没有 video / audio / button，统一换成可点的占位链接
	content = content.replace(/\[flash=video\]([^[\]]+)\[\/flash\]/gi, `<a href="$1" style='color:#3181f4'>[视频]</a>`)
	content = content.replace(/\[flash=audio\]([^[\]]+)\[\/flash\]/gi, `<a href="$1" style='color:#3181f4'>[音频]</a>`)
	content = content.replace(/\[flash\]([^[\]]+)\[\/flash\]/gi, `<a href="$1" style='color:#3181f4'>[Flash]</a>`)

	content = content.replace(/\[color=([^[|\]]+)\]/gi, "<span style='color:$1'>")
	content = content.replace(/\[\/color\]/gi, '</span>')

	content = content.replace(/\[lessernuke\]/gi, LESSER_NUKE_OPEN)
	content = content.replace(/\[\/lessernuke\]/gi, END_DIV)

	content = content.replace(
		/\[table\]/gi,
		"<div><table cellspacing='0px' style='border:1px solid #aaa;width:99.9%;font-size:21px'><tbody>"
	)
	content = content.replace(/\[\/table\]/gi, '</tbody></table></div>')
	content = content.replace(/\[tr](.*?)\[\/tr]/gi, '<tr>$1</tr>')
	content = content.replace(/\[td[ ]*(\d+)\]/gi, `<td style='${CELL_STYLE}'>`)
	content = content.replace(/\[td\scolspan(\d+)\swidth(\d+)\]/gi, `<td colspan='$1' style='width:$2%;${CELL_STYLE}'>`)
	content = content.replace(/\[td\swidth(\d+)\scolspan(\d+)\]/gi, `<td colspan='$2' style='width:$1%;${CELL_STYLE}'>`)
	content = content.replace(/\[td\swidth(\d+)\srowspan(\d+)\]/gi, `<td rowspan='$2' style='width:$1%;${CELL_STYLE}'>`)
	content = content.replace(/\[td\srowspan(\d+)\swidth(\d+)\]/gi, `<td rowspan='$1' style='width:$2%;${CELL_STYLE}'>`)
	content = content.replace(
		/\[td\scolspan(\d+)\srowspan(\d+)\swidth(\d+)\]/gi,
		`<td colspan='$1' rowspan='$2' style='width:$3%;${CELL_STYLE}'>`
	)
	content = content.replace(
		/\[td\scolspan(\d+)\swidth(\d+)\srowspan(\d+)\]/gi,
		`<td colspan='$1' rowspan='$3' style='width:$2%;${CELL_STYLE}'>`
	)
	content = content.replace(
		/\[td\srowspan(\d+)\scolspan(\d+)\swidth(\d+)\]/gi,
		`<td rowspan='$1' colspan='$2' style='width:$3%;${CELL_STYLE}'>`
	)
	content = content.replace(
		/\[td\srowspan(\d+)\swidth(\d+)\scolspan(\d+)\]/gi,
		`<td rowspan='$1' colspan='$3' style='width:$2%;${CELL_STYLE}'>`
	)
	content = content.replace(
		/\[td\swidth(\d+)\scolspan(\d+)\srowspan(\d+)\]/gi,
		`<td rowspan='$3' colspan='$2' style='width:$1%;${CELL_STYLE}'>`
	)
	content = content.replace(
		/\[td\swidth(\d+)\srowspan(\d+)\scolspan(\d+)\]/gi,
		`<td rowspan='$2' colspan='$3' style='width:$1%;${CELL_STYLE}'>`
	)
	content = content.replace(/\[td\scolspan=?(\d+)\]/gi, `<td colspan='$1' style='${CELL_STYLE}'>`)
	content = content.replace(/\[td\srowspan=?(\d+)\]/gi, `<td rowspan='$1' style='${CELL_STYLE}'>`)
	content = content.replace(/\[td\]/gi, `<td style='${CELL_STYLE}'>`)
	content = content.replace(/\[\/td\]/gi, '</td>')
	content = content.replace(/<(\/?(table|tbody|tr|td))><br\/>/g, '<$1>')

	content = content.replace(/\[i\]/gi, '<i style="font-style:italic">')
	content = content.replace(/\[\/i\]/gi, '</i>')
	content = content.replace(/\[del\]/gi, '<del style="color:gray">')
	content = content.replace(/\[\/del\]/gi, '</del>')
	content = content.replace(/\[font=([^[|\]]+)\]/gi, '<span style="font-family:$1">')
	content = content.replace(/\[\/font\]/gi, '</span>')
	content = content.replace(/\[size=(\d+)%?\]/gi, '<span style="font-size:$1%;line-height:$1%">')
	content = content.replace(/\[\/size\]/gi, '</span>')

	content = content.replace(/\[list\](.*?)\[\/list\]/gi, '<ul>$1</ul>')
	content = content.replace(/\[list\]/gi, '')
	content = content.replace(/\[\/list\]/gi, '')
	content = content.replace(/\[\*\](.*?)<br\/>/gi, '<li>$1</li>')

	content = content.replace(/\[h](.+?)\[\/h]/gi, '<b>$1</b>')

	// 无脚本环境做不了折叠交互，标题和内容都直接展开
	content = content.replace(
		/\[collapse=(.*?)\](.*?)\[\/collapse]/gi,
		`<div style='${COLLAPSE_STYLE}'><b>$1</b><br/>$2</div>`
	)
	content = content.replace(/\[collapse](.*?)\[\/collapse]/gi, `<div style='${COLLAPSE_STYLE}'>$1</div>`)

	// 正文里已经是 HTML 的 <img> 也补上宽度约束，避免撑破容器
	content = content.replace(/<img\b[^>]*>/gi, (tag) => {
		return /\bstyle=/i.test(tag) ? tag : tag.replace(/<img\b/i, '<img style="max-width:100%"')
	})

	return content
}

// 折叠引用头：[b]Reply to [pid=pid,tid,?]Reply[/pid] 作者 (时间)[/b]
// 该方言的引用头本身不带正文，正文由用户展开时按 pid 单独请求
const QUOTED_HEAD = /\[b\]Reply to \[pid=(\d+),(\d+),(\d+)\]Reply\[\/pid\]\s*(.*?)\s*\[\/b\]/gi

// 去掉片段首尾的空白与换行，避免拆分后多出空行
function trimEdges(text) {
	return text.replace(/^(?:\s|<br\s*\/?>)+/i, '').replace(/(?:\s|<br\s*\/?>)+$/i, '')
}

function pushHtmlPart(parts, text, postDate) {
	const trimmed = trimEdges(text)
	if (trimmed) {
		parts.push({ type: 'html', html: renderContent(trimmed, postDate) })
	}
}

/**
 * 按折叠引用头把楼层内容切成片段，供页面按片段渲染：
 * - { type: 'html', html }：可直接交给 rich-text 的内容
 * - { type: 'quote', pid, tid, head }：引用片段，head 是渲染好的引用头，正文留到展开时再取
 * 入参应已完成 %uXXXX 解码。postDate 传该楼时间，供 [noimg] 还原附件目录。
 */
export function splitQuotedContent(raw, postDate) {
	if (typeof raw !== 'string' || !raw) {
		return []
	}
	const content = normalizeQuotedHead(raw)
	const parts = []
	let cursor = 0
	let match
	QUOTED_HEAD.lastIndex = 0
	while ((match = QUOTED_HEAD.exec(content)) !== null) {
		pushHtmlPart(parts, content.slice(cursor, match.index), postDate)
		parts.push({
			type: 'quote',
			pid: match[1],
			tid: match[2],
			head: renderContent(`Reply to [pid=${match[1]},${match[2]},${match[3]}]Reply[/pid] ${match[4]}`, postDate)
		})
		cursor = match.index + match[0].length
	}
	pushHtmlPart(parts, content.slice(cursor), postDate)
	return parts
}

// 实现上的取舍，都源于 rich-text 的节点白名单与环境限制：
// 1. 所有样式从 class 改为内联，rich-text 不会加载页面 CSS。
// 2. [u] 用 <span style='text-decoration:underline'>，<u> 不在白名单里。
// 3. [flash] / [flash=video] / [flash=audio] 用可点链接占位，video、audio、button 不在白名单里
//    （不在白名单的节点连同子节点会被整个移除）。
// 4. [collapse] 去掉了 <button onclick> 与 display:none，改为标题和内容都直接展开，rich-text 里没有脚本。
// 5. 旧版数字表情 [s:1] 保留原样会渲染成裸标签，改为占位文字；对应图床文件已 404。
//
// 图片处理：
// 6. 缩略图后缀（xxx.jpg.thumb.jpg）在拼 <img> 时逐个还原成原图；不对整段内容跑正则，
//    那样 `(http\S+).gif.(thumb...).jpg` 的贪婪匹配有跨标签的风险。
// 7. <img> 的 max-width 内联写死，rich-text 里没有全局 CSS。
// 8. 图床域名归一化（img*.ngacn.cc / img*.nga.178.com）按两条规则处理：附件族迁到
//    img.nga.cn/attachments，其余族保留原编号只换域名后缀。
// 9. 原图不套 <a> 锚点：rich-text 的 itemclick 在节点嵌套时外层 a 优先，
//    图片点击会被当成链接点击，页面就无法对 img 做全屏预览了。
// 10. [noimg]（附件名 + 按发帖日期推 mon_YYYYMM/DD/ 目录）要单独处理，否则会漏成字面标签。
