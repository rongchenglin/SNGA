<template>
	<view class="page" :class="themeClass">
		<view class="card">
			<text class="label">粘贴 NGA 链接</text>
			<textarea
				class="url-input"
				v-model="url"
				auto-height
				placeholder="例如 https://bbs.nga.cn/read.php?tid=123456"
				placeholder-class="url-placeholder"
			/>
			<view class="open-btn" @click="onOpen">
				<text class="open-btn-text">打开</text>
			</view>
		</view>

		<view class="card tips">
			<text class="tip">支持的链接：</text>
			<text class="tip">· read.php?tid=... 或 read.php?pid=...&tid=... → 打开帖子</text>
			<text class="tip">· thread.php?fid=... → 打开板块</text>
		</view>
	</view>
</template>

<script>
	import { syncTheme } from '../../utils/theme'

	/**
	 * 解析 NGA 链接
	 * 只认 read.php（tid / pid）和 thread.php（fid）；stid 子版块暂不支持
	 */
	function parseUrl(input) {
		const text = (input || '').trim()
		if (!text) {
			return { error: '请输入链接' }
		}
		// query 可能出现在 ? 或 & 之后，简单切一遍够用
		const query = text.split('?')[1] || text.split('&').slice(1).join('&')
		const params = {}
		query.split('&').forEach((pair) => {
			const index = pair.indexOf('=')
			if (index > 0) {
				params[pair.slice(0, index).toLowerCase()] = pair.slice(index + 1)
			}
		})

		const tid = (params.tid || '').match(/\d+/)
		if (tid) {
			return { tid: tid[0] }
		}
		if (text.indexOf('read.php') !== -1 && params.pid) {
			// 打开帖子必须有 tid，光有 pid 定位不到主题
			return { error: '这个链接里没有 tid，打不开' }
		}
		const fid = (params.fid || '').match(/-?\d+/)
		if (fid) {
			return { fid: fid[0] }
		}
		if (params.stid) {
			return { error: '暂不支持子版块（stid）链接' }
		}
		return { error: '看不懂这个链接' }
	}

	export default {
		data() {
			return {
				themeClass: '',
				url: ''
			}
		},
		onShow() {
			this.themeClass = syncTheme()
		},
		onLoad() {
			uni.setNavigationBarTitle({ title: '按链接打开' })
		},
		methods: {
			onOpen() {
				const result = parseUrl(this.url)
				if (result.error) {
					uni.showToast({ title: result.error, icon: 'none' })
					return
				}
				if (result.tid) {
					uni.navigateTo({
						url: `/pages/post/detail?tid=${encodeURIComponent(result.tid)}`
					})
					return
				}
				uni.navigateTo({
					url: `/pages/topic/list?fid=${encodeURIComponent(result.fid)}`
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

	.card {
		margin-bottom: 20rpx;
		padding: 28rpx;
		border-radius: 12rpx;
		background: var(--nga-card);
		box-shadow: 0 12rpx 32rpx var(--nga-shadow);
	}

	.label {
		display: block;
		margin-bottom: 16rpx;
		color: var(--nga-text-muted);
		font-size: 26rpx;
	}

	.url-input {
		width: 100%;
		min-height: 140rpx;
		box-sizing: border-box;
		padding: 20rpx 24rpx;
		border-radius: 8rpx;
		background: var(--nga-fill);
		color: var(--nga-text);
		font-size: 28rpx;
		line-height: 1.6;
	}

	.url-placeholder {
		color: var(--nga-text-faint);
	}

	.open-btn {
		margin-top: 24rpx;
		border-radius: 8rpx;
		background: linear-gradient(135deg, #2b6cb0, #1e4e8c);
		text-align: center;
		line-height: 76rpx;
	}

	.open-btn-text {
		color: #fff;
		font-size: 30rpx;
	}

	.tips {
		box-shadow: none;
	}

	.tip {
		display: block;
		color: var(--nga-text-muted);
		font-size: 24rpx;
		line-height: 1.8;
	}
</style>
