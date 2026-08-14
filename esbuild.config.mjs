import esbuild from 'esbuild';
import process from 'process';
import builtins from 'module';
import { existsSync, readFileSync, writeFileSync } from 'fs';

if (existsSync('.env')) {
	for (const line of readFileSync('.env', 'utf8').split('\n')) {
		const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
		if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
	}
}

const mode = process.argv[2] ?? 'watch';
const prod = mode === 'production';

const context = await esbuild.context({
	entryPoints: ['src/main.ts'],
	bundle: true,
	external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*', '@stoprocent/noble', ...builtins.builtinModules],
	format: 'cjs',
	target: 'es2022',
	logLevel: 'info',
	sourcemap: prod ? false : 'inline',
	treeShaking: true,
	outfile: 'build/main.js',
	minify: prod,
});

if (prod) {
	await context.rebuild();
	writeFileSync('build/styles.css', readFileSync('src/styles/fonts.css', 'utf8') + readFileSync('src/styles/base.css', 'utf8'));
	process.exit(0);
} else {
	await context.watch();
}
