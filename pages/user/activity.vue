<template>
	<view class="page" :class="themeClass">
		<scroll-view class="tabs" scroll-x>
			<view
				v-for="tab in tabs"
				:key="tab.key"
				class="tab"
				:class="{ 'tab--active': tab.key === activeTab }"
				@click="switchTab(tab.key)"
			>
				<text class="tab-text">{{ tab.label }}</text>
			</view>
		</scroll-view>

		<view v-if="loading" class="state">
			<text class="state-text">{{ loadingText }}</text>
		</view>

		<view v-else-if="error" class="state">
			<text class="state-text state-text--error">{{ error }}</text>
			<button class="retry" @click="loadPage(1)">重试</button>
		</view>

		<view v-else class="items">
			<view v-for="(item, index) in items" :key="`${item.tid}-${index}`" class="item" @click="openTopic(item)">
				<text class="item-subject">{{ item.subject }}</text>
				<rich-text v-if="item.replyHtml" class="item-reply" :nodes="item.replyHtml"></rich-text>
				<view class="item-meta">
					<text v-if="item.board" class="item-board">{{ item.board }}</text>
					<text v-if="item.replies" class="item-replies">{{ item.replies }} 回复</text>
					<text class="item-time">{{ formatTime(item.time) }}</text>
				</view>
			</view>

			<view v-if="loadingMore" class="more">
				<text class="more-text">加载中...</text>
			</view>
			<view v-else-if="!hasMore" class="more">
				<text class="more-text">没有更多了</text>
			</view>
		</view>
	</view>
</template>

<script>
	import { fetchUserActivity } from '../../utils/api'
	import { renderContent } from '../../utils/bbcode'
	import { isLoggedIn } from '../../utils/auth'
	import { goToLogin } from '../../utils/navigation'
	import { syncTheme } from '../../utils/theme'

	// NGA 会在活动列表里混入"内容不可见"的占位条目，过滤掉
	function isUnavailable(row) {
		const denied = typeof row.denied === 'string' ? row.denied.trim() : ''
		const error = typeof row.error === 'string' ? row.error.trim() : ''
		return Boolean(denied || error)
	}

	// 回复模式下 ta 本人的那层回复在条目的 __P 里（主题标题在条目本身上）
	function toItem(row, reply) {
		const post = reply && row.__P && typeof row.__P === 'object' ? row.__P : null
		const parent = row.parent && typeof row.parent === 'object' ? row.parent : null
		return {
			tid: row.tid,
			subject: row.subject || '',
			board: parent && parent['2'] ? parent['2'] : '',
			replies: row.replies || 0,
			// 回复模式按 ta 回复的时间排，主题模式按发帖时间
			time: (post && post.postdate) || row.postdate,
			replyHtml: post && post.content ? renderContent(post.content, post.postdate) : ''
		}
	}

	export default {
		data() {
			return {
				uid: '',
				name: '',
				themeClass: '',
				tabs: [
					{ key: 'topic', label: '主题' },
					{ key: 'reply', label: '回复' }
				],
				activeTab: 'topic',
				items: [],
				page: 0,
				hasMore: true,
				loading: false,
				loadingMore: false,
				error: ''
			}
		},
		computed: {
			isReply() {
				return this.activeTab === 'reply'
			},
			loadingText() {
				return this.isReply ? '正在加载回复...' : '正在加载主题...'
			}
		},
		onShow() {
			this.themeClass = syncTheme()
		},
		onLoad(options) {
			this.uid = options.uid || ''
			this.name = options.name ? decodeURIComponent(options.name) : ''
			this.activeTab = options.reply === '1' ? 'reply' : 'topic'
			this.setTitle()
			// 这两个接口都要求登录（游客会收到「你必须登录」）
			if (!isLoggedIn()) {
				this.loading = true
				goToLogin()
				return
			}
			this.loadPage(1)
		},
		onReachBottom() {
			if (this.hasMore && !this.loading && !this.loadingMore) {
				this.loadPage(this.page + 1)
			}
		},
		methods: {
			setTitle() {
				const label = this.isReply ? '的回复' : '的主题'
				uni.setNavigationBarTitle({
					title: this.name ? `${this.name}${label}` : (this.isReply ? '回复' : '主题')
				})
			},
			switchTab(key) {
				if (key === this.activeTab) {
					return
				}
				this.activeTab = key
				this.setTitle()
				this.items = []
				this.page = 0
				this.hasMore = true
				this.error = ''
				this.loadPage(1)
			},
			async loadPage(page) {
				// 切 tab 期间回来时结果已过期就丢弃
				const tab = this.activeTab
				if (page === 1) {
					this.loading = true
					this.error = ''
				} else {
					this.loadingMore = true
				}

				try {
					const body = await fetchUserActivity(this.uid, page, tab === 'reply')
					if (tab !== this.activeTab) {
						return
					}
					const rows = (body.result && body.result.__T) || []
					const list = rows.filter((row) => row && !isUnavailable(row)).map((row) => toItem(row, tab === 'reply'))
					this.page = page
					this.items = page === 1 ? list : this.items.concat(list)
					this.hasMore = list.length > 0
				} catch (error) {
					if (tab !== this.activeTab) {
						return
					}
					const message = error.message || '列表加载失败'
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
					if (tab === this.activeTab) {
						this.loading = false
						this.loadingMore = false
					}
				}
			},
			openTopic(item) {
				uni.navigateTo({
					url: `/pages/post/detail?tid=${encodeURIComponent(item.tid)}&subject=${encodeURIComponent(item.subject)}`
				})
			},
			formatTime(timestamp) {
				if (!timestamp) {
					return ''
				}
				const date = new Date(timestamp * 1000)
				const pad = (value) => (value < 10 ? `0${value}` : `${value}`)
				return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
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

	/* 主题 / 回复 切换 */
	.tabs {
		width: 100%;
		white-space: nowrap;
		padding: 8rpx 0 20rpx;
		box-sizing: border-box;
	}

	.tab {
		display: inline-block;
		margin-right: 16rpx;
		padding: 0 30rpx;
		border-radius: 32rpx;
		background: var(--nga-card);
		line-height: 64rpx;
	}

	.tab-text {
		color: var(--nga-text-sub);
		font-size: 28rpx;
	}

	.tab--active {
		background: linear-gradient(135deg, #2b6cb0, #1e4e8c);
	}

	.tab--active .tab-text {
		color: #fff;
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

	/* 条目列表 */
	.items {
		padding: 8rpx 28rpx;
		border-radius: 12rpx;
		background: var(--nga-card);
		box-shadow: 0 12rpx 32rpx var(--nga-shadow);
	}

	.item {
		padding: 28rpx 0;
		border-bottom: 1rpx solid var(--nga-line);
	}

	.item:last-child {
		border-bottom: none;
	}

	.item-subject {
		color: var(--nga-text);
		font-size: 30rpx;
		line-height: 1.5;
	}

	/* 回复正文：不用底色，靠左侧竖线与上面的主题标题区分 */
	.item-reply {
		margin-top: 14rpx;
		padding-left: 20rpx;
		border-left: 4rpx solid var(--nga-border);
		color: var(--nga-text-sub);
		font-size: 26rpx;
		line-height: 1.6;
	}

	.item-meta {
		display: flex;
		align-items: center;
		margin-top: 14rpx;
	}

	.item-board {
		color: var(--nga-accent);
		font-size: 24rpx;
	}

	.item-replies {
		margin-left: 20rpx;
		color: var(--nga-text-muted);
		font-size: 24rpx;
	}

	.item-time {
		margin-left: auto;
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
</style>
