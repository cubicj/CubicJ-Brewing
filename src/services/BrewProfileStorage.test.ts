import { describe, it, expect, beforeEach } from 'vitest';
import { BrewProfileStorage } from './BrewProfileStorage';
import type { FileAdapter } from './FileAdapter';
import type { BrewProfilePoint } from '../brew/types';

class InMemoryFileAdapter implements FileAdapter {
	files = new Map<string, string>();
	mkdirCalls: string[] = [];

	async read(path: string): Promise<string | null> {
		return this.files.get(path) ?? null;
	}
	async write(path: string, content: string): Promise<void> {
		this.files.set(path, content);
	}
	async mkdir(path: string): Promise<void> {
		this.mkdirCalls.push(path);
	}
	async remove(path: string): Promise<void> {
		this.files.delete(path);
	}
	async list(path: string): Promise<string[]> {
		const prefix = path.endsWith('/') ? path : path + '/';
		return [...this.files.keys()]
			.filter((k) => k.startsWith(prefix))
			.map((k) => k.slice(prefix.length).split('/')[0])
			.filter((v, i, a) => a.indexOf(v) === i);
	}
}

describe('BrewProfileStorage', () => {
	let storage: BrewProfileStorage;
	let adapter: InMemoryFileAdapter;
	const baseDir = '.obsidian/plugins/cubicj-brewing';

	beforeEach(() => {
		adapter = new InMemoryFileAdapter();
		storage = new BrewProfileStorage(baseDir, adapter);
	});

	it('saves profile and returns relative path', async () => {
		const points: BrewProfilePoint[] = [
			{ t: 0, w: 0 },
			{ t: 0.5, w: 3.2 },
			{ t: 1.0, w: 8.1 },
		];
		const result = await storage.save('2026-03-01T12:00:00.000Z', points);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toBe('brew-profiles/2026-03-01T12-00-00.000Z.json');
		}
		expect(adapter.mkdirCalls).toContain(`${baseDir}/brew-profiles`);
	});

	it('loads saved profile', async () => {
		const points: BrewProfilePoint[] = [
			{ t: 0, w: 0 },
			{ t: 1, w: 10 },
		];
		const saveResult = await storage.save('2026-03-01T14:00:00.000Z', points);
		expect(saveResult.ok).toBe(true);
		const loadResult = await storage.load(saveResult.ok ? saveResult.data : '');
		expect(loadResult.ok).toBe(true);
		if (loadResult.ok) expect(loadResult.data).toEqual(points);
	});

	it('returns ok with empty array for missing profile', async () => {
		const result = await storage.load('brew-profiles/nonexistent.json');
		expect(result).toEqual({ ok: true, data: [] });
	});

	it('deletes a saved profile', async () => {
		const points: BrewProfilePoint[] = [{ t: 0, w: 0 }];
		const saveResult = await storage.save('2026-03-01T16:00:00.000Z', points);
		expect(saveResult.ok).toBe(true);
		const deleteResult = await storage.delete(saveResult.ok ? saveResult.data : '');
		expect(deleteResult.ok).toBe(true);
	});

	it('filters out invalid points on load', async () => {
		const path = 'brew-profiles/test.json';
		adapter.files.set(
			`${baseDir}/${path}`,
			JSON.stringify([{ t: 0, w: 0 }, { garbage: true }, { t: 1, w: 10 }, 'not an object']),
		);
		const result = await storage.load(path);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toEqual([
				{ t: 0, w: 0 },
				{ t: 1, w: 10 },
			]);
		}
	});

	it('returns fail for corrupt JSON', async () => {
		const path = 'brew-profiles/test.json';
		adapter.files.set(`${baseDir}/${path}`, '{broken json');
		const result = await storage.load(path);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe('PROFILE_PARSE_FAILED');
	});

	it('returns fail for non-array profile data', async () => {
		const path = 'brew-profiles/test.json';
		adapter.files.set(`${baseDir}/${path}`, '{"not": "array"}');
		const result = await storage.load(path);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe('PROFILE_SCHEMA_INVALID');
	});

	it('returns fail for path traversal in load', async () => {
		const result = await storage.load('../../.obsidian/app.json');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe('PROFILE_PATH_INVALID');
	});

	it('returns fail for path traversal in delete', async () => {
		const result = await storage.delete('../secrets.json');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe('PROFILE_PATH_INVALID');
	});

	it('returns fail for absolute path', async () => {
		const result = await storage.load('/etc/passwd');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe('PROFILE_PATH_INVALID');
	});
});
