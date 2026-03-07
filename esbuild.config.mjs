import esbuild from 'esbuild';
import process from 'process';
import builtins from 'module';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

if (existsSync('.env')) {
	for (const line of readFileSync('.env', 'utf8').split('\n')) {
		const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
		if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
	}
}

const prod = process.argv[2] === 'production';
const VAULT_PLUGIN_DIR = process.env.VAULT_PLUGIN_DIR;
const NOBLE_RESOLVED = process.env.NOBLE_PATH || resolve('node_modules/@stoprocent/noble');

const copyToVault = {
	name: 'copy-to-vault',
	setup(build) {
		build.onEnd((result) => {
			if (result.errors.length > 0 || !VAULT_PLUGIN_DIR) return;
			mkdirSync(VAULT_PLUGIN_DIR, { recursive: true });
			copyFileSync('main.js', `${VAULT_PLUGIN_DIR}/main.js`);
			copyFileSync('manifest.json', `${VAULT_PLUGIN_DIR}/manifest.json`);
			const css = readFileSync('fonts.css', 'utf8') + readFileSync('styles.css', 'utf8');
			writeFileSync(`${VAULT_PLUGIN_DIR}/styles.css`, css);
		});
	},
};

const context = await esbuild.context({
	entryPoints: ['src/main.ts'],
	bundle: true,
	external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*', '@stoprocent/noble', ...builtins.builtinModules],
	format: 'cjs',
	target: 'es2022',
	logLevel: 'info',
	sourcemap: prod ? false : 'inline',
	treeShaking: true,
	define: { 'process.env.NOBLE_PATH': JSON.stringify(NOBLE_RESOLVED) },
	outfile: 'main.js',
	minify: prod,
	plugins: [copyToVault],
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
