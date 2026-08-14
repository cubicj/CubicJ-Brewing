import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'zlib';
import {
	isNobleModuleLoaded,
	NobleInstaller,
	NobleInstallError,
	type InstallerFilePort,
	type InstallerHttpPort,
} from '../../src/acaia/NobleInstaller';
import { buildTar } from '../helpers/tarFixture';

const text = (s: string) => new TextEncoder().encode(s);

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', buf);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function makeBundle(): Uint8Array {
	return gzipSync(
		buildTar([
			{ path: 'noble/', type: 'dir' },
			{ path: 'noble/package.json', type: 'file', data: text('{"version":"9.9.9"}') },
			{ path: 'noble/lib/', type: 'dir' },
			{ path: 'noble/lib/index.js', type: 'file', data: text('module.exports = 1;') },
		]),
	);
}

interface Fake {
	files: InstallerFilePort;
	written: Map<string, Uint8Array>;
	dirs: string[];
	existing: Map<string, string>;
	existingDirs: Set<string>;
	fileCalls: string[];
	writeOrder: string[];
}

function makeFiles(): Fake {
	const written = new Map<string, Uint8Array>();
	const dirs: string[] = [];
	const existing = new Map<string, string>();
	const existingDirs = new Set<string>();
	const fileCalls: string[] = [];
	const writeOrder: string[] = [];
	const files: InstallerFilePort = {
		exists: async (p) => {
			fileCalls.push(`exists:${p}`);
			return existing.has(p) || existingDirs.has(p);
		},
		read: async (p) => {
			fileCalls.push(`read:${p}`);
			return existing.get(p) ?? null;
		},
		mkdir: async (p) => {
			fileCalls.push(`mkdir:${p}`);
			dirs.push(p);
			existingDirs.add(p);
		},
		writeBinary: async (p, data) => {
			fileCalls.push(`writeBinary:${p}`);
			writeOrder.push(p);
			written.set(p, new Uint8Array(data));
			existing.set(p, new TextDecoder().decode(data));
		},
	};
	return { files, written, dirs, existing, existingDirs, fileCalls, writeOrder };
}

function makeHttp(status: number, body: Uint8Array): InstallerHttpPort {
	return { fetchBinary: async () => ({ status, body: toArrayBuffer(body) }) };
}

function makeInstaller(
	fake: Fake,
	http: InstallerHttpPort,
	expectedSha256: string,
	isAddonLoaded?: () => boolean,
) {
	return new NobleInstaller({
		files: fake.files,
		http,
		pluginDir: '.obsidian/plugins/cubicj-brewing',
		pluginVersion: '0.6.0',
		expectedVersion: '9.9.9',
		expectedSha256,
		isAddonLoaded,
	});
}

describe('NobleInstaller.status', () => {
	let fake: Fake;
	beforeEach(() => {
		fake = makeFiles();
	});

	it('reports not-installed when package.json is missing', async () => {
		const installer = makeInstaller(fake, makeHttp(200, new Uint8Array(0)), 'x');
		expect(await installer.status()).toEqual({ kind: 'not-installed' });
	});

	it('reports installed on version match', async () => {
		fake.existing.set('.obsidian/plugins/cubicj-brewing/noble/package.json', '{"version":"9.9.9"}');
		const installer = makeInstaller(fake, makeHttp(200, new Uint8Array(0)), 'x');
		expect(await installer.status()).toEqual({ kind: 'installed', version: '9.9.9' });
	});

	it('reports version-mismatch on version difference', async () => {
		fake.existing.set('.obsidian/plugins/cubicj-brewing/noble/package.json', '{"version":"1.0.0"}');
		const installer = makeInstaller(fake, makeHttp(200, new Uint8Array(0)), 'x');
		expect(await installer.status()).toEqual({ kind: 'version-mismatch', installed: '1.0.0', expected: '9.9.9' });
	});

	it('reports not-installed on corrupt package.json', async () => {
		fake.existing.set('.obsidian/plugins/cubicj-brewing/noble/package.json', 'not json');
		const installer = makeInstaller(fake, makeHttp(200, new Uint8Array(0)), 'x');
		expect(await installer.status()).toEqual({ kind: 'not-installed' });
	});
});

describe('NobleInstaller.install', () => {
	let fake: Fake;
	beforeEach(() => {
		fake = makeFiles();
	});

	it('downloads, verifies, extracts, and writes the tree', async () => {
		const bundle = makeBundle();
		const sha = await sha256Hex(toArrayBuffer(bundle));
		const installer = makeInstaller(fake, makeHttp(200, bundle), sha);
		const phases: string[] = [];
		await installer.install((p) => phases.push(p));
		expect(phases).toEqual(['downloading', 'verifying', 'extracting']);
		expect(fake.dirs).toContain('.obsidian/plugins/cubicj-brewing/noble/lib');
		const pkg = fake.written.get('.obsidian/plugins/cubicj-brewing/noble/package.json');
		expect(new TextDecoder().decode(pkg)).toBe('{"version":"9.9.9"}');
		expect(fake.written.has('.obsidian/plugins/cubicj-brewing/noble/lib/index.js')).toBe(true);
	});

	it('rejects before phases or I/O when the addon is already loaded', async () => {
		const fetchBinary = vi.fn(async () => ({ status: 200, body: new ArrayBuffer(0) }));
		const onPhase = vi.fn();
		const installer = makeInstaller(fake, { fetchBinary }, 'x', () => true);

		await expect(installer.install(onPhase)).rejects.toMatchObject({ code: 'locked' });
		expect(onPhase).not.toHaveBeenCalled();
		expect(fetchBinary).not.toHaveBeenCalled();
		expect(fake.fileCalls).toEqual([]);
	});

	it('overwrites an existing noble tree without deleting its other files', async () => {
		const bundle = makeBundle();
		const sha = await sha256Hex(toArrayBuffer(bundle));
		const nobleDir = '.obsidian/plugins/cubicj-brewing/noble';
		fake.existingDirs.add(nobleDir);
		fake.existingDirs.add(`${nobleDir}/lib`);
		fake.existing.set(`${nobleDir}/package.json`, '{"version":"1.0.0"}');
		fake.existing.set(`${nobleDir}/lib/index.js`, 'module.exports = 0;');
		fake.existing.set(`${nobleDir}/locked.node`, 'native');
		const installer = makeInstaller(fake, makeHttp(200, bundle), sha);

		await installer.install(() => {});

		expect(fake.existing.get(`${nobleDir}/package.json`)).toBe('{"version":"9.9.9"}');
		expect(fake.existing.get(`${nobleDir}/lib/index.js`)).toBe('module.exports = 1;');
		expect(fake.existing.get(`${nobleDir}/locked.node`)).toBe('native');
		expect(fake.dirs).toEqual([]);
	});

	it('writes package.json after every other file', async () => {
		const bundle = makeBundle();
		const sha = await sha256Hex(toArrayBuffer(bundle));
		const installer = makeInstaller(fake, makeHttp(200, bundle), sha);

		await installer.install(() => {});

		expect(fake.writeOrder).toEqual([
			'.obsidian/plugins/cubicj-brewing/noble/lib/index.js',
			'.obsidian/plugins/cubicj-brewing/noble/package.json',
		]);
	});

	it('creates only archive directories that do not exist', async () => {
		const bundle = makeBundle();
		const sha = await sha256Hex(toArrayBuffer(bundle));
		fake.existingDirs.add('.obsidian/plugins/cubicj-brewing/noble');
		const installer = makeInstaller(fake, makeHttp(200, bundle), sha);

		await installer.install(() => {});

		expect(fake.dirs).toEqual(['.obsidian/plugins/cubicj-brewing/noble/lib']);
	});

	it('fails with network when the fetch throws', async () => {
		const http: InstallerHttpPort = { fetchBinary: async () => Promise.reject(new Error('offline')) };
		const installer = makeInstaller(fake, http, 'x');
		await expect(installer.install(() => {})).rejects.toMatchObject({ code: 'network' });
	});

	it('fails with http on non-200 status', async () => {
		const installer = makeInstaller(fake, makeHttp(404, new Uint8Array(0)), 'x');
		await expect(installer.install(() => {})).rejects.toMatchObject({ code: 'http' });
	});

	it('fails with checksum on hash mismatch and writes nothing', async () => {
		const installer = makeInstaller(fake, makeHttp(200, makeBundle()), 'deadbeef');
		await expect(installer.install(() => {})).rejects.toMatchObject({ code: 'checksum' });
		expect(fake.written.size).toBe(0);
	});

	it('fails with checksum when the expected hash is empty', async () => {
		const bundle = makeBundle();
		const installer = makeInstaller(fake, makeHttp(200, bundle), '');
		await expect(installer.install(() => {})).rejects.toMatchObject({ code: 'checksum' });
	});

	it('fails with extract on invalid gzip data', async () => {
		const junk = new Uint8Array([1, 2, 3, 4]);
		const sha = await sha256Hex(toArrayBuffer(junk));
		const installer = makeInstaller(fake, makeHttp(200, junk), sha);
		await expect(installer.install(() => {})).rejects.toMatchObject({ code: 'extract' });
	});

	it('fails with write when the adapter write throws', async () => {
		const bundle = makeBundle();
		const sha = await sha256Hex(toArrayBuffer(bundle));
		fake.files.writeBinary = async () => Promise.reject(new Error('disk full'));
		const installer = makeInstaller(fake, makeHttp(200, bundle), sha);
		await expect(installer.install(() => {})).rejects.toMatchObject({ code: 'write' });
		await expect(installer.install(() => {})).rejects.toBeInstanceOf(NobleInstallError);
	});
});

describe('isNobleModuleLoaded', () => {
	it('matches an exact Windows cache key', () => {
		expect(
			isNobleModuleLoaded('C:/Vault/.obsidian/plugins/cubicj-brewing/noble', {
				'C:\\Vault\\.obsidian\\plugins\\cubicj-brewing\\noble': {},
			}),
		).toBe(true);
	});

	it('matches cache entries below the noble path', () => {
		expect(
			isNobleModuleLoaded('/vault/.obsidian/plugins/cubicj-brewing/noble', {
				'/vault/.obsidian/plugins/cubicj-brewing/noble/lib/index.js': {},
			}),
		).toBe(true);
	});

	it('does not match unrelated cache entries', () => {
		expect(
			isNobleModuleLoaded('/vault/.obsidian/plugins/cubicj-brewing/noble', {
				'/vault/.obsidian/plugins/cubicj-brewing/noble-old/index.js': {},
				'/vault/other/index.js': {},
			}),
		).toBe(false);
	});

	it('matches paths case-insensitively', () => {
		expect(
			isNobleModuleLoaded('C:/VAULT/Plugins/Noble', {
				'c:/vault/plugins/noble/INDEX.JS': {},
			}),
		).toBe(true);
	});

	it('returns false for empty or undefined caches without matching entries', () => {
		expect(isNobleModuleLoaded('/definitely/not/loaded/noble', {})).toBe(false);
		expect(isNobleModuleLoaded('/definitely/not/loaded/noble', undefined)).toBe(false);
	});
});
