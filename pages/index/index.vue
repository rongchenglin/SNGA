<template>
	<view class="page" :class="themeClass" :style="{ paddingTop: statusBarHeight + 'px' }">
		<view class="header">
			<view class="header-left">
				<!-- 搜索入口：static 里没有搜索图标，放大镜用两个 view 拼（圆 + 斜线） -->
				<view class="search-entry" @click="openSearch">
					<view class="search-icon">
						<view class="search-icon-lens"></view>
						<view class="search-icon-handle"></view>
					</view>
				</view>
				<view class="theme-toggle" @click="toggleTheme">
					<image
						class="theme-toggle-icon"
						:src="themeClass === 'theme-dark' ? '/static/icon-sun.png' : '/static/icon-moon.png'"
						mode="aspectFit"
					/>
					<text class="theme-toggle-text">{{ themeLabel }}</text>
				</view>
			</view>
			<view class="me" @click="openMe">
				<image v-if="me.avatar" class="me-avatar" :src="me.avatar" mode="aspectFill" />
				<view v-else class="me-avatar me-avatar--empty">
					<text class="me-avatar-text">NGA</text>
				</view>
				<view class="me-info">
					<text class="me-name">{{ me.name }}</text>
					<text class="me-meta">{{ meMeta }}</text>
				</view>
			</view>
		</view>

		<scroll-view v-if="categories.length" class="tabs" scroll-x>
			<view
				v-for="(category, index) in categories"
				:key="category._id"
				class="tab"
				:class="{ 'tab--active': index === activeIndex }"
				@click="activeIndex = index"
			>
				<text class="tab-text">{{ category.name }}</text>
			</view>
		</scroll-view>

		<view v-if="loading" class="state">
			<text class="state-text">正在加载板块...</text>
		</view>

		<view v-else-if="error" class="state">
			<text class="state-text state-text--error">{{ error }}</text>
			<button class="retry" @click="loadCategories">重试</button>
		</view>

		<view v-else class="forums">
			<view v-for="group in groups" :key="group.id" class="group">
				<text class="group-name">{{ group.name }}</text>
				<view class="forum-list">
					<view
						v-for="forum in group.forums"
						:key="forum.fid"
						class="forum"
						@click="openForum(forum)"
					>
						<text class="forum-name">{{ forum.name }}</text>
						<text v-if="forum.info" class="forum-info">{{ forum.info }}</text>
					</view>
				</view>
			</view>
		</view>
	</view>
</template>

<script>
	import { getAuth, getUserName, isLoggedIn } from '../../utils/auth'
	import { goToLogin } from '../../utils/navigation'
	import { fetchForumCategory, fetchUserProfile } from '../../utils/api'
	import { avatarUrl, decodeNgaText } from '../../utils/user'
	import { MODE_LABELS, switchTheme, syncTheme, themeMode } from '../../utils/theme'

	export default {
		data() {
			return {
				categories: [],
				activeIndex: 0,
				themeClass: '',
				themeMode: 'auto', // 跟随系统 / 日间 / 夜间，点按钮循环
				// 首页用的是自定义导航栏，内容会顶到状态栏下面，需要自己补状态栏高度
				statusBarHeight: 0,
				me: { uid: '', name: '', avatar: '', group: '', posts: 0 },
				loading: false,
				error: ''
			}
		},
		computed: {
			themeLabel() {
				return MODE_LABELS[this.themeMode] || MODE_LABELS.auto
			},
			groups() {
				const category = this.categories[this.activeIndex]
				return category ? (category.groups || []) : []
			},
			// 没有用户组和发帖数时退化成 uid，避免第二行空着
			meMeta() {
				if (!this.me.uid) {
					return '点击登录'
				}
				const parts = []
				if (this.me.group) {
					parts.push(this.me.group)
				}
				if (this.me.posts) {
					parts.push(`发帖 ${this.me.posts}`)
				}
				return parts.length ? parts.join(' · ') : `uid ${this.me.uid}`
			}
		},
		onLoad() {
			try {
				// 取不到（个别平台返回 0）时给个下限，避免顶部又顶回状态栏
				const info = uni.getSystemInfoSync()
				this.statusBarHeight = Math.max(info.statusBarHeight || 0, 20)
			} catch (error) {
				this.statusBarHeight = 20
			}
			// 板块列表不登录也能看，所以首页不再强制登录
			this.loadMe()
			this.loadCategories()
		},
		onShow() {
			this.themeClass = syncTheme()
			this.themeMode = themeMode()
		},
		methods: {
			toggleTheme() {
				this.themeMode = switchTheme()
				this.themeClass = syncTheme()
			},
			// 未登录只显示占位；已登录先用登录 Cookie 里的名字占位（本地、即时），
			// 拿到资料接口后以接口名字为准 —— 接口名才是 NGA 的显示名，cookie 里的可能是坏编码
			async loadMe() {
				const auth = getAuth() || {}
				this.me.uid = auth.uid || ''
				if (!isLoggedIn()) {
					this.me.name = '未登录'
					return
				}
				const localName = getUserName()
				this.me.name = localName || '我'
				try {
					const body = await fetchUserProfile(this.me.uid)
					const user = body.result || {}
					this.me.avatar = avatarUrl(user.avatar)
					this.me.group = user.group || ''
					this.me.posts = user.posts || 0
					const apiName = decodeNgaText(user.username)
					// 访客态接口会把名字遮成 UID123456，这种才退回本地名字
					if (apiName && !/^uid[:：]?\d+$/i.test(apiName)) {
						this.me.name = apiName
					}
				} catch (error) {
					// 资料取不到不影响首页其他内容
				}
			},
			openMe() {
				if (!this.me.uid) {
					goToLogin()
					return
				}
				uni.navigateTo({
					url: `/pages/user/profile?uid=${encodeURIComponent(this.me.uid)}&name=${encodeURIComponent(this.me.name)}`
				})
			},
			async loadCategories() {
				this.loading = true
				this.error = ''
				try {
					const data = await fetchForumCategory()
					this.categories = data.result || []
				} catch (error) {
					this.error = error.message || '板块加载失败'
				} finally {
					this.loading = false
				}
			},
			openForum(forum) {
				uni.navigateTo({
					url: `/pages/topic/list?fid=${encodeURIComponent(forum.fid)}&name=${encodeURIComponent(forum.name)}`
				})
			},
			openSearch() {
				uni.navigateTo({
					url: '/pages/search/index'
				})
			}
		}
	}
</script>

<style>
	.page {
		min-height: 100vh;
		background: var(--nga-bg);
	}

	/* 顶栏：左边搜索 + 夜间，右边是登录用户卡 */
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 32rpx 40rpx 24rpx;
	}

	.header-left {
		display: flex;
		align-items: center;
	}

	/* 与夜间按钮同一套胶囊样式，里面只放放大镜图标 */
	.search-entry {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 40rpx;
		margin-right: 16rpx;
		padding: 0 18rpx;
		border: 1rpx solid var(--nga-border);
		border-radius: 22rpx;
	}

	.search-icon {
		position: relative;
		width: 24rpx;
		height: 24rpx;
	}

	.search-icon-lens {
		width: 20rpx;
		height: 20rpx;
		border: 3rpx solid var(--nga-text-sub);
		border-radius: 50%;
	}

	.search-icon-handle {
		position: absolute;
		right: -6rpx;
		bottom: -2rpx;
		width: 12rpx;
		height: 3rpx;
		background: var(--nga-text-sub);
		transform: rotate(45deg);
	}

	.theme-toggle {
		display: flex;
		align-items: center;
		padding: 0 16rpx;
		border: 1rpx solid var(--nga-border);
		border-radius: 22rpx;
		line-height: 38rpx;
	}

	.theme-toggle-icon {
		width: 24rpx;
		height: 24rpx;
		margin-right: 8rpx;
	}

	.theme-toggle-text {
		color: var(--nga-text-sub);
		font-size: 20rpx;
	}

	.me {
		display: flex;
		align-items: center;
		max-width: 380rpx;
	}

	.me-avatar {
		width: 76rpx;
		height: 76rpx;
		border-radius: 50%;
		background: var(--nga-fill);
	}

	.me-avatar--empty {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.me-avatar-text {
		color: var(--nga-text-faint);
		font-size: 22rpx;
		font-weight: 700;
	}

	.me-info {
		flex: 1;
		margin-left: 16rpx;
		overflow: hidden;
	}

	.me-name {
		display: block;
		overflow: hidden;
		color: var(--nga-text);
		font-size: 30rpx;
		font-weight: 600;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.me-meta {
		display: block;
		margin-top: 6rpx;
		overflow: hidden;
		color: var(--nga-text-muted);
		font-size: 22rpx;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	/* 分类 tab */	.tabs {
		width: 100%;
		white-space: nowrap;
		padding: 8rpx 0 8rpx 40rpx;
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

	/* 板块列表 */
	.forums {
		padding: 16rpx 40rpx 60rpx;
	}

	.group {
		margin-top: 32rpx;
	}

	.group-name {
		display: block;
		margin-bottom: 16rpx;
		color: var(--nga-text-muted);
		font-size: 24rpx;
	}

	.forum-list {
		padding: 8rpx 28rpx;
		border-radius: 12rpx;
		background: var(--nga-card);
		box-shadow: 0 12rpx 32rpx var(--nga-shadow);
	}

	.forum {
		padding: 26rpx 0;
		border-bottom: 1rpx solid var(--nga-line);
	}

	.forum:last-child {
		border-bottom: none;
	}

	.forum-name {
		color: var(--nga-text);
		font-size: 30rpx;
	}

	.forum-info {
		margin-left: 16rpx;
		color: var(--nga-text-faint);
		font-size: 24rpx;
	}
</style>
