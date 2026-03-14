import { describe, it, expect, beforeEach } from 'vitest';
import { BrewRecordService, BREW_RECORDS_VERSION, type StorageAdapter } from './BrewRecordService';
import type { FilterRecord } from '../brew/types';

class InMemoryAdapter implements StorageAdapter {
	data = '';
	backup: string | null = null;
	async read(): Promise<string | null> {
		return this.data || null;
	}
	async write(content: string): Promise<void> {
		this.data = content;
	}
	async writeBackup(content: string): Promise<void> {
		this.backup = content;
	}
}

const makeFilter = (overrides: Partial<FilterRecord> = {}): FilterRecord => ({
	id: crypto.randomUUID(),
	timestamp: new Date().toISOString(),
	bean: '첼로 블렌드',
	roastDate: '2026-02-20',
	method: 'filter',
	temp: 'hot',
	grindSize: 2.6,
	dose: 18,
	waterTemp: 96,
	filter: '하이플럭스',
	roastDays: null,
	...overrides,
});

describe('BrewRecordService', () => {
	let service: BrewRecordService;
	let adapter: InMemoryAdapter;

	beforeEach(() => {
		adapter = new InMemoryAdapter();
		service = new BrewRecordService(adapter);
	});

	it('starts empty', async () => {
		const records = await service.getAll();
		expect(records).toEqual([]);
	});

	it('adds and retrieves a record', async () => {
		const record = makeFilter();
		await service.add(record);
		const all = await service.getAll();
		expect(all).toHaveLength(1);
		expect(all[0].id).toBe(record.id);
	});

	it('persists across loads', async () => {
		await service.add(makeFilter());
		const service2 = new BrewRecordService(adapter);
		const all = await service2.getAll();
		expect(all).toHaveLength(1);
	});

	it('getLastRecord returns most recent by bean x method x temp', async () => {
		await service.add(makeFilter({ timestamp: '2026-02-25T10:00:00Z', grindSize: 2.5 }));
		await service.add(makeFilter({ timestamp: '2026-02-26T10:00:00Z', grindSize: 2.6 }));
		await service.add(makeFilter({ bean: '룰 디카페인', timestamp: '2026-02-27T10:00:00Z' }));
		const last = await service.getLastRecord('첼로 블렌드', 'filter', 'hot');
		expect(last?.grindSize).toBe(2.6);
	});

	it('getLastRecord distinguishes temp', async () => {
		await service.add(makeFilter({ timestamp: '2026-02-25T10:00:00Z', temp: 'hot', grindSize: 2.5 }));
		await service.add(makeFilter({ timestamp: '2026-02-26T10:00:00Z', temp: 'iced', grindSize: 3.0 }));
		const hot = await service.getLastRecord('첼로 블렌드', 'filter', 'hot');
		const iced = await service.getLastRecord('첼로 블렌드', 'filter', 'iced');
		expect(hot?.grindSize).toBe(2.5);
		expect(iced?.grindSize).toBe(3.0);
	});

	it('getLastRecord returns undefined when no match', async () => {
		await service.add(makeFilter());
		const last = await service.getLastRecord('없는원두', 'espresso', 'hot');
		expect(last).toBeUndefined();
	});

	it('getLastRecord filters by grinder', async () => {
		await service.add(makeFilter({ timestamp: '2026-02-25T10:00:00Z', grinder: 'C40', grindSize: 24 }));
		await service.add(makeFilter({ timestamp: '2026-02-26T10:00:00Z', grinder: 'J-Ultra', grindSize: 2.5 }));
		const c40 = await service.getLastRecord('첼로 블렌드', 'filter', 'hot', { grinder: 'C40' });
		const jUltra = await service.getLastRecord('첼로 블렌드', 'filter', 'hot', { grinder: 'J-Ultra' });
		expect(c40?.grindSize).toBe(24);
		expect(jUltra?.grindSize).toBe(2.5);
	});

	it('getLastRecord filters by dripper', async () => {
		await service.add(makeFilter({ timestamp: '2026-02-25T10:00:00Z', dripper: 'V60', grindSize: 2.5 }));
		await service.add(makeFilter({ timestamp: '2026-02-26T10:00:00Z', dripper: 'Switch', grindSize: 3.0 }));
		const v60 = await service.getLastRecord('첼로 블렌드', 'filter', 'hot', { dripper: 'V60' });
		expect(v60?.grindSize).toBe(2.5);
	});

	it('getLastRecord without equip filter returns overall latest', async () => {
		await service.add(makeFilter({ timestamp: '2026-02-25T10:00:00Z', grinder: 'C40', grindSize: 24 }));
		await service.add(makeFilter({ timestamp: '2026-02-26T10:00:00Z', grinder: 'J-Ultra', grindSize: 2.5 }));
		const latest = await service.getLastRecord('첼로 블렌드', 'filter', 'hot');
		expect(latest?.grindSize).toBe(2.5);
	});

	it('calls onChange after add', async () => {
		let called = false;
		service.onChange = () => {
			called = true;
		};
		await service.add(makeFilter());
		expect(called).toBe(true);
	});

	it('updates a record by id', async () => {
		const record = makeFilter({ grindSize: 2.5, note: 'test' });
		await service.add(record);
		await service.update(record.id, { grindSize: 3.0, note: 'updated' });
		const all = await service.getAll();
		expect(all[0].grindSize).toBe(3.0);
		expect(all[0].note).toBe('updated');
	});

	it('calls onChange after update', async () => {
		const record = makeFilter();
		await service.add(record);
		let called = false;
		service.onChange = () => {
			called = true;
		};
		await service.update(record.id, { grindSize: 3.0 });
		expect(called).toBe(true);
	});

	it('removes a record by id', async () => {
		const r1 = makeFilter({ bean: 'A' });
		const r2 = makeFilter({ bean: 'B' });
		await service.add(r1);
		await service.add(r2);
		await service.remove(r1.id);
		const all = await service.getAll();
		expect(all).toHaveLength(1);
		expect(all[0].bean).toBe('B');
	});

	it('calls onChange after remove', async () => {
		const record = makeFilter();
		await service.add(record);
		let called = false;
		service.onChange = () => {
			called = true;
		};
		await service.remove(record.id);
		expect(called).toBe(true);
	});

	it('getByBean returns records for specific bean sorted newest first', async () => {
		await service.add(makeFilter({ bean: '첼로 블렌드', timestamp: '2026-03-01T10:00:00Z' }));
		await service.add(makeFilter({ bean: '첼로 블렌드', timestamp: '2026-03-02T10:00:00Z' }));
		await service.add(makeFilter({ bean: '에티오피아', timestamp: '2026-03-01T12:00:00Z' }));
		const records = await service.getByBean('첼로 블렌드');
		expect(records).toHaveLength(2);
		expect(records[0].timestamp).toBe('2026-03-02T10:00:00Z');
		expect(records[1].timestamp).toBe('2026-03-01T10:00:00Z');
	});

	it('filters out invalid records on load', async () => {
		adapter.data = JSON.stringify([
			makeFilter(),
			{ garbage: true },
			{ id: '1', timestamp: 'x', bean: 'b' },
			makeFilter(),
		]);
		const svc = new BrewRecordService(adapter);
		const records = await svc.getAll();
		expect(records).toHaveLength(2);
	});

	it('handles corrupt JSON without data loss', async () => {
		adapter.data = '{broken json';
		const svc = new BrewRecordService(adapter);
		const records = await svc.getAll();
		expect(records).toEqual([]);
		expect(adapter.backup).toBe('{broken json');
	});

	it('removeWithProfile deletes associated profile file', async () => {
		const record = makeFilter({ profilePath: 'brew-profiles/2026-03-01T10-00-00.json' });
		await service.add(record);

		const deletedPaths: string[] = [];
		const mockProfileStorage = {
			delete: async (path: string) => {
				deletedPaths.push(path);
			},
		};

		await service.removeWithProfile(record.id, record.profilePath, mockProfileStorage);

		const all = await service.getAll();
		expect(all).toHaveLength(0);
		expect(deletedPaths).toEqual(['brew-profiles/2026-03-01T10-00-00.json']);
	});

	it('removeWithProfile skips profile deletion when no profilePath', async () => {
		const record = makeFilter();
		await service.add(record);

		const deletedPaths: string[] = [];
		const mockProfileStorage = {
			delete: async (path: string) => {
				deletedPaths.push(path);
			},
		};

		await service.removeWithProfile(record.id, undefined, mockProfileStorage);

		const all = await service.getAll();
		expect(all).toHaveLength(0);
		expect(deletedPaths).toEqual([]);
	});

	it('handles non-array JSON', async () => {
		adapter.data = '{"not": "array"}';
		const svc = new BrewRecordService(adapter);
		const records = await svc.getAll();
		expect(records).toEqual([]);
	});

	it('reads legacy bare-array format', async () => {
		const record = makeFilter();
		adapter.data = JSON.stringify([record]);
		const svc = new BrewRecordService(adapter);
		const records = await svc.getAll();
		expect(records).toHaveLength(1);
		expect(records[0].id).toBe(record.id);
	});

	it('reads envelope format', async () => {
		const record = makeFilter();
		adapter.data = JSON.stringify({ version: 1, records: [record] });
		const svc = new BrewRecordService(adapter);
		const records = await svc.getAll();
		expect(records).toHaveLength(1);
		expect(records[0].id).toBe(record.id);
	});

	it('saves in envelope format', async () => {
		await service.add(makeFilter());
		const saved = JSON.parse(adapter.data);
		expect(saved.version).toBe(BREW_RECORDS_VERSION);
		expect(Array.isArray(saved.records)).toBe(true);
		expect(saved.records).toHaveLength(1);
	});

	it('warns but loads future version', async () => {
		const record = makeFilter();
		adapter.data = JSON.stringify({ version: 99, records: [record] });
		const svc = new BrewRecordService(adapter);
		const records = await svc.getAll();
		expect(records).toHaveLength(1);
	});
});

describe('migrateYields', () => {
	it('updates yield for filter records with profilePath', async () => {
		const record = makeFilter({ profilePath: 'profiles/test.json', yield: 5 });
		const adapter = new InMemoryAdapter();
		adapter.data = JSON.stringify({ version: 1, records: [record] });
		const service = new BrewRecordService(adapter);

		const mockProfileStorage = {
			load: async (_path: string) => [
				{ t: 0, w: 0 },
				{ t: 10, w: 180 },
				{ t: 20, w: 185 },
				{ t: 21, w: 185.2 },
				{ t: 22, w: 185.1 },
				{ t: 23, w: 185.3 },
				{ t: 24, w: 185.0 },
				{ t: 25, w: 5 },
				{ t: 26, w: 3 },
			],
		};

		await service.migrateYields(mockProfileStorage as any);
		const records = await service.getAll();
		expect(records[0].yield).toBeGreaterThanOrEqual(184);
		expect(records[0].yield).toBeLessThanOrEqual(186);
	});

	it('skips espresso records', async () => {
		const record = {
			id: 'esp-1',
			timestamp: new Date().toISOString(),
			bean: 'Test',
			roastDate: '',
			roastDays: null,
			method: 'espresso' as const,
			temp: 'hot' as const,
			grindSize: 15,
			dose: 18,
			yield: 36,
			drink: 'espresso' as const,
			basket: '18g',
			profilePath: 'profiles/test.json',
		};
		const adapter = new InMemoryAdapter();
		adapter.data = JSON.stringify({ version: 1, records: [record] });
		const service = new BrewRecordService(adapter);
		const mockProfileStorage = { load: async () => [] };

		await service.migrateYields(mockProfileStorage as any);
		const records = await service.getAll();
		expect(records[0].yield).toBe(36);
	});

	it('skips records without profilePath', async () => {
		const record = makeFilter({ yield: 200 });
		const adapter = new InMemoryAdapter();
		adapter.data = JSON.stringify({ version: 1, records: [record] });
		const service = new BrewRecordService(adapter);
		const mockProfileStorage = { load: async () => [] };

		await service.migrateYields(mockProfileStorage as any);
		const records = await service.getAll();
		expect(records[0].yield).toBe(200);
	});
});
