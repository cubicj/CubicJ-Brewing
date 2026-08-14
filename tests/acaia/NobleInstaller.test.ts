import { beforeEach, describe, expect, it } from 'vitest';
import { gzipSync } from 'zlib';
import { NobleInstaller, NobleInstallError, type InstallerFilePort, type InstallerHttpPort } from '../../src/acaia/NobleInstaller';
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
	removed: string[];
	existing: Map<string, string>;
}

function makeFiles(): Fake {
	const written = new Map<string, Uint8Array>();
	const dirs: string[] = [];
	const removed: string[] = [];
	const existing = new Map<string, string>();
	const files: InstallerFilePort = {
		exists: async (p) => existing.has(p) || dirs.includes(p),
		read: async (p) => existing.get(p) ?? null,
		mkdir: async (p) => {
			dirs.push(p);
		},
		writeBinary: async (p, data) => {
			written.set(p, new Uint8Array(data));
		},
		rmdir: async (p) => {
			removed.push(p);
		},
	};
	return { files, written, dirs, removed, existing };
}

function makeHttp(status: number, body: Uint8Array): InstallerHttpPort {
	return { fetchBinary: async () => ({ status, body: toArrayBuffer(body) }) };
}

function makeInstaller(fake: Fake, http: InstallerHttpPort, expectedSha256: string) {
	return new NobleInstaller({
		files: fake.files,
		http,
		pluginDir: '.obsidian/plugins/cubicj-brewing',
		pluginVersion: '0.6.0',
		expectedVersion: '9.9.9',
		expectedSha256,
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

	it('removes an existing noble directory before writing', async () => {
		const bundle = makeBundle();
		const sha = await sha256Hex(toArrayBuffer(bundle));
		fake.existing.set('.obsidian/plugins/cubicj-brewing/noble/package.json', '{"version":"1.0.0"}');
		fake.dirs.push('.obsidian/plugins/cubicj-brewing/noble');
		const installer = makeInstaller(fake, makeHttp(200, bundle), sha);
		await installer.install(() => {});
		expect(fake.removed).toEqual(['.obsidian/plugins/cubicj-brewing/noble']);
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
