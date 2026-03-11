import esbuild from 'esbuild';
import process from 'process';
import builtins from 'module';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

if (existsSync('.env')) {
	for (const line of readFileSync('.env', 'utf8').split('\n')) {
		const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
		if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
	}
}

const prod = process.argv[2] === 'production';
const VAULT_PLUGIN_DIR = process.env.VAULT_PLUGIN_DIR;
const NOBLE_PKG = resolve('node_modules/@stoprocent/noble');

function copyNobleToDir(targetDir) {
	const nobleOut = join(targetDir, 'noble');
	cpSync(NOBLE_PKG, nobleOut, {
		recursive: true,
		filter: (src) => !src.includes('test') && !src.includes('examples') && !src.includes('assets'),
	});

	const deps = ['node-gyp-build', 'debug', 'ms', 'node-addon-api'];
	for (const dep of deps) {
		const src = resolve(`node_modules/${dep}`);
		if (existsSync(src)) {
			cpSync(src, join(nobleOut, 'node_modules', dep), { recursive: true });
		}
	}
}

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
			copyNobleToDir(VAULT_PLUGIN_DIR);
		});
	},
};

const context = await esbuild.context({
	entryPoints: ['src/main.ts'],
	bundle: true,
	external: ['obsidian', 'electron', '@codemirror/*', '@lezer/*', ...builtins.builtinModules],
	format: 'cjs',
	target: 'es2022',
	logLevel: 'info',
	sourcemap: prod ? false : 'inline',
	treeShaking: true,
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
