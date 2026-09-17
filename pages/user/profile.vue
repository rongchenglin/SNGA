<template>
	<view class="page" :class="themeClass">
		<view v-if="loading" class="state">
			<text class="state-text">正在加载用户资料...</text>
		</view>

		<view v-else-if="error" class="state">
			<text class="state-text state-text--error">{{ error }}</text>
			<button class="retry" @click="load">重试</button>
		</view>

		<view v-else>
			<view class="card profile">
				<image v-if="avatar" class="avatar" :src="avatar" mode="aspectFill" />
				<view v-else class="avatar avatar--empty">
					<text class="avatar-text">NGA</text>
				</view>
				<view class="profile-main">
					<text class="name">{{ name }}</text>
					<text v-if="user.group" class="group">{{ user.group }}</text>
					<text class="uid">uid {{ user.uid }}</text>
				</view>
			</view>

			<view class="card actions">
				<view class="action" @click="openActivity(false)">
					<text class="action-text">查看此人主题</text>
					<text class="action-arrow">›</text>
				</view>
				<view class="action" @click="openActivity(true)">
					<text class="action-text">查看此人回复</text>
					<text class="action-arrow">›</text>
				</view>
			</view>

			<!-- 收藏 / 回复提醒 / 按链接打开都是「我」的数据，只在看自己时显示 -->
			<view v-if="isMe" class="card actions">
				<view class="action" @click="openPage('favorites')">
					<text class="action-text">我的收藏</text>
					<text class="action-arrow">›</text>
				</view>
				<view class="action" @click="openPage('notices')">
					<text class="action-text">回复提醒</text>
					<text class="action-arrow">›</text>
				</view>
				<view class="action" @click="openPage('history')">
					<text class="action-text">阅读历史</text>
					<text class="action-arrow">›</text>
				</view>
				<view class="action" @click="openPage('url-reader')">
					<text class="action-text">按链接打开</text>
					<text class="action-arrow">›</text>
				</view>
				<view class="action" @click="openFontSize">
					<text class="action-text">阅读字号</text>
					<text class="action-value">{{ fontSizeLabel }}</text>
					<text class="action-arrow">›</text>
				</view>
			</view>

			<view class="card">
				<view v-for="item in fields" :key="item.label" class="row">
					<text class="label">{{ item.label }}</text>
					<text class="value" selectable>{{ item.value }}</text>
				</view>
			</view>

			<view v-if="signature" class="card">
				<text class="label">签名</text>
				<rich-text class="sign-content" :nodes="signature"></rich-text>
			</view>

			<button v-if="isMe" class="logout" @click="logout">退出登录</button>
		</view>

		<!-- 阅读字号三档选择 -->
		<uni-popup ref="fontPopup" type="center">
			<view class="font-dialog">
				<text class="font-dialog-title">阅读字号</text>
				<view
					v-for="mode in fontModes"
					:key="mode.key"
					class="font-option"
					:class="{ 'font-option--on': mode.key === fontSize }"
					@click="onFontPick(mode.key)"
				>
					<text class="font-option-text">{{ mode.label }}</text>
				</view>
			</view>
		</uni-popup>
	</view>
</template>

<script>
	import { fetchUserProfile } from '../../utils/api'
	import { renderContent } from '../../utils/bbcode'
	import { avatarUrl, decodeNgaText } from '../../utils/user'
	import { clearAuth, getAuth } from '../../utils/auth'
	import { goToLogin } from '../../utils/navigation'
	import { FONT_LABELS, fontSizeMode, setFontSizeMode } from '../../utils/fontSize'
	import { syncTheme } from '../../utils/theme'

	// regdate 是秒级时间戳
	function formatDate(timestamp) {
		if (!timestamp) {
			return ''
		}
		const date = new Date(timestamp * 1000)
		const pad = (value) => (value < 10 ? `0${value}` : `${value}`)
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
	}

	export default {
		data() {
			return {
				uid: '',
				themeClass: '',
				user: {},
				isMe: false,
				fontSize: 'normal', // 阅读字号档位：small / normal / large
				fontModes: [
					{ key: 'small', label: FONT_LABELS.small },
					{ key: 'normal', label: FONT_LABELS.normal },
					{ key: 'large', label: FONT_LABELS.large }
				],
				loading: false,
				error: ''
			}
		},
		computed: {
			name() {
				return decodeNgaText(this.user.username) || '未知用户'
			},
			avatar() {
				return avatarUrl(this.user.avatar)
			},
			signature() {
				return this.user.signature ? renderContent(this.user.signature) : ''
			},
			fields() {
				return [
					{ label: '发帖数', value: this.user.posts },
					{ label: '威望', value: this.user.rvrc },
					{ label: '金钱', value: this.user.money },
					{ label: '注册时间', value: formatDate(this.user.regdate) },
					{ label: '所在地', value: this.user.ipLoc },
					{ label: '荣誉', value: this.user.honor }
				].filter((item) => item.value !== '' && item.value !== undefined && item.value !== null)
			},
			fontSizeLabel() {
				return FONT_LABELS[this.fontSize] || FONT_LABELS.normal
			}
		},
		onShow() {
			this.themeClass = syncTheme()
			this.fontSize = fontSizeMode()
		},
		onLoad(options) {
			this.uid = options.uid || ''
			const auth = getAuth() || {}
			this.isMe = Boolean(auth.uid) && String(auth.uid) === String(this.uid)
			if (options.name) {
				uni.setNavigationBarTitle({
					title: decodeURIComponent(options.name)
				})
			}
			this.load()
		},
		methods: {
			logout() {
				clearAuth()
				goToLogin()
			},
			// ta 的主题 / 回复列表（两个列表同一个页面，用 tab 切换）
			openActivity(reply) {
				uni.navigateTo({
					url: `/pages/user/activity?uid=${encodeURIComponent(this.uid)}&reply=${reply ? 1 : 0}&name=${encodeURIComponent(this.name)}`
				})
			},
			// 我的收藏 / 回复提醒 / 按链接打开
			openPage(page) {
				uni.navigateTo({
					url: `/pages/user/${page}`
				})
			},
			openFontSize() {
				const popup = this.$refs.fontPopup
				if (popup) {
					popup.open()
				}
			},
			onFontPick(key) {
				setFontSizeMode(key)
				this.fontSize = fontSizeMode()
				const popup = this.$refs.fontPopup
				if (popup) {
					popup.close()
				}
			},
			async load() {
				if (!this.uid) {
					this.error = '缺少 uid'
					return
				}

				this.loading = true
				this.error = ''

				try {
					const body = await fetchUserProfile(this.uid)
					const user = body.result || {}
					if (!user.uid) {
						this.error = '用户不存在'
						return
					}
					this.user = user
					const name = decodeNgaText(user.username)
					if (name) {
						uni.setNavigationBarTitle({
							title: name
						})
					}
				} catch (error) {
					this.error = error.message || '用户资料加载失败'
				} finally {
					this.loading = false
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

	/* 资料卡 */
	.card {
		margin-bottom: 20rpx;
		padding: 28rpx;
		border-radius: 12rpx;
		background: var(--nga-card);
		box-shadow: 0 12rpx 32rpx var(--nga-shadow);
	}

	.profile {
		display: flex;
		align-items: center;
	}

	.avatar {
		width: 132rpx;
		height: 132rpx;
		border-radius: 50%;
		background: var(--nga-fill);
	}

	.avatar--empty {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.avatar-text {
		color: var(--nga-text-faint);
		font-size: 32rpx;
		font-weight: 700;
	}

	.profile-main {
		margin-left: 28rpx;
	}

	.name {
		display: block;
		color: var(--nga-text);
		font-size: 36rpx;
		font-weight: 600;
	}

	.group {
		display: block;
		margin-top: 10rpx;
		color: var(--nga-accent);
		font-size: 26rpx;
	}

	.uid {
		display: block;
		margin-top: 10rpx;
		color: var(--nga-text-faint);
		font-size: 24rpx;
	}

	.row {
		display: flex;
		align-items: flex-start;
		padding: 18rpx 0;
		border-bottom: 1rpx solid var(--nga-line);
	}

	.row:last-child {
		border-bottom: none;
	}

	/* 查看此人主题 / 回复 */
	.action {
		display: flex;
		align-items: center;
		padding: 24rpx 0;
		border-bottom: 1rpx solid var(--nga-line);
	}

	.action:last-child {
		border-bottom: none;
	}

	.action-text {
		color: var(--nga-text);
		font-size: 28rpx;
	}

	/* 右侧当前值（如「阅读字号」的档位） */
	.action-value {
		margin-left: auto;
		color: var(--nga-text-muted);
		font-size: 26rpx;
	}

	.action-arrow {
		margin-left: auto;
		color: var(--nga-text-faint);
		font-size: 32rpx;
	}

	/* 有当前值时箭头紧跟其后，别让两处 auto 把留白均分 */
	.action-value + .action-arrow {
		margin-left: 12rpx;
	}

	/* 阅读字号选择弹窗 */
	.font-dialog {
		width: 520rpx;
		padding: 40rpx 0 20rpx;
		border-radius: 20rpx;
		background: var(--nga-card);
		box-shadow: 0 20rpx 60rpx rgba(0, 0, 0, 0.18);
	}

	.font-dialog-title {
		display: block;
		margin-bottom: 20rpx;
		color: var(--nga-text);
		font-size: 32rpx;
		font-weight: bold;
		text-align: center;
	}

	.font-option {
		margin: 0 24rpx 16rpx;
		border-radius: 12rpx;
		background: var(--nga-fill);
		text-align: center;
		line-height: 88rpx;
	}

	.font-option-text {
		color: var(--nga-text-sub);
		font-size: 30rpx;
	}

	.font-option--on {
		background: var(--nga-accent);
	}

	.font-option--on .font-option-text {
		color: #fff;
		font-weight: bold;
	}

	.label {
		width: 140rpx;
		color: var(--nga-text-muted);
		font-size: 26rpx;
	}

	.value {
		flex: 1;
		color: var(--nga-text);
		font-size: 26rpx;
		word-break: break-all;
	}

	.sign-content {
		margin-top: 12rpx;
		color: var(--nga-text);
		font-size: 26rpx;
		line-height: 1.7;
	}

	.logout {
		margin: 32rpx 0 0;
		border: 1rpx solid var(--nga-danger-line);
		border-radius: 12rpx;
		background: var(--nga-card);
		color: var(--nga-danger);
		font-size: 30rpx;
		line-height: 88rpx;
	}

	.logout::after {
		border: none;
	}
</style>
