import { realpathSync } from 'fs';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		root: realpathSync.native(process.cwd()),
		include: ['src/**/*.test.ts'],
		pool: 'forks',
		fileParallelism: false,
	},
});
