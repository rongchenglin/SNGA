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

		<view v-else class="topics">
			<view v-for="topic in topics" :key="topic.tid" class="topic" @click="openTopic(topic)">
				<text class="topic-subject">{{ topic.subject }}</text>
				<view class="topic-meta">
					<text class="topic-author">{{ topic.author }}</text>
					<text class="topic-replies">{{ topic.replies }} 回复</text>
					<text class="topic-time">{{ formatTime(topic.postdate) }}</text>
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
	import { fetchTopicList } from '../../utils/api'
	import { isLoggedIn } from '../../utils/auth'
	import { goToLogin } from '../../utils/navigation'
	import { decodeNgaText } from '../../utils/user'
	import { syncTheme } from '../../utils/theme'

	// 24 小时热帖是客户端算出来的
	const HOT_PAGE_COUNT = 5
	const HOT_TOPIC_COUNT = 50
	const DAY_SECONDS = 24 * 60 * 60

	// 作者名和资料接口一样可能是百分号编码的 GBK，统一解码后再展示
	function displayTopic(topic) {
		return Object.assign({}, topic, { author: decodeNgaText(topic.author) })
	}

	export default {
		data() {
			return {
				fid: '',
				forumName: '',
				themeClass: '',
				tabs: [
					{ key: 'hot', label: '24小时热帖' },
					{ key: 'lastpost', label: '最新回复' },
					{ key: 'postdate', label: '最新发布' }
				],
				activeTab: 'lastpost',
				topics: [],
				page: 0,
				hasMore: true,
				loading: false,
				loadingMore: false,
				error: ''
			}
		},
		computed: {
			loadingText() {
				return this.activeTab === 'hot' ? '正在统计 24 小时热帖...' : '正在加载帖子...'
			}
		},
		onShow() {
			this.themeClass = syncTheme()
		},
		onLoad(options) {
			this.fid = options.fid || ''
			this.forumName = options.name ? decodeURIComponent(options.name) : '板块'
			uni.setNavigationBarTitle({
				title: this.forumName
			})
			// 进板块要求登录；停在加载态，避免跳转前闪一下「没有更多了」
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
			switchTab(key) {
				if (key === this.activeTab) {
					return
				}
				this.activeTab = key
				this.topics = []
				this.page = 0
				this.hasMore = true
				this.error = ''
				this.loadPage(1)
			},
			async loadPage(page) {
				// 热帖要连发几个请求，期间用户可能切了 tab，回来时结果已过期就丢弃
				const tab = this.activeTab
				if (page === 1) {
					this.loading = true
					this.error = ''
				} else {
					this.loadingMore = true
				}

				try {
					if (tab === 'hot') {
						const list = await this.loadHotTopic()
						if (tab !== this.activeTab) {
							return
						}
						this.topics = list
						this.page = 1
						// 热帖是本地统计出来的一次性列表，没有下一页
						this.hasMore = false
						return
					}

					const result = await fetchTopicList(this.fid, page, tab === 'postdate' ? 'postdatedesc' : '')
					if (tab !== this.activeTab) {
						return
					}
					const payload = result.result || {}
					const list = (payload.data || []).map(displayTopic)
					this.page = page
					this.topics = page === 1 ? list : this.topics.concat(list)
					this.hasMore = list.length > 0
				} catch (error) {
					if (tab !== this.activeTab) {
						return
					}
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
					if (tab === this.activeTab) {
						this.loading = false
						this.loadingMore = false
					}
				}
			},
			// 拉前几页默认列表，筛出 24 小时内发布的，按回复数倒序取前 N 条
			async loadHotTopic() {
				const now = Math.floor(Date.now() / 1000)
				const collected = []
				for (let page = 1; page <= HOT_PAGE_COUNT; page += 1) {
					const result = await fetchTopicList(this.fid, page)
					const list = (result.result && result.result.data) || []
					if (!list.length) {
						break
					}
					collected.push(...list)
				}
				return collected
					.filter((topic) => now - topic.postdate <= DAY_SECONDS)
					.sort((a, b) => b.replies - a.replies)
					.slice(0, HOT_TOPIC_COUNT)
					.map(displayTopic)
			},
			openTopic(topic) {
				uni.navigateTo({
					url: `/pages/post/detail?tid=${encodeURIComponent(topic.tid)}&subject=${encodeURIComponent(topic.subject || '')}`
				})
			},
			formatTime(timestamp) {
				if (!timestamp) {
					return ''
				}
				const date = new Date(timestamp * 1000)
				const pad = (value) => (value < 10 ? `0${value}` : `${value}`)
				return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
			}
		}
	}
</script>

<style>
	.page {
		min-height: 100vh;
		padding: 16rpx 40rpx 60rpx;
		box-sizing: border-box;
		background: var(--nga-bg);
	}

	/* 列表类型 tab（横向可滚动，窄屏也不会挤换行） */
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

	/* 主题列表 */
	.topics {
		padding: 8rpx 28rpx;
		border-radius: 12rpx;
		background: var(--nga-card);
		box-shadow: 0 12rpx 32rpx var(--nga-shadow);
	}

	.topic {
		padding: 28rpx 0;
		border-bottom: 1rpx solid var(--nga-line);
	}

	.topic:last-child {
		border-bottom: none;
	}

	.topic-subject {
		color: var(--nga-text);
		font-size: 30rpx;
		line-height: 1.5;
	}

	.topic-meta {
		display: flex;
		align-items: center;
		margin-top: 14rpx;
	}

	.topic-author {
		color: var(--nga-text-sub);
		font-size: 24rpx;
	}

	.topic-replies {
		margin-left: 20rpx;
		color: var(--nga-text-muted);
		font-size: 24rpx;
	}

	.topic-time {
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
