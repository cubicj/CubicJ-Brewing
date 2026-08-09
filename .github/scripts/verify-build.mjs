import { readFileSync, existsSync, statSync, appendFileSync } from 'fs';

const failures = [];

function check(name, ok, detail) {
	if (!ok) failures.push(`${name}: ${detail}`);
}

function readJson(path) {
	return JSON.parse(readFileSync(path, 'utf8'));
}

const manifest = readJson('manifest.json');
const pkg = readJson('package.json');

check('version-sync', manifest.version === pkg.version, `manifest.json has ${manifest.version}, package.json has ${pkg.version}`);

let versions = null;
try {
	versions = readJson('versions.json');
} catch (err) {
	check('versions-json', false, `unreadable or invalid JSON: ${err.message}`);
}
if (versions) {
	if (Object.hasOwn(versions, manifest.version)) {
		check('versions-min-app', versions[manifest.version] === manifest.minAppVersion, `versions.json["${manifest.version}"] is ${versions[manifest.version]}, manifest minAppVersion is ${manifest.minAppVersion}`);
	} else {
		check('versions-entry', false, `versions.json has no entry for ${manifest.version}`);
	}
}

for (const field of ['id', 'name', 'version', 'minAppVersion', 'description', 'author']) {
	check(`manifest-${field}`, typeof manifest[field] === 'string' && manifest[field].length > 0, 'missing or empty');
}

check('id-format', /^[a-z0-9-]+$/.test(manifest.id), `id "${manifest.id}" must be lowercase letters, digits, and hyphens only`);
check('id-no-obsidian', !manifest.id.includes('obsidian'), `id "${manifest.id}" must not contain "obsidian"`);
check('name-prefix', !String(manifest.name).startsWith('Obsidian'), `name "${manifest.name}" must not start with "Obsidian"`);

if (existsSync('main.js')) {
	const bundle = readFileSync('main.js', 'utf8');
	check('bundle-cjs-obsidian', bundle.includes('require("obsidian")'), 'require("obsidian") not found; bundle is not CJS or obsidian was inlined');
	check('bundle-noble-external', bundle.includes('"@stoprocent/noble"'), 'module id "@stoprocent/noble" not found in bundle; the Noble external reference was renamed or dropped');
	check('bundle-no-esm', !/^(import|export)\s/m.test(bundle), 'top-level ESM import/export found in bundle');
	const size = statSync('main.js').size;
	const line = `main.js: ${(size / 1024).toFixed(1)} KiB`;
	console.log(line);
	if (process.env.GITHUB_STEP_SUMMARY) {
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Bundle\n\n- ${line}\n`);
	}
} else {
	check('bundle-exists', false, 'main.js not found; run node esbuild.config.mjs production first');
}

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(`FAIL ${failure}`);
	}
	process.exit(1);
}
console.log('verify-build: all checks passed');
