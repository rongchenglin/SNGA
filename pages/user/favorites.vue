<template>
	<view class="page" :class="themeClass">
		<view v-if="loading" class="state">
			<text class="state-text">正在加载收藏...</text>
		</view>

		<view v-else-if="error" class="state">
			<text class="state-text state-text--error">{{ error }}</text>
			<button class="retry" @click="loadPage(1)">重试</button>
		</view>

		<view v-else-if="topics.length" class="items">
			<view v-for="topic in topics" :key="topic.tid" class="item" @click="openTopic(topic)">
				<text class="item-subject">{{ topic.subject }}</text>
				<view class="item-meta">
					<text class="item-author">{{ topic.author }}</text>
					<text v-if="topic.replies" class="item-replies">{{ topic.replies }} 回复</text>
					<text class="item-time">{{ formatTime(topic.time) }}</text>
				</view>
			</view>

			<view v-if="loadingMore" class="more">
				<text class="more-text">加载中...</text>
			</view>
			<view v-else-if="!hasMore" class="more">
				<text class="more-text">没有更多了</text>
			</view>
		</view>

		<view v-else class="state">
			<text class="state-text">还没有收藏任何帖子</text>
		</view>
	</view>
</template>

<script>
	import { fetchFavorites } from '../../utils/api'
	import { isLoggedIn } from '../../utils/auth'
	import { goToLogin } from '../../utils/navigation'
	import { consumeFavoriteChanged } from '../../utils/favorites'
	import { syncTheme } from '../../utils/theme'

	// 收藏夹条目结构同板块主题列表
	function toTopic(row) {
		return {
			tid: row.tid,
			subject: row.subject || '',
			author: row.author || '',
			replies: row.replies || 0,
			time: row.postdate
		}
	}

	export default {
		data() {
			return {
				themeClass: '',
				topics: [],
				page: 0,
				hasMore: true,
				loaded: false, // 首屏拉过没有，避免 onLoad + onShow 重复请求
				loading: false,
				loadingMore: false,
				error: ''
			}
		},
		onShow() {
			this.themeClass = syncTheme()
			// 在详情页收藏/取消过就重拉：不然删掉的帖子还留在列表里
			// 每次返回都重拉会把翻页进度打回去，所以只在收藏状态改动过时才刷
			if (this.loaded && consumeFavoriteChanged()) {
				this.loadPage(1)
			}
		},
		onLoad() {
			uni.setNavigationBarTitle({ title: '我的收藏' })
			if (!isLoggedIn()) {
				this.loading = true
				goToLogin()
				return
			}
			// 进页面本来就是最新数据，顺手把改动标记清掉
			consumeFavoriteChanged()
			this.loadPage(1)
		},
		onReachBottom() {
			if (this.hasMore && !this.loading && !this.loadingMore) {
				this.loadPage(this.page + 1)
			}
		},
		methods: {
			async loadPage(page) {
				if (page === 1) {
					this.loading = true
					this.error = ''
				} else {
					this.loadingMore = true
				}
				try {
					const body = await fetchFavorites(page)
					const rows = (body.result && body.result.__T) || []
					const list = rows.filter((row) => row).map(toTopic)
					this.page = page
					this.topics = page === 1 ? list : this.topics.concat(list)
					this.hasMore = list.length > 0
					this.loaded = true
				} catch (error) {
					const message = error.message || '收藏加载失败'
					if (page === 1) {
						this.error = message
					} else {
						this.hasMore = false
						uni.showToast({ title: message, icon: 'none' })
					}
				} finally {
					this.loading = false
					this.loadingMore = false
				}
			},
			openTopic(topic) {
				uni.navigateTo({
					url: `/pages/post/detail?tid=${encodeURIComponent(topic.tid)}&subject=${encodeURIComponent(topic.subject)}`
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

	/* 列表 */
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

	.item-meta {
		display: flex;
		align-items: center;
		margin-top: 14rpx;
	}

	.item-author {
		color: var(--nga-text-sub);
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
