export function goToLogin() {
	// #ifdef H5
	if (typeof window !== 'undefined') {
		window.location.hash = '#/pages/login/login'
	}
	return
	// #endif

	uni.reLaunch({
		url: '/pages/login/login'
	})
}
