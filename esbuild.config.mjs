import esbuild from 'esbuild';
import process from 'process';
import builtins from 'module';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
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

const NOBLE_COPY_FILTER = (src) => !src.includes('test') && !src.includes('examples') && !src.includes('assets');

function findNodeFiles(dir) {
	const results = [];
	const walk = (d, rel) => {
		for (const entry of readdirSync(d, { withFileTypes: true })) {
			const fullPath = join(d, entry.name);
			if (!NOBLE_COPY_FILTER(fullPath)) continue;
			const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
			if (entry.isDirectory()) walk(fullPath, entryRel);
			else if (entry.name.endsWith('.node')) results.push(entryRel);
		}
	};
	walk(dir, '');
	return results;
}

function copyNobleToDir(targetDir) {
	const nobleOut = join(targetDir, 'noble');
	try {
		cpSync(NOBLE_PKG, nobleOut, {
			recursive: true,
			force: true,
			filter: NOBLE_COPY_FILTER,
		});
	} catch (e) {
		if (e.code === 'EIO' || e.code === 'EBUSY') {
			console.log('  noble .node file locked (Obsidian running) — skipping copy');
			return;
		}
		throw e;
	}

	const nodeFiles = findNodeFiles(NOBLE_PKG);
	for (const relPath of nodeFiles) {
		const src = join(NOBLE_PKG, relPath);
		const dst = join(nobleOut, relPath);
		if (!existsSync(dst)) {
			console.warn(`  ⚠ noble .node file missing after copy: ${relPath}`);
			continue;
		}
		const srcSize = statSync(src).size;
		const dstSize = statSync(dst).size;
		if (srcSize !== dstSize) {
			console.warn(`  ⚠ noble .node file size mismatch: ${relPath} (${srcSize} → ${dstSize})`);
		}
	}

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
