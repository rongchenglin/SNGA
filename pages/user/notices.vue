<template>
	<view class="page" :class="themeClass">
		<view v-if="loading" class="state">
			<text class="state-text">正在加载提醒...</text>
		</view>

		<view v-else-if="error" class="state">
			<text class="state-text state-text--error">{{ error }}</text>
			<button class="retry" @click="load">重试</button>
		</view>

		<view v-else-if="items.length" class="items">
			<view v-for="(item, index) in items" :key="index" class="item" @click="openReply(item)">
				<text class="item-title">{{ item.title }}</text>
				<view class="item-meta">
					<text class="item-user">{{ item.userName }}</text>
					<text class="item-time">{{ item.time }}</text>
				</view>
			</view>

			<view class="clear-wrap" @click="onClear">
				<text class="clear-text">清空提醒</text>
			</view>
		</view>

		<view v-else class="state">
			<text class="state-text">暂无回复提醒</text>
		</view>
	</view>
</template>

<script>
	import { fetchNotifications, clearNotifications } from '../../utils/api'
	import { isLoggedIn } from '../../utils/auth'
	import { goToLogin } from '../../utils/navigation'
	import { syncTheme } from '../../utils/theme'

	// 把响应剥成 JSON（可能带 window.script_muti_get_var_store= 前缀）
	// 返回 { data: { "0": { "0": [], "1": [], unread } } }
	function parseNotifications(raw) {
		if (raw == null) {
			return { reply: [], message: [] }
		}
		let text = raw
		if (typeof text === 'object') {
			text = JSON.stringify(text)
		}
		if (typeof text === 'string' && text.indexOf('window.script_muti_get_var_store=') === 0) {
			text = text.slice('window.script_muti_get_var_store='.length)
		}
		let data
		try {
			data = JSON.parse(text)
		} catch (error) {
			return { reply: [], message: [] }
		}
		const group = data && data.data && data.data['0'] ? data.data['0'] : null
		return {
			reply: (group && group['0']) || [],
			message: (group && group['1']) || []
		}
	}

	// 每条是数组：[0]=type, [1]=uid, [2]=用户名, [5]=标题, [6]=tid, [7或8]=pid, [9]=时间戳
	function toItem(raw) {
		const arr = Array.isArray(raw) ? raw : []
		return {
			userName: arr[2] != null ? String(arr[2]) : '',
			title: arr[5] != null ? String(arr[5]) : '（无标题）',
			tid: arr[6] != null ? String(arr[6]) : '',
			pid: arr[7] != null ? String(arr[7]) : (arr[8] != null ? String(arr[8]) : ''),
			time: arr[9] != null ? String(arr[9]) : ''
		}
	}

	export default {
		data() {
			return {
				themeClass: '',
				items: [],
				loading: false,
				error: ''
			}
		},
		onShow() {
			this.themeClass = syncTheme()
		},
		onLoad() {
			uni.setNavigationBarTitle({ title: '回复提醒' })
			if (!isLoggedIn()) {
				this.loading = true
				goToLogin()
				return
			}
			this.load()
		},
		methods: {
			async load() {
				this.loading = true
				this.error = ''
				try {
					const raw = await fetchNotifications()
					const parsed = parseNotifications(raw)
					// 先展示「最近被喷」，有需要再并入短消息
					this.items = (parsed.reply || []).map(toItem)
				} catch (error) {
					this.error = error.message || '提醒加载失败'
				} finally {
					this.loading = false
				}
			},
			openReply(item) {
				if (!item.tid) {
					return
				}
				uni.navigateTo({
					url: `/pages/post/detail?tid=${encodeURIComponent(item.tid)}&subject=${encodeURIComponent(item.title)}`
				})
			},
			onClear() {
				uni.showModal({
					content: '确定清空全部回复提醒？',
					success: (res) => {
						if (!res.confirm) {
							return
						}
						clearNotifications()
							.then(() => {
								this.items = []
								uni.showToast({ title: '已清空', icon: 'none' })
							})
							.catch((error) => {
								uni.showToast({ title: (error && error.message) || '清空失败', icon: 'none' })
							})
					}
				})
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

	.item-title {
		color: var(--nga-text);
		font-size: 30rpx;
		line-height: 1.5;
	}

	.item-meta {
		display: flex;
		align-items: center;
		margin-top: 14rpx;
	}

	.item-user {
		color: var(--nga-text-sub);
		font-size: 24rpx;
	}

	.item-time {
		margin-left: auto;
		color: var(--nga-text-faint);
		font-size: 24rpx;
	}

	.clear-wrap {
		padding: 28rpx 0 12rpx;
		text-align: center;
	}

	.clear-text {
		color: var(--nga-danger);
		font-size: 26rpx;
	}
</style>
