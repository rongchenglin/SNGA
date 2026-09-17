import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

export default defineConfig({
	plugins: [uni()],
	server: {
		proxy: {
			// H5 本地调试用，绕过浏览器跨域限制；其他平台不走这里
			'/nga-api': {
				target: 'https://bbs.nga.cn',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/nga-api/, '')
			}
		}
	}
})
