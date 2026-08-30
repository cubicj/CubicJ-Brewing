import type { App, PluginManifest } from 'obsidian';
import { Platform, requestUrl } from 'obsidian';
import { nodeRequire } from '../nodeRequire';
import { readTar } from './tarReader';
import { NOBLE_BUNDLE_SHA256, NOBLE_BUNDLE_VERSION, nobleBundleUrl } from './nobleBundle';

declare const require: {
	(id: string): unknown;
	cache: Record<string, unknown>;
};

export type NobleInstallPhase = 'downloading' | 'verifying' | 'extracting';

export type NobleInstallStatus =
	| { kind: 'not-installed' }
	| { kind: 'installed'; version: string }
	| { kind: 'version-mismatch'; installed: string; expected: string };

export type NobleInstallErrorCode = 'locked' | 'network' | 'http' | 'checksum' | 'extract' | 'write';

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
	list(path: string): Promise<{ files: string[]; folders: string[] }>;
	mkdir(path: string): Promise<void>;
	remove(path: string): Promise<void>;
	rmdir(path: string): Promise<void>;
	writeBinary(path: string, data: ArrayBuffer): Promise<void>;
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
	isAddonLoaded?: () => boolean;
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

function isStrictDescendant(path: string, root: string): boolean {
	const prefix = `${root}/`;
	if (!path.startsWith(prefix)) return false;
	const parts = path.slice(prefix.length).split('/');
	return parts.every((part) => part !== '' && part !== '.' && part !== '..');
}

export function isNobleModuleLoaded(noblePath: string, cache?: Record<string, unknown>): boolean {
	let moduleCache = cache;
	if (moduleCache === undefined) {
		try {
			moduleCache = typeof require === 'function' ? require.cache : undefined;
		} catch {
			moduleCache = undefined;
		}
		if (moduleCache === undefined) {
			try {
				const w: (Window & { require?: { cache?: Record<string, unknown> } }) | undefined =
					typeof window === 'undefined' ? undefined : window;
				moduleCache = w?.require?.cache;
			} catch {
				moduleCache = undefined;
			}
		}
	}
	if (!moduleCache) return false;
	const normalizedNoblePath = noblePath.replace(/\\/g, '/').toLowerCase();
	return Object.keys(moduleCache).some((key) => {
		const normalizedKey = key.replace(/\\/g, '/').toLowerCase();
		return normalizedKey === normalizedNoblePath || normalizedKey.startsWith(`${normalizedNoblePath}/`);
	});
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
			const parsed: unknown = JSON.parse(raw);
			const value = typeof parsed === 'object' && parsed !== null && 'version' in parsed ? parsed.version : undefined;
			version = typeof value === 'string' ? value : '';
		} catch {
			return { kind: 'not-installed' };
		}
		if (!version) return { kind: 'not-installed' };
		const expected = this.options.expectedVersion ?? NOBLE_BUNDLE_VERSION;
		if (version === expected) return { kind: 'installed', version };
		return { kind: 'version-mismatch', installed: version, expected };
	}

	async install(onPhase: (phase: NobleInstallPhase) => void): Promise<void> {
		if (this.options.isAddonLoaded?.()) {
			throw new NobleInstallError('locked', 'The Bluetooth addon is already loaded in this session.');
		}
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
			if (Platform.isDesktop) {
				const zlib = nodeRequire('zlib') as typeof import('zlib');
				const bytes = zlib.gunzipSync(new Uint8Array(response.body));
				entries = readTar(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), { root: 'noble/' });
			} else {
				throw new Error();
			}
		} catch (err) {
			throw new NobleInstallError('extract', err instanceof Error ? err.message : String(err));
		}

		const packagePath = `${this.nobleDir}/package.json`;
		const targetedEntries = entries.map((entry) => ({
			entry,
			target: `${this.options.pluginDir}/${entry.path}`.replace(/\/$/, ''),
		}));
		const targetPaths = new Set(targetedEntries.map(({ target }) => target));
		try {
			if (await this.options.files.exists(packagePath)) {
				await this.options.files.remove(packagePath);
			}
			if (await this.options.files.exists(this.nobleDir)) {
				const existingFiles: string[] = [];
				const existingDirs: string[] = [];
				const collect = async (dir: string): Promise<void> => {
					const listed = await this.options.files.list(dir);
					for (const file of listed.files) {
						if (isStrictDescendant(file, this.nobleDir)) existingFiles.push(file);
					}
					for (const folder of listed.folders) {
						if (!isStrictDescendant(folder, this.nobleDir)) continue;
						existingDirs.push(folder);
						await collect(folder);
					}
				};
				await collect(this.nobleDir);
				for (const file of existingFiles) {
					if (!targetPaths.has(file)) await this.options.files.remove(file);
				}
				existingDirs.sort((a, b) => b.split('/').length - a.split('/').length);
				for (const dir of existingDirs) {
					if (!targetPaths.has(dir)) await this.options.files.rmdir(dir);
				}
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			throw new NobleInstallError('write', `prune: ${message}`);
		}

		try {
			if (!(await this.options.files.exists(this.nobleDir))) {
				await this.options.files.mkdir(this.nobleDir);
			}
			const orderedEntries = [
				...targetedEntries.filter(({ target }) => target !== packagePath),
				...targetedEntries.filter(({ target }) => target === packagePath),
			];
			for (const { entry, target } of orderedEntries) {
				if (target === this.nobleDir) continue;
				if (entry.type === 'dir') {
					if (!(await this.options.files.exists(target))) {
						await this.options.files.mkdir(target);
					}
				} else {
					await this.options.files.writeBinary(target, toArrayBuffer(entry.data));
				}
			}
		} catch (err) {
			throw new NobleInstallError('write', err instanceof Error ? err.message : String(err));
		}
	}
}

export function createNobleInstaller(
	plugin: { app: App; manifest: PluginManifest },
	isAddonLoaded?: () => boolean,
): NobleInstaller {
	const adapter = plugin.app.vault.adapter;
	const files: InstallerFilePort = {
		exists: (p) => adapter.exists(p),
		read: async (p) => ((await adapter.exists(p)) ? adapter.read(p) : null),
		list: (p) => adapter.list(p),
		mkdir: (p) => adapter.mkdir(p),
		remove: (p) => adapter.remove(p),
		rmdir: (p) => adapter.rmdir(p, false),
		writeBinary: (p, data) => adapter.writeBinary(p, data),
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
		isAddonLoaded,
	});
}
