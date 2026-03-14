import { realpathSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

const projectRoot = realpathSync.native(resolve(__dirname));
process.chdir(projectRoot);

export default defineConfig({
	test: {
		root: projectRoot,
		include: ['src/**/*.test.ts'],
		pool: 'forks',
		fileParallelism: false,
	},
});
