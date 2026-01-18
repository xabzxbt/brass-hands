import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: {
			$lib: '/src/lib'
		}
	},
	server: {
		port: 5173,
		strictPort: false
	},
	build: {
		target: 'esnext'
	},
	optimizeDeps: {
		include: ['@wagmi/core', 'viem', '@reown/appkit']
	}
});
