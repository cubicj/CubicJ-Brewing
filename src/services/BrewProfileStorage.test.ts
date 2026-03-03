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
	async exists(path: string): Promise<boolean> {
		return this.files.has(path);
	}
	async list(path: string): Promise<string[]> {
		const prefix = path.endsWith('/') ? path : path + '/';
		return [...this.files.keys()]
			.filter(k => k.startsWith(prefix))
			.map(k => k.slice(prefix.length).split('/')[0])
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
		const path = await storage.save('2026-03-01T12:00:00.000Z', points);
		expect(path).toBe('brew-profiles/2026-03-01T12-00-00.000Z.json');
		expect(adapter.mkdirCalls).toContain(`${baseDir}/brew-profiles`);
		const raw = adapter.files.get(`${baseDir}/brew-profiles/2026-03-01T12-00-00.000Z.json`);
		expect(JSON.parse(raw!)).toEqual(points);
	});

	it('loads saved profile', async () => {
		const points: BrewProfilePoint[] = [{ t: 0, w: 0 }, { t: 1, w: 10 }];
		const path = await storage.save('2026-03-01T14:00:00.000Z', points);
		const loaded = await storage.load(path);
		expect(loaded).toEqual(points);
	});

	it('returns empty array for missing profile', async () => {
		const loaded = await storage.load('brew-profiles/nonexistent.json');
		expect(loaded).toEqual([]);
	});

	it('deletes a saved profile', async () => {
		const points: BrewProfilePoint[] = [{ t: 0, w: 0 }];
		const path = await storage.save('2026-03-01T16:00:00.000Z', points);
		await storage.delete(path);
		const loaded = await storage.load(path);
		expect(loaded).toEqual([]);
	});
});
