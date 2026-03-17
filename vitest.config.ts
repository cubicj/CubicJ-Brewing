import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
	resolve: {
		alias: {
			obsidian: path.resolve(__dirname, 'src/test/obsidian-mock.ts'),
		},
	},
	test: {
		include: ['src/**/*.test.ts'],
		pool: 'threads',
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/test/**'],
			reporter: ['text', 'text-summary'],
		},
	},
});
