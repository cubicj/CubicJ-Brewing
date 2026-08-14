import type { App, PluginManifest } from 'obsidian';
import { requestUrl } from 'obsidian';
import { readTar } from './tarReader';
import { NOBLE_BUNDLE_SHA256, NOBLE_BUNDLE_VERSION, nobleBundleUrl } from './nobleBundle';

export type NobleInstallPhase = 'downloading' | 'verifying' | 'extracting';

export type NobleInstallStatus =
	| { kind: 'not-installed' }
	| { kind: 'installed'; version: string }
	| { kind: 'version-mismatch'; installed: string; expected: string };

export type NobleInstallErrorCode = 'network' | 'http' | 'checksum' | 'extract' | 'write';

export class NobleInstallError extends Error {
	constructor(
		public readonly code: NobleInstallErrorCode,
		message: string,
	) {
		super(message);
	}
}

export interface InstallerFilePort {
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string | null>;
	mkdir(path: string): Promise<void>;
	writeBinary(path: string, data: ArrayBuffer): Promise<void>;
	rmdir(path: string): Promise<void>;
}

export interface InstallerHttpPort {
	fetchBinary(url: string): Promise<{ status: number; body: ArrayBuffer }>;
}

export interface NobleInstallerOptions {
	files: InstallerFilePort;
	http: InstallerHttpPort;
	pluginDir: string;
	pluginVersion: string;
	expectedVersion?: string;
	expectedSha256?: string;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', buf);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export class NobleInstaller {
	constructor(private readonly options: NobleInstallerOptions) {}

	private get nobleDir(): string {
		return `${this.options.pluginDir}/noble`;
	}

	async status(): Promise<NobleInstallStatus> {
		const raw = await this.options.files.read(`${this.nobleDir}/package.json`);
		if (raw === null) return { kind: 'not-installed' };
		let version: string;
		try {
			version = String(JSON.parse(raw).version ?? '');
		} catch {
			return { kind: 'not-installed' };
		}
		if (!version) return { kind: 'not-installed' };
		const expected = this.options.expectedVersion ?? NOBLE_BUNDLE_VERSION;
		if (version === expected) return { kind: 'installed', version };
		return { kind: 'version-mismatch', installed: version, expected };
	}

	async install(onPhase: (phase: NobleInstallPhase) => void): Promise<void> {
		onPhase('downloading');
		let response: { status: number; body: ArrayBuffer };
		try {
			response = await this.options.http.fetchBinary(nobleBundleUrl(this.options.pluginVersion));
		} catch (err) {
			throw new NobleInstallError('network', err instanceof Error ? err.message : String(err));
		}
		if (response.status !== 200) {
			throw new NobleInstallError('http', `HTTP ${response.status}`);
		}

		onPhase('verifying');
		const expected = this.options.expectedSha256 ?? NOBLE_BUNDLE_SHA256;
		const actual = await sha256Hex(response.body);
		if (!expected || actual !== expected) {
			throw new NobleInstallError('checksum', `expected ${expected || '(unset)'}, got ${actual}`);
		}

		onPhase('extracting');
		let entries;
		try {
			const zlib = require('zlib') as typeof import('zlib');
			const bytes = zlib.gunzipSync(new Uint8Array(response.body));
			entries = readTar(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), { root: 'noble/' });
		} catch (err) {
			throw new NobleInstallError('extract', err instanceof Error ? err.message : String(err));
		}

		try {
			if (await this.options.files.exists(this.nobleDir)) {
				await this.options.files.rmdir(this.nobleDir);
			}
			await this.options.files.mkdir(this.nobleDir);
			for (const entry of entries) {
				const target = `${this.options.pluginDir}/${entry.path}`.replace(/\/$/, '');
				if (target === this.nobleDir) continue;
				if (entry.type === 'dir') {
					await this.options.files.mkdir(target);
				} else {
					await this.options.files.writeBinary(target, toArrayBuffer(entry.data));
				}
			}
		} catch (err) {
			throw new NobleInstallError('write', err instanceof Error ? err.message : String(err));
		}
	}
}

export function createNobleInstaller(plugin: { app: App; manifest: PluginManifest }): NobleInstaller {
	const adapter = plugin.app.vault.adapter;
	const files: InstallerFilePort = {
		exists: (p) => adapter.exists(p),
		read: async (p) => ((await adapter.exists(p)) ? adapter.read(p) : null),
		mkdir: (p) => adapter.mkdir(p),
		writeBinary: (p, data) => adapter.writeBinary(p, data),
		rmdir: (p) => adapter.rmdir(p, true),
	};
	const http: InstallerHttpPort = {
		fetchBinary: async (url) => {
			const res = await requestUrl({ url, throw: false });
			return { status: res.status, body: res.arrayBuffer };
		},
	};
	return new NobleInstaller({
		files,
		http,
		pluginDir: plugin.manifest.dir ?? '',
		pluginVersion: plugin.manifest.version,
	});
}
