<template>
	<view class="page" :class="themeClass">
		<!-- 两个搜索维度：帖子搜索（关键词出列表）/ 用户搜索（找到人直接进主页） -->
		<scroll-view class="modes" scroll-x>
			<view
				v-for="mode in modes"
				:key="mode.key"
				class="mode"
				:class="{ 'mode--active': mode.key === activeMode }"
				@click="switchMode(mode.key)"
			>
				<text class="mode-text">{{ mode.label }}</text>
			</view>
		</scroll-view>

		<view class="search-bar">
			<input
				class="search-input"
				v-model="keyword"
				type="text"
				:placeholder="placeholder"
				placeholder-class="search-placeholder"
				confirm-type="search"
				@confirm="onSearch"
			/>
			<view class="search-btn" @click="onSearch">
				<text class="search-btn-text">{{ submitText }}</text>
			</view>
		</view>

		<!-- 用户搜索：按用户名（先换 uid）或直接按 uid 找 -->
		<view v-if="activeMode === 'user'" class="way-row">
			<text class="way-label">搜索方式</text>
			<view class="way" :class="{ 'way--active': userBy === 'name' }" @click="switchUserBy('name')">
				<text class="way-text">用户名</text>
			</view>
			<view class="way" :class="{ 'way--active': userBy === 'id' }" @click="switchUserBy('id')">
				<text class="way-text">用户 ID</text>
			</view>
		</view>

		<!-- 检索正文：只在按关键词搜帖子时出现 -->
		<view v-if="activeMode === 'topic'" class="filter" @click="withContent = !withContent">
			<view class="checkbox" :class="{ 'checkbox--on': withContent }">
				<text v-if="withContent" class="checkbox-tick">✓</text>
			</view>
			<text class="filter-text">检索正文（不只搜标题）</text>
		</view>

		<view v-if="loading" class="state">
			<text class="state-text">{{ loadingText }}</text>
		</view>

		<view v-else-if="error" class="state">
			<text class="state-text state-text--error">{{ error }}</text>
			<button v-if="activeMode === 'topic'" class="retry" @click="onSearch">重试</button>
		</view>

		<view v-else-if="items.length" class="items">
			<view v-for="(item, index) in items" :key="`${item.tid}-${index}`" class="item" @click="openTopic(item)">
				<text class="item-subject">{{ item.subject }}</text>
				<view class="item-meta">
					<text class="item-author">{{ item.author }}</text>
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

		<view v-else class="state">
			<text class="state-text">{{ emptyText }}</text>
		</view>
	</view>
</template>

<script>
	import { fetchUidByName, searchTopic } from '../../utils/api'
	import { syncTheme } from '../../utils/theme'

	const MODES = [
		{ key: 'topic', label: '帖子搜索' },
		{ key: 'user', label: '用户搜索' }
	]

	function toItem(row) {
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
				modes: MODES,
				activeMode: 'topic',
				userBy: 'name', // 用户搜索的方式：name（用户名）/ id（用户 ID）
				keyword: '', // 输入框里的内容
				withContent: false, // 帖子搜索的「检索正文」
				query: null, // 本次结果的条件快照，翻页时用它，避免请求期间改条件串页
				items: [],
				page: 0,
				hasMore: true,
				searched: false, // 是否搜过，用于区分初始空态和「没有结果」
				loading: false,
				loadingMore: false,
				error: ''
			}
		},
		computed: {
			placeholder() {
				if (this.activeMode === 'user') {
					return this.userBy === 'id' ? '用户 ID（数字）' : '用户名'
				}
				return '搜索 NGA 主题'
			},
			submitText() {
				return this.activeMode === 'user' ? '寻找用户' : '搜索'
			},
			loadingText() {
				return this.activeMode === 'user' ? '正在查找该用户...' : '正在搜索...'
			},
			emptyText() {
				if (this.activeMode === 'user') {
					return '输入用户名或用户 ID，直接进 ta 的主页'
				}
				return this.searched ? '没有找到相关主题' : '输入关键词搜索 NGA 主题'
			}
		},
		onShow() {
			this.themeClass = syncTheme()
		},
		onReachBottom() {
			if (this.query && this.hasMore && !this.loading && !this.loadingMore) {
				this.loadPage(this.page + 1)
			}
		},
		methods: {
			switchMode(key) {
				if (key === this.activeMode) {
					return
				}
				this.activeMode = key
				this.reset()
			},
			switchUserBy(by) {
				if (by === this.userBy) {
					return
				}
				this.userBy = by
				this.error = ''
			},
			reset() {
				this.query = null
				this.items = []
				this.page = 0
				this.hasMore = true
				this.searched = false
				this.error = ''
			},
			onSearch() {
				const keyword = this.keyword.trim()
				if (!keyword) {
					uni.showToast({
						title: this.activeMode === 'user'
							? (this.userBy === 'id' ? '请输入用户 ID' : '请输入用户名')
							: '请输入关键词',
						icon: 'none'
					})
					return
				}
				this.reset()
				if (this.activeMode === 'user') {
					this.searchUser(keyword)
					return
				}
				this.searched = true
				this.query = { keyword, content: this.withContent }
				this.loadPage(1)
			},
			// 用户搜索：不列 ta 的帖子，找到就进主页
			async searchUser(keyword) {
				if (this.userBy === 'id') {
					if (!/^\d+$/.test(keyword)) {
						this.error = '用户 ID 只能是数字'
						return
					}
					this.openProfile(keyword)
					return
				}
				// thread.php 的 author= 只认 GBK 编码的名字，这里先按名字换 uid
				this.loading = true
				try {
					const body = await fetchUidByName(keyword)
					const uid = (body.result && body.result.uid) || ''
					if (!uid) {
						this.error = `找不到用户「${keyword}」`
						return
					}
					this.openProfile(uid)
				} catch (error) {
					this.error = error.message || '用户查找失败'
				} finally {
					this.loading = false
				}
			},
			openProfile(uid) {
				uni.navigateTo({
					url: `/pages/user/profile?uid=${encodeURIComponent(uid)}`
				})
			},
			async loadPage(page) {
				// 条件在请求期间可能被改（换维度/重搜），回来时结果已过期就丢弃
				const query = this.query
				if (!query) {
					return
				}
				if (page === 1) {
					this.loading = true
					this.error = ''
				} else {
					this.loadingMore = true
				}

				try {
					const body = await searchTopic(query.keyword, page, query.content)
					if (query !== this.query) {
						return
					}
					const rows = (body.result && body.result.__T) || []
					const list = rows.filter((row) => row).map(toItem)
					this.page = page
					this.items = page === 1 ? list : this.items.concat(list)
					this.hasMore = list.length > 0
				} catch (error) {
					if (query !== this.query) {
						return
					}
					const message = error.message || '搜索失败'
					// 无结果时接口返回 2048「没有符合条件的结果」，这不是出错，按空列表显示
					if (page === 1 && message.indexOf('没有符合条件') !== -1) {
						this.items = []
						this.hasMore = false
					} else if (page === 1) {
						this.error = message
					} else {
						this.hasMore = false
						uni.showToast({
							title: message,
							icon: 'none'
						})
					}
				} finally {
					if (query === this.query) {
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

	/* 搜索维度 */
	.modes {
		width: 100%;
		white-space: nowrap;
		margin-bottom: 20rpx;
	}

	.mode {
		display: inline-block;
		margin-right: 16rpx;
		padding: 0 30rpx;
		border-radius: 32rpx;
		background: var(--nga-card);
		line-height: 64rpx;
	}

	.mode-text {
		color: var(--nga-text-sub);
		font-size: 28rpx;
	}

	.mode--active {
		background: linear-gradient(135deg, #2b6cb0, #1e4e8c);
	}

	.mode--active .mode-text {
		color: #fff;
	}

	/* 搜索栏 */
	.search-bar {
		display: flex;
		align-items: center;
		margin-bottom: 20rpx;
	}

	.search-input {
		flex: 1;
		height: 76rpx;
		padding: 0 28rpx;
		box-sizing: border-box;
		border-radius: 38rpx;
		background: var(--nga-card);
		color: var(--nga-text);
		font-size: 28rpx;
	}

	.search-placeholder {
		color: var(--nga-text-faint);
	}

	.search-btn {
		margin-left: 16rpx;
		padding: 0 32rpx;
		border-radius: 38rpx;
		background: linear-gradient(135deg, #2b6cb0, #1e4e8c);
		line-height: 76rpx;
	}

	.search-btn-text {
		color: #fff;
		font-size: 28rpx;
	}

	/* 用户搜索：搜索方式 */
	.way-row {
		display: flex;
		align-items: center;
		padding-bottom: 16rpx;
	}

	.way-label {
		margin-right: auto;
		color: var(--nga-text-muted);
		font-size: 26rpx;
	}

	.way {
		margin-left: 12rpx;
		padding: 0 26rpx;
		border-radius: 26rpx;
		background: var(--nga-card);
		line-height: 52rpx;
	}

	.way-text {
		color: var(--nga-text-sub);
		font-size: 26rpx;
	}

	.way--active {
		background: var(--nga-accent);
	}

	.way--active .way-text {
		color: #fff;
	}

	/* 检索正文 */
	.filter {
		display: flex;
		align-items: center;
		padding: 4rpx 8rpx 16rpx;
	}

	.checkbox {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32rpx;
		height: 32rpx;
		border: 2rpx solid var(--nga-border);
		border-radius: 6rpx;
		background: var(--nga-card);
	}

	.checkbox--on {
		border-color: transparent;
		background: var(--nga-accent);
	}

	.checkbox-tick {
		color: #fff;
		font-size: 22rpx;
		line-height: 1;
	}

	.filter-text {
		margin-left: 14rpx;
		color: var(--nga-text-sub);
		font-size: 26rpx;
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
		text-align: center;
	}

	.state-text--error {
		color: var(--nga-danger);
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

	/* 结果列表 */
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
