import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		exclude: [
			'dist/**',
			'out/**',
			'src/integration/**',
			'**/node_modules/**',
		],
	},
});
