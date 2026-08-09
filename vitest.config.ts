import { defineConfig } from 'vitest/config';
import path from 'path';

if (process.platform === 'win32') {
	const cwd = process.cwd();
	if (cwd[0] !== cwd[0].toUpperCase()) {
		process.chdir(cwd[0].toUpperCase() + cwd.slice(1));
	}
}

export default defineConfig({
	resolve: {
		alias: {
			obsidian: path.resolve(__dirname, 'tests/helpers/obsidian-mock.ts'),
		},
	},
	test: {
		include: ['tests/**/*.test.ts'],
		pool: 'threads',
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.d.ts'],
			reporter: ['text', 'text-summary'],
		},
	},
});
