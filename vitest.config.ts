import { realpathSync } from 'fs';
import { defineConfig } from 'vitest/config';

const normalizedCwd = realpathSync.native(process.cwd());
if (process.cwd() !== normalizedCwd) {
	process.chdir(normalizedCwd);
}

export default defineConfig({
	test: {
		root: normalizedCwd,
		include: ['src/**/*.test.ts'],
		pool: 'forks',
		fileParallelism: false,
	},
});
