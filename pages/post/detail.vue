<template>
	<view class="page" :class="themeClass" :style="{ '--nga-scale': scale }">
		<view v-if="loading" class="state">
			<text class="state-text">正在加载帖子...</text>
		</view>

		<view v-else-if="error" class="state">
			<text class="state-text state-text--error">{{ error }}</text>
			<button class="retry" @click="loadPage(1)">重试</button>
		</view>

		<view v-else class="floors">
			<!-- 只看某人时给个显式出口：之前只能再点一次楼号才知道能退出 -->
			<view v-if="authorId" class="filter-bar" @click="showAllFloors">
				<text class="filter-bar-text">只看 {{ filterName || '某人' }} 中，点此查看整帖</text>
			</view>

			<view v-for="(floor, index) in floors" :key="floor.id" class="floor">
				<view v-if="index === 0 && subject" class="floor-title">
					<text class="floor-title-text">{{ subject }}</text>
				</view>
				<view class="floor-head">
					<image v-if="floor.avatar" class="floor-avatar" :src="floor.avatar" mode="aspectFill" />
					<text class="floor-author" @click="openUser(floor)">{{ floor.author }}</text>
					<text v-if="floor.time" class="floor-time">{{ floor.time }}</text>
					<view class="floor-right">
						<view v-if="loggedIn && isLzFloor(floor)" class="favor" :class="{ 'favor--on': favorited }" @click.stop="onFavorTap">
							<text class="favor-star">{{ favorited ? '★' : '☆' }}</text>
						</view>
						<text v-if="floor.louLabel" class="floor-lou" @click.stop="onLouTap(floor)">{{ floor.louLabel }}</text>
					</view>
				</view>
				<view v-for="(part, partIndex) in floor.parts" :key="partIndex" class="floor-part">
					<rich-text v-if="part.type === 'html'" class="floor-content" :nodes="part.html" @itemclick="onContentItemClick"></rich-text>
					<view v-else class="quote" @click="expandQuote(floor, part)">
						<rich-text class="quote-head" :nodes="part.head" @itemclick="onContentItemClick"></rich-text>
						<text v-if="part.loading" class="quote-state">正在加载原文…</text>
						<text v-else-if="part.expanded" class="quote-state" @click.stop="collapseQuote(part)">［点击收起原文］</text>
						<text v-else class="quote-state">［点击展开原文］</text>
						<view v-if="part.expanded" class="quote-body">
							<view v-if="part.error" class="quote-error">{{ part.error }}</view>
							<rich-text v-else-if="part.html" class="quote-content" :nodes="part.html" @itemclick="onContentItemClick"></rich-text>
							<view v-else class="quote-error">原文加载失败</view>
						</view>
					</view>
				</view>
				<view v-if="floor.good || floor.bad" class="floor-vote">
					<view v-if="floor.good" class="floor-vote-item">
						<image class="floor-vote-icon" src="/static/icon-thumb-up.png" mode="aspectFit" />
						<text class="floor-vote-text">赞 {{ floor.good }}</text>
					</view>
					<view v-if="floor.bad" class="floor-vote-item">
						<text class="floor-vote-text">踩 {{ floor.bad }}</text>
					</view>
				</view>
			</view>

			<view v-if="loadingMore" class="more">
				<text class="more-text">加载中...</text>
			</view>
			<view v-else-if="!hasMore" class="more">
				<text class="more-text">没有更多了</text>
			</view>

			<!-- 右下角页码浮层：点击徽标展开/收起；面板内全部页码常显，超过半屏高度时内部滚动 -->
			<view v-if="totalPages > 0" class="page-badge-wrap">
				<view v-if="pagePanelOpen" class="page-panel">
					<scroll-view class="page-panel-scroll" scroll-y>
						<view class="page-nums">
							<view v-for="p in totalPages" :key="p"
								:class="['page-num', p === currentPage ? 'page-num--active' : '']"
								@click="onPageNumTap(p)">
								<text>{{ p }}</text>
							</view>
						</view>
					</scroll-view>
				</view>
				<view class="page-badge" @click="onPageBadgeTap">
					<text class="page-badge-text">{{ currentPage }}/{{ totalPages }}</text>
				</view>
			</view>
		</view>

		<!-- 只看此人确认：uni-popup 居中弹窗，配色跟主题变量走 -->
		<uni-popup ref="louPopup" type="center">
			<view v-if="louTarget" class="lou-dialog">
				<text class="lou-dialog-title">{{ louTarget.title }}</text>
				<text class="lou-dialog-text">{{ louTarget.text }}</text>
				<view class="lou-dialog-actions">
					<view class="lou-dialog-btn" @click="closeLouDialog">
						<text class="lou-dialog-btn-text">取消</text>
					</view>
					<view class="lou-dialog-btn" @click="onLouConfirm">
						<text class="lou-dialog-btn-text lou-dialog-btn-text--primary">{{ louTarget.confirmText }}</text>
					</view>
				</view>
			</view>
		</uni-popup>
	</view>
</template>

<script>
	import { fetchPostList, fetchPostByPid, toggleFavorite } from '../../utils/api'
	import { renderContent, splitQuotedContent, EMOTICON_BASE } from '../../utils/bbcode'
	import { avatarUrl, decodeNgaText } from '../../utils/user'
	import { isLoggedIn } from '../../utils/auth'
	import { loadFavoriteIds, markFavoriteChanged } from '../../utils/favorites'
	import { fontScale } from '../../utils/fontSize'
	import { addHistory } from '../../utils/history'
	import { syncTheme } from '../../utils/theme'

	// NGA 楼层内容里的中文是 %uXXXX 形式，decodeURIComponent 处理不了
	function decodeContent(content) {
		if (typeof content !== 'string') {
			return ''
		}
		return content.replace(/%u([0-9A-Fa-f]{4})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
	}

	// 标题经 URL 传输可能仍是编码态，统一还原：
	// 先做标准 URL 解码（%E6...），再交给 decodeNgaText 处理 NGA 的 %uXXXX/GBK 等
	function decodeSubject(raw) {
		if (typeof raw !== 'string' || !raw) {
			return ''
		}
		let text = raw
		if (/%[0-9A-Fa-f]{2}/.test(text)) {
			try {
				text = decodeURIComponent(text)
			} catch (error) {
				// 已是可读文本或含不合法转义，保持原样
			}
		}
		return decodeNgaText(text) || raw
	}

	// 楼层容器：优先取 __R；result 自身也可能是楼层集合（数组或数字 key 的字典）
	function extractRows(payload) {
		if (!payload || typeof payload !== 'object') {
			return null
		}
		if (payload.__R) {
			return payload.__R
		}
		if (Array.isArray(payload)) {
			return payload
		}
		const keys = Object.keys(payload)
		if (keys.length && keys.every((key) => /^\d+$/.test(key))) {
			return payload
		}
		return null
	}

	// 作者对象：App 方言放在楼层行内，网页方言放在 __U 字典里按 authorid 索引
	function findUser(row, userMap) {
		if (row.author && typeof row.author === 'object') {
			return row.author
		}
		if (!userMap || row.authorid == null) {
			return null
		}
		return userMap[String(row.authorid)] || null
	}

	// 匿名账号的用户名形如 #anony_xxxxxx，不显示名字也不显示头像，也更没有可跳转的用户
	function authorOf(user) {
		const raw = user ? user.username || user.nickname || '' : ''
		const uid = user && user.uid != null ? user.uid : ''
		if (!raw) {
			return { name: '未知用户', avatar: '', uid: '' }
		}
		if (raw.startsWith('#anony_')) {
			return { name: '匿名用户', avatar: '', uid: '' }
		}
		return { name: decodeNgaText(raw) || '未知用户', avatar: avatarUrl(user && user.avatar), uid }
	}

	// 右侧楼层标识：楼主楼（lou 为 0）显示"楼主"，其余楼层显示"X 楼"，楼号缺失则不显示
	function louLabel(lou) {
		if (lou == null || lou === '') {
			return ''
		}
		return Number(lou) === 0 ? '楼主' : `${lou} 楼`
	}

	// 结构摘要，仅用于数据格式异常时的错误提示
	function shape(value) {
		if (Array.isArray(value)) {
			return `[${value.length}]${value.length ? shape(value[0]) : ''}`
		}
		if (value && typeof value === 'object') {
			return `{${Object.keys(value).slice(0, 15).join(',')}}`
		}
		return typeof value
	}

	export default {
				data() {
					return {
						tid: '',
						subject: '', // 帖子标题（从列表带入）
						themeClass: '',
						scale: 1, // 阅读字号比例，页面根节点用它当 CSS 变量
					floors: [],
					page: 0,
					hasMore: true,
					loading: false,
					loadingMore: false,
					error: '',
					totalPages: 0, // 总页数，接口未给则 0
					currentPage: 1, // 当前所在页
					pagePanelOpen: false, // 页码面板是否展开
					authorId: '', // 只看此人时该用户 uid，空表示看全部楼层
					filterName: '', // 只看此人时的作者名，用于顶部提示条
					louTarget: null, // 「只看此人」弹窗的目标楼层，null 表示还没打开过
					favorited: false, // 当前帖子是否已收藏（仅登录且楼主层可见）
					favoring: false, // 收藏请求进行中，避免连点
					loggedIn: false // 模板要用，import 的函数上不了模板
				}
			},
		onShow() {
			this.themeClass = syncTheme()
			// 字号可能在「我的 → 阅读字号」里改过，每次显示都同步
			this.scale = fontScale()
			// 登录态可能在本页停留期间变化（去登录页回来后），每次显示都同步一次
			this.loggedIn = isLoggedIn()
			this.syncFavorite()
		},
		onLoad(options) {
			this.tid = options.tid || ''
			this.subject = decodeSubject(options.subject || '')
			// 先按路由带来的标题记一条，拿到接口的真实标题后会再记一次（按 tid 去重）
			addHistory({ tid: this.tid, subject: this.subject })
			this.loadPage(1)
		},
		onReachBottom() {
			if (this.hasMore && !this.loading && !this.loadingMore) {
				this.loadPage(this.page + 1)
			}
		},
		methods: {
			// 同步收藏状态：没有"查单帖"的接口，只能拿收藏夹列表比对（见 utils/favorites.js）
			// 取不到就保持未收藏，不打扰用户
			syncFavorite() {
				if (!this.loggedIn || !this.tid) {
					return
				}
				loadFavoriteIds()
					.then((ids) => {
						this.favorited = ids.has(String(this.tid))
					})
					.catch(() => {})
			},
			// 楼主层（lou 为 0）才显示收藏星标；只看此人时楼层也可能从别的层开始，按 lou 判断
			isLzFloor(floor) {
				return floor.lou == null || Number(floor.lou) === 0
			},
			// 点击星标收藏/取消收藏（仅楼主层可见，未登录不会走到这里）
			// 请求发完后强制重拉收藏夹核对——NGA 的收藏接口返回是 GBK 文案，判不了成败，
			// 只能以收藏夹列表为准，免得失败还显示成功
			onFavorTap() {
				if (this.favoring || !this.tid) {
					return
				}
				const next = !this.favorited
				const before = this.favorited
				this.favoring = true
				toggleFavorite(this.tid, next)
					.then(() => loadFavoriteIds(true))
					.then((ids) => {
						const favorited = ids.has(String(this.tid))
						this.favorited = favorited
						// 状态真的变了才让收藏夹列表重拉，没变（比如请求没生效）就别动它
						if (favorited !== before) {
							markFavoriteChanged()
						}
						uni.showToast({
							title: favorited ? '已收藏' : '已取消收藏',
							icon: 'none'
						})
					})
					.catch((error) => {
						uni.showToast({
							title: (error && error.message) || '操作失败',
							icon: 'none'
						})
					})
					.finally(() => {
						this.favoring = false
					})
			},
			// rich-text 的 @itemclick：图片全屏预览，链接复制（外跳在各端问题多，不做了）
			onContentItemClick(event) {
				const node = event && event.detail && event.detail.node
				if (!node || !node.name) {
					return
				}
				const attrs = node.attrs || {}
				if (node.name === 'img') {
					this.previewImage(attrs.src)
					return
				}
				if (node.name === 'a' && attrs.href) {
					this.copyLink(attrs.href)
				}
			},
			// 全屏预览：把当前已加载内容里的正文图片都带上，可左右切换；表情图不参与
			previewImage(src) {
				if (!src || src.indexOf(EMOTICON_BASE) === 0) {
					return
				}
				const urls = this.collectImages()
				if (!urls.length) {
					return
				}
				uni.previewImage({ urls, current: src })
			},
			// 从已渲染的 html 里按出现顺序提取图片地址并去重
			collectImages() {
				const urls = []
				const pattern = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi
				;(this.floors || []).forEach((floor) => {
					;(floor.parts || []).forEach((part) => {
						if (typeof part.html !== 'string') {
							return
						}
						let match
						while ((match = pattern.exec(part.html)) !== null) {
							const url = match[1]
							if (url.indexOf(EMOTICON_BASE) !== 0 && urls.indexOf(url) === -1) {
								urls.push(url)
							}
						}
					})
				})
				return urls
			},
			// 复制链接：setClipboardData 默认自带"内容已复制"提示，这里不再额外 toast
			copyLink(href) {
				uni.setClipboardData({
					data: href,
					showToast:false,
					complete:function () {
						uni.showToast({
							title:'复制成功',
							icon:'none'
						})
					}
				})
			},
			openUser(floor) {
				if (!floor.uid) {
					return
				}
				uni.navigateTo({
					url: `/pages/user/profile?uid=${encodeURIComponent(floor.uid)}&name=${encodeURIComponent(floor.author)}`
				})
			},
			// 展开折叠引用：优先用当前已加载楼层里同 pid 的内容，未命中再按 pid 请求原文
			expandQuote(floor, part) {
				if (part.loading || part.expanded) {
					return
				}
				const local = this.floors.find((f) => f.id != null && String(f.id) === part.pid && f.id !== floor.id)
				if (local) {
					part.expanded = true
					part.html = this.renderPartsHtml(local.parts)
					return
				}
				part.loading = true
				part.error = ''
				fetchPostByPid(part.tid, part.pid)
					.then((payload) => {
						const rows = extractRows(payload && payload.data)
						if (!rows) {
							part.error = '未找到原文'
							return
						}
						const row = Object.keys(rows)
							.map((key) => rows[key])
							.find((r) => r && String(r.pid) === part.pid)
						if (!row) {
							part.error = '未找到原文'
							return
						}
						part.html = renderContent(decodeContent(row.content), row.postdate)
						part.expanded = true
					})
					.catch((error) => {
						part.error = (error && error.message) || '原文加载失败'
					})
					.finally(() => {
						part.loading = false
					})
			},
			// 命中本地同 pid 楼层时，把该楼的引用片段展开成普通内容拼接
			renderPartsHtml(parts) {
				return (parts || []).map((p) => {
					if (p.type === 'html') {
						return p.html
					}
					// 命中的楼层里若还有引用片段，只显示引用头（不再继续嵌套展开）
					return p.head
				}).join('')
			},
			collapseQuote(part) {
				part.expanded = false
			},
			// 点击楼层标识（楼主 / X 楼）：弹确认框只看此人；已只看该人时弹的是取消
			onLouTap(floor) {
				if (!floor.uid) {
					uni.showToast({
						title: '匿名或未知用户无法只看此人',
						icon: 'none'
					})
					return
				}
				const filtering = String(this.authorId) === String(floor.uid)
				this.louTarget = {
					uid: floor.uid,
					filtering,
					title: filtering ? '取消只看此人' : '只看此人',
					text: filtering ? `不再只看 ${floor.author} 的回复？` : `只看 ${floor.author} 的回复？`,
					confirmText: filtering ? '查看全部' : '只看此人'
				}
				const popup = this.$refs.louPopup
				if (popup) {
					popup.open()
				}
			},
			// 关闭弹窗：内容留着不置空，避免关闭动画里卡片先闪没
			closeLouDialog() {
				const popup = this.$refs.louPopup
				if (popup) {
					popup.close()
				}
			},
			onLouConfirm() {
				const target = this.louTarget
				this.closeLouDialog()
				if (target) {
					this.applyAuthorFilter(target.filtering ? '' : target.uid, target.author)
				}
			},
			// 顶部提示条：退出「只看某人」，回到整帖
			showAllFloors() {
				this.applyAuthorFilter('')
			},
			// 切换只看某人：清空已加载楼层，从第一页按 authorid 重新拉
			applyAuthorFilter(uid, name) {
				this.authorId = uid || ''
				this.filterName = uid ? (name || '') : ''
				this.floors = []
				this.page = 0
				this.currentPage = 1
				this.totalPages = 0
				this.hasMore = true
				this.pagePanelOpen = false
				this.loadPage(1)
			},
			// 点击页码浮层：展开/收起页码面板
			onPageBadgeTap() {
				if (this.totalPages <= 1) {
					return
				}
				this.pagePanelOpen = !this.pagePanelOpen
			},
			// 点击页码：跳页并收起面板
			onPageNumTap(p) {
				if (p === this.currentPage) {
					return
				}
				this.pagePanelOpen = false
				this.jumpToPage(p)
			},
			// 跳转到指定页：清空当前楼层，从该页开始加载
			jumpToPage(target) {
				if (target === this.page) {
					return
				}
				// 标题只属于第一页的楼主；跳到其它页时清掉，避免显示在非楼主卡片上
				if (target !== 1) {
					this.subject = ''
				}
				this.floors = []
				this.page = 0
				this.hasMore = true
				this.loadPage(target)
			},
			async loadPage(page) {
				if (page === 1) {
					this.loading = true
					this.error = ''
				} else {
					this.loadingMore = true
				}

				try {
					const body = await fetchPostList(this.tid, page, this.authorId)
					const payload = body.result
					const rows = extractRows(payload)
					if (!rows) {
						// 结构不符时输出结构摘要，便于定位
						this.error = `数据格式异常 → result${shape(payload)}`
						return
					}

					const list = Object.keys(rows).map((key) => {
						const row = rows[key]
						const author = authorOf(findUser(row, payload.__U))
						return {
							id: row.pid,
							lou: row.lou,
							louLabel: louLabel(row.lou),
							author: author.name,
							avatar: author.avatar,
							uid: author.uid,
							good: row.vote_good || 0,
							bad: row.vote_bad || 0,
							time: typeof row.postdate === 'string' ? row.postdate : '',
							parts: splitQuotedContent(decodeContent(row.content), row.postdate)
						}
					})

					this.page = page
					this.floors = page === 1 ? list : this.floors.concat(list)
					// app_api 顶层会给真实标题：从收藏/历史/搜索进来时路由没带标题，用它补上
					const apiSubject = typeof body.tsubject === 'string' ? body.tsubject : ''
					if (page === 1 && apiSubject) {
						this.subject = decodeSubject(apiSubject)
						addHistory({ tid: this.tid, subject: this.subject })
					}
					// 到最后一页（响应给出 totalPage/currentPage 时）不再继续请求；
					// 字段缺失则兜底用"返回非空"判断
					const totalPage = Number(body.totalPage)
					const currentPage = Number(body.currentPage) || page
					if (totalPage > 0) {
						this.totalPages = totalPage
					}
					this.currentPage = currentPage
					const atLast = totalPage > 0 && currentPage >= totalPage
					this.hasMore = list.length > 0 && !atLast
				} catch (error) {
					const message = error.message || '帖子加载失败'
					if (page === 1) {
						this.error = message
					} else {
						this.hasMore = false
						uni.showToast({
							title: message,
							icon: 'none'
						})
					}
				} finally {
					this.loading = false
					this.loadingMore = false
				}
			}
		}
	}
</script>

<style>
	.page {
		min-height: 100vh;
		padding: 16rpx 32rpx 60rpx;
		box-sizing: border-box;
		background: var(--nga-bg);
	}

	/* 状态 */
	.state {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 120rpx 40rpx;
	}

	.state-text {
		color: var(--nga-text-muted);
		font-size: 28rpx;
	}

	.state-text--error {
		color: var(--nga-danger);
		text-align: center;
		line-height: 1.6;
	}

	.retry {
		margin-top: 32rpx;
		padding: 0 44rpx;
		border: 1rpx solid var(--nga-border);
		border-radius: 8rpx;
		background: var(--nga-card);
		color: var(--nga-accent);
		font-size: 28rpx;
		line-height: 68rpx;
	}

	/* 只看某人的提示条：点一下回到整帖 */
	.filter-bar {
		margin-bottom: 20rpx;
		padding: 18rpx 28rpx;
		border-radius: 12rpx;
		background: rgba(106, 169, 233, 0.18);
	}

	.filter-bar-text {
		color: var(--nga-accent);
		font-size: 26rpx;
	}

	/* 楼层 */
	.floor {
		margin-bottom: 20rpx;
		padding: 28rpx;
		border-radius: 12rpx;
		background: var(--nga-card);
		box-shadow: 0 12rpx 32rpx var(--nga-shadow);
	}

	/* 帖子标题（列表带入，置于第一个卡片内最上方） */
	.floor-title {
		margin-bottom: 20rpx;
		padding-bottom: 20rpx;
		border-bottom: 1rpx solid var(--nga-border);
	}

	.floor-title-text {
		display: block;
		color: var(--nga-text);
		font-size: calc(34rpx * var(--nga-scale, 1));
		font-weight: bold;
		line-height: 1.5;
	}

	.floor-head {
		display: flex;
		align-items: center;
		margin-bottom: 16rpx;
	}

	.floor-avatar {
		width: 48rpx;
		height: 48rpx;
		margin-right: 16rpx;
		border-radius: 50%;
		background: var(--nga-fill);
	}

	.floor-author {
		color: var(--nga-accent);
		font-size: 26rpx;
		font-weight: bold;
	}

	.floor-time {
		margin-left: 12rpx;
		color: var(--nga-text-faint);
		font-size: 24rpx;
	}

	/* 作者行右侧：收藏星标 + 楼层标识，一起靠右 */
	.floor-right {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		margin-left: auto;
	}

	/* 楼主层的收藏星标：只一个星，收藏态变强调色的实心星 */
	.favor {
		margin-right: 12rpx;
		padding: 4rpx 8rpx;
	}

	.favor-star {
		color: var(--nga-text-faint);
		font-size: 30rpx;
		line-height: 1;
	}

	.favor--on .favor-star {
		color: var(--nga-accent);
	}

	.floor-lou {
		padding: 8rpx 0 8rpx 20rpx;
		color: var(--nga-text-faint);
		font-size: 24rpx;
	}

	.floor-content {
		color: var(--nga-text);
		font-size: calc(28rpx * var(--nga-scale, 1));
		line-height: 1.7;
	}

	/* 折叠引用块 */
	.floor-part + .floor-part {
		margin-top: 12rpx;
	}

	/* 折叠引用块：与正文里内嵌的 [quote] 用同一套配色（蓝调半透明底 + 左竖线） */
	.quote {
		padding: 16rpx 20rpx;
		border-left: 6rpx solid rgba(106, 169, 233, 0.55);
		background: rgba(106, 169, 233, 0.1);
	}

	.quote-head {
		color: var(--nga-text-sub);
		font-size: calc(26rpx * var(--nga-scale, 1));
		line-height: 1.6;
		font-weight: bold;
	}

	.quote-state {
		display: block;
		margin-top: 8rpx;
		color: var(--nga-accent);
		font-size: calc(24rpx * var(--nga-scale, 1));
	}

	.quote-body {
		margin-top: 12rpx;
		border-top: 1rpx solid var(--nga-border);
		padding-top: 12rpx;
	}

	.quote-content {
		color: var(--nga-text);
		font-size: calc(28rpx * var(--nga-scale, 1));
		line-height: 1.7;
	}

	.quote-error {
		color: var(--nga-text-muted);
		font-size: 26rpx;
	}

	/* 赞/踩只展示，不带交互 */
	.floor-vote {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		margin-top: 16rpx;
	}

	.floor-vote-item {
		display: flex;
		align-items: center;
		margin-left: 28rpx;
	}

	.floor-vote-icon {
		width: 28rpx;
		height: 28rpx;
		margin-right: 8rpx;
	}

	.floor-vote-text {
		color: var(--nga-text-faint);
		font-size: 24rpx;
	}

	/* 加载更多 */
	.more {
		display: flex;
		justify-content: center;
		padding: 32rpx 0 12rpx;
	}

	.more-text {
		color: var(--nga-text-faint);
		font-size: 24rpx;
	}

	/* 右下角页码浮层：点击展开页码面板 */
	.page-badge-wrap {
		position: fixed;
		right: 32rpx;
		bottom: 96rpx;
		z-index: 10;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	.page-badge {
		min-width: 88rpx;
		padding: 10rpx 22rpx;
		border-radius: 999rpx;
		background: rgba(0, 0, 0, 0.55);
		text-align: center;
	}

	.page-badge-text {
		color: #ffffff;
		font-size: 26rpx;
	}

	/* 页码面板：全部页码常显，内容超过半屏高度时内部滚动 */
	.page-panel {
		margin-bottom: 12rpx;
		max-height: 50vh;
		width: 360rpx;
		border-radius: 12rpx;
		background: var(--nga-card);
		box-shadow: 0 12rpx 40rpx var(--nga-shadow);
		border: 1rpx solid var(--nga-border);
		overflow: hidden;
	}

	.page-panel-scroll {
		max-height: 50vh;
	}

	.page-nums {
		display: flex;
		flex-wrap: wrap;
		padding: 12rpx;
	}

	/* 一行最多 4 个；不满 4 个时项靠左、不撑满留白 */
	.page-num {
		width: 80rpx;
		height: 60rpx;
		margin: 2rpx;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--nga-text);
		font-size: 25rpx;
	}

	.page-num > text {
		display: inline-block;
		width: 100%;
		height: 52rpx;
		line-height: 52rpx;
		text-align: center;
		border-radius: 8rpx;
		background: var(--nga-fill);
	}

	.page-num--active > text {
		background: var(--nga-accent);
		color: #ffffff;
		font-weight: bold;
	}

	/* 只看此人确认弹窗（uni-popup 内自绘卡片，取主题变量） */
	.lou-dialog {
		width: 560rpx;
		box-sizing: border-box;
		border-radius: 20rpx;
		background: var(--nga-card);
		box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.18);
		overflow: hidden;
	}

	.lou-dialog-title {
		display: block;
		padding-top: 40rpx;
		color: var(--nga-text);
		font-size: 32rpx;
		font-weight: bold;
		text-align: center;
	}

	.lou-dialog-text {
		display: block;
		padding: 0 36rpx;
		margin-top: 24rpx;
		color: var(--nga-text-sub);
		font-size: 28rpx;
		line-height: 1.6;
		text-align: center;
	}

	.lou-dialog-actions {
		display: flex;
		flex-direction: row;
		margin-top: 36rpx;
		border-top: 1rpx solid var(--nga-line);
	}

	.lou-dialog-btn {
		display: flex;
		flex-direction: row;
		flex: 1;
		align-items: center;
		justify-content: center;
		height: 96rpx;
	}

	.lou-dialog-btn + .lou-dialog-btn {
		border-left: 1rpx solid var(--nga-line);
	}

	.lou-dialog-btn-text {
		color: var(--nga-text-sub);
		font-size: 30rpx;
	}

	.lou-dialog-btn-text--primary {
		color: var(--nga-accent);
		font-weight: bold;
	}

</style>
