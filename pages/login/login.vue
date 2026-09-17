<template>
	<view class="login-page" :class="themeClass">
		<view class="brand">
			<view class="brand-logo">
				<text class="brand-logo-text">NGA</text>
			</view>
			<text class="brand-title">欢迎回来</text>
			<text class="brand-subtitle">登录 NGA 社区账号</text>
		</view>

		<view class="form">
			<button class="submit-btn" @click="goWebLogin">
				<text>使用网页登录</text>
			</button>
		</view>
	</view>
</template>

<script>
	import { syncTheme } from '../../utils/theme'

	export default {
		data() {
			return {
				themeClass: ''
			}
		},
		onShow() {
			this.themeClass = syncTheme()
		},
		methods: {
			goWebLogin() {
				uni.navigateTo({
					url: '/pages/login/webview'
				})
			}
		}
	}
</script>

<style>
	.login-page {
		min-height: 100vh;
		padding: 120rpx 56rpx 60rpx;
		box-sizing: border-box;
		background: var(--nga-bg);
	}

	/* 品牌区 */
	.brand {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.brand-logo {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 132rpx;
		height: 132rpx;
		border-radius: 32rpx;
		background: linear-gradient(135deg, #2b6cb0, #1e4e8c);
		box-shadow: 0 16rpx 40rpx rgba(43, 108, 176, 0.28);
	}

	.brand-logo-text {
		color: #fff;
		font-size: 48rpx;
		font-weight: 700;
		letter-spacing: 4rpx;
	}

	.brand-title {
		margin-top: 36rpx;
		color: var(--nga-text);
		font-size: 44rpx;
		font-weight: 600;
	}

	.brand-subtitle {
		margin-top: 12rpx;
		color: var(--nga-text-muted);
		font-size: 26rpx;
	}

	/* 登录入口 */
	.form {
		margin-top: 72rpx;
	}

	.submit-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 96rpx;
		border: none;
		border-radius: 14rpx;
		background: linear-gradient(135deg, #2b6cb0, #1e4e8c);
		color: #fff;
		font-size: 32rpx;
		font-weight: 600;
		letter-spacing: 8rpx;
		line-height: 96rpx;
	}

	.submit-btn::after {
		border: none;
	}
</style>
