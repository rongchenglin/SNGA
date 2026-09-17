<template>
	<view class="page" :class="themeClass">
		<view v-if="items.length" class="items">
			<view v-for="(item, index) in items" :key="`${item.tid}-${index}`" class="item" @click="openTopic(item)">
				<text class="item-subject">{{ item.subject || '（无标题）' }}</text>
				<text class="item-time">{{ formatTime(item.time) }}</text>
			</view>

			<view class="clear-wrap" @click="onClear">
				<text class="clear-text">清空历史</text>
			</view>
		</view>

		<view v-else class="state">
			<text class="state-text">还没有阅读记录</text>
		</view>
	</view>
</template>

<script>
	import { clearHistory, readHistory } from '../../utils/history'
	import { syncTheme } from '../../utils/theme'

	export default {
		data() {
			return {
				themeClass: '',
				items: []
			}
		},
		onShow() {
			this.themeClass = syncTheme()
			// 从帖子返回时也能看到最新记录，所以放 onShow 里读
			this.items = readHistory()
		},
		onLoad() {
			uni.setNavigationBarTitle({ title: '阅读历史' })
		},
		methods: {
			openTopic(item) {
				uni.navigateTo({
					url: `/pages/post/detail?tid=${encodeURIComponent(item.tid)}&subject=${encodeURIComponent(item.subject || '')}`
				})
			},
			onClear() {
				uni.showModal({
					content: '确定清空全部阅读历史？',
					success: (res) => {
						if (!res.confirm) {
							return
						}
						clearHistory()
						this.items = []
					}
				})
			},
			formatTime(timestamp) {
				if (!timestamp) {
					return ''
				}
				const date = new Date(timestamp)
				const pad = (value) => (value < 10 ? `0${value}` : `${value}`)
				return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
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

	.items {
		padding: 8rpx 28rpx;
		border-radius: 12rpx;
		background: var(--nga-card);
		box-shadow: 0 12rpx 32rpx var(--nga-shadow);
	}

	.item {
		display: flex;
		align-items: center;
		padding: 28rpx 0;
		border-bottom: 1rpx solid var(--nga-line);
	}

	.item:last-child {
		border-bottom: none;
	}

	.item-subject {
		flex: 1;
		overflow: hidden;
		color: var(--nga-text);
		font-size: 30rpx;
		line-height: 1.5;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.item-time {
		flex-shrink: 0;
		margin-left: 20rpx;
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
