import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrewRecordService, BREW_RECORDS_VERSION, type StorageAdapter } from './BrewRecordService';
import type { FilterRecord, EspressoRecord } from '../brew/types';

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

const makeEspresso = (overrides: Partial<EspressoRecord> = {}): EspressoRecord => ({
	id: crypto.randomUUID(),
	timestamp: new Date().toISOString(),
	bean: '첼로 블렌드',
	roastDate: '2026-02-20',
	method: 'espresso',
	temp: 'hot',
	grindSize: 2.0,
	dose: 18,
	drink: 'shot',
	basket: '18g',
	roastDays: null,
	...overrides,
});

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
		const result = await service.getAll();
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toEqual([]);
	});

	it('adds and retrieves a record', async () => {
		const record = makeFilter();
		await service.add(record);
		const result = await service.getAll();
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toHaveLength(1);
			expect(result.data[0].id).toBe(record.id);
		}
	});

	it('persists across loads', async () => {
		await service.add(makeFilter());
		const service2 = new BrewRecordService(adapter);
		const result = await service2.getAll();
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toHaveLength(1);
	});

	it('getLastRecord returns most recent by bean x method x temp', async () => {
		await service.add(makeFilter({ timestamp: '2026-02-25T10:00:00Z', grindSize: 2.5 }));
		await service.add(makeFilter({ timestamp: '2026-02-26T10:00:00Z', grindSize: 2.6 }));
		await service.add(makeFilter({ bean: '룰 디카페인', timestamp: '2026-02-27T10:00:00Z' }));
		const result = await service.getLastRecord('첼로 블렌드', 'filter', 'hot');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data?.grindSize).toBe(2.6);
	});

	it('getLastRecord distinguishes temp', async () => {
		await service.add(makeFilter({ timestamp: '2026-02-25T10:00:00Z', temp: 'hot', grindSize: 2.5 }));
		await service.add(makeFilter({ timestamp: '2026-02-26T10:00:00Z', temp: 'iced', grindSize: 3.0 }));
		const hot = await service.getLastRecord('첼로 블렌드', 'filter', 'hot');
		const iced = await service.getLastRecord('첼로 블렌드', 'filter', 'iced');
		expect(hot.ok).toBe(true);
		expect(iced.ok).toBe(true);
		if (hot.ok) expect(hot.data?.grindSize).toBe(2.5);
		if (iced.ok) expect(iced.data?.grindSize).toBe(3.0);
	});

	it('getLastRecord returns undefined when no match', async () => {
		await service.add(makeFilter());
		const result = await service.getLastRecord('없는원두', 'espresso', 'hot');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toBeUndefined();
	});

	it('getLastRecord filters by grinder', async () => {
		await service.add(makeFilter({ timestamp: '2026-02-25T10:00:00Z', grinder: 'C40', grindSize: 24 }));
		await service.add(makeFilter({ timestamp: '2026-02-26T10:00:00Z', grinder: 'J-Ultra', grindSize: 2.5 }));
		const c40 = await service.getLastRecord('첼로 블렌드', 'filter', 'hot', { grinder: 'C40' });
		const jUltra = await service.getLastRecord('첼로 블렌드', 'filter', 'hot', { grinder: 'J-Ultra' });
		expect(c40.ok).toBe(true);
		expect(jUltra.ok).toBe(true);
		if (c40.ok) expect(c40.data?.grindSize).toBe(24);
		if (jUltra.ok) expect(jUltra.data?.grindSize).toBe(2.5);
	});

	it('getLastRecord filters by dripper', async () => {
		await service.add(makeFilter({ timestamp: '2026-02-25T10:00:00Z', dripper: 'V60', grindSize: 2.5 }));
		await service.add(makeFilter({ timestamp: '2026-02-26T10:00:00Z', dripper: 'Switch', grindSize: 3.0 }));
		const v60 = await service.getLastRecord('첼로 블렌드', 'filter', 'hot', { dripper: 'V60' });
		expect(v60.ok).toBe(true);
		if (v60.ok) expect(v60.data?.grindSize).toBe(2.5);
	});

	it('getLastRecord filters espresso by drink type', async () => {
		await service.add(makeEspresso({ timestamp: '2026-02-25T10:00:00Z', drink: 'shot', grindSize: 2.0 }));
		await service.add(makeEspresso({ timestamp: '2026-02-26T10:00:00Z', drink: 'americano', grindSize: 2.2 }));
		const shot = await service.getLastRecord('첼로 블렌드', 'espresso', 'hot', { drink: 'shot' });
		const americano = await service.getLastRecord('첼로 블렌드', 'espresso', 'hot', { drink: 'americano' });
		expect(shot.ok).toBe(true);
		expect(americano.ok).toBe(true);
		if (shot.ok) expect(shot.data?.grindSize).toBe(2.0);
		if (americano.ok) expect(americano.data?.grindSize).toBe(2.2);
	});

	it('getLastRecord without equip filter returns overall latest', async () => {
		await service.add(makeFilter({ timestamp: '2026-02-25T10:00:00Z', grinder: 'C40', grindSize: 24 }));
		await service.add(makeFilter({ timestamp: '2026-02-26T10:00:00Z', grinder: 'J-Ultra', grindSize: 2.5 }));
		const latest = await service.getLastRecord('첼로 블렌드', 'filter', 'hot');
		expect(latest.ok).toBe(true);
		if (latest.ok) expect(latest.data?.grindSize).toBe(2.5);
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
		const result = await service.getAll();
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data[0].grindSize).toBe(3.0);
			expect(result.data[0].note).toBe('updated');
		}
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
		const result = await service.getAll();
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toHaveLength(1);
			expect(result.data[0].bean).toBe('B');
		}
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
		const result = await service.getByBean('첼로 블렌드');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toHaveLength(2);
			expect(result.data[0].timestamp).toBe('2026-03-02T10:00:00Z');
			expect(result.data[1].timestamp).toBe('2026-03-01T10:00:00Z');
		}
	});

	it('filters out invalid records on load', async () => {
		adapter.data = JSON.stringify([
			makeFilter(),
			{ garbage: true },
			{ id: '1', timestamp: 'x', bean: 'b' },
			makeFilter(),
		]);
		const svc = new BrewRecordService(adapter);
		const result = await svc.getAll();
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toHaveLength(2);
	});

	it('returns fail for corrupt JSON and backs up', async () => {
		adapter.data = '{broken json';
		const svc = new BrewRecordService(adapter);
		const result = await svc.getAll();
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe('RECORD_PARSE_FAILED');
		expect(adapter.backup).toBe('{broken json');
	});

	it('removeWithProfile deletes associated profile file', async () => {
		const record = makeFilter({ profilePath: 'brew-profiles/2026-03-01T10-00-00.json' });
		await service.add(record);

		const deletedPaths: string[] = [];
		const mockProfileStorage = {
			delete: async (_path: string) => {
				deletedPaths.push(_path);
				return { ok: true as const, data: undefined };
			},
		};

		await service.removeWithProfile(record.id, record.profilePath, mockProfileStorage);

		const result = await service.getAll();
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toHaveLength(0);
		expect(deletedPaths).toEqual(['brew-profiles/2026-03-01T10-00-00.json']);
	});

	it('removeWithProfile skips profile deletion when no profilePath', async () => {
		const record = makeFilter();
		await service.add(record);

		const deletedPaths: string[] = [];
		const mockProfileStorage = {
			delete: async (_path: string) => {
				deletedPaths.push(_path);
				return { ok: true as const, data: undefined };
			},
		};

		await service.removeWithProfile(record.id, undefined, mockProfileStorage);

		const result = await service.getAll();
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toHaveLength(0);
		expect(deletedPaths).toEqual([]);
	});

	it('warns when invalid records are filtered out', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		adapter.data = JSON.stringify([makeFilter(), { id: 'bad', missing: 'fields' }, { notARecord: true }]);
		const result = await service.getAll();
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toHaveLength(1);
		expect(warnSpy).toHaveBeenCalledTimes(2);
		expect(warnSpy.mock.calls[0][0]).toContain('invalid brew record');
		warnSpy.mockRestore();
	});

	it('returns fail for non-array JSON', async () => {
		adapter.data = '{"not": "array"}';
		const svc = new BrewRecordService(adapter);
		const result = await svc.getAll();
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe('RECORD_SCHEMA_INVALID');
	});

	it('reads legacy bare-array format', async () => {
		const record = makeFilter();
		adapter.data = JSON.stringify([record]);
		const svc = new BrewRecordService(adapter);
		const result = await svc.getAll();
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toHaveLength(1);
			expect(result.data[0].id).toBe(record.id);
		}
	});

	it('reads envelope format', async () => {
		const record = makeFilter();
		adapter.data = JSON.stringify({ version: 1, records: [record] });
		const svc = new BrewRecordService(adapter);
		const result = await svc.getAll();
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toHaveLength(1);
			expect(result.data[0].id).toBe(record.id);
		}
	});

	it('saves in envelope format', async () => {
		await service.add(makeFilter());
		const saved = JSON.parse(adapter.data);
		expect(saved.version).toBe(BREW_RECORDS_VERSION);
		expect(Array.isArray(saved.records)).toBe(true);
		expect(saved.records).toHaveLength(1);
	});

	it('preserves invalid records in _invalid field of envelope', async () => {
		adapter.data = JSON.stringify([makeFilter(), { id: 'bad', garbage: true }, makeFilter()]);
		const svc = new BrewRecordService(adapter);
		await svc.getAll();
		await svc.add(makeFilter());
		const saved = JSON.parse(adapter.data);
		expect(saved.records).toHaveLength(3);
		expect(saved._invalid).toHaveLength(1);
		expect(saved._invalid[0].id).toBe('bad');
	});

	it('preserves _invalid from loaded envelope', async () => {
		adapter.data = JSON.stringify({
			version: 1,
			records: [makeFilter()],
			_invalid: [{ id: 'old-bad', x: 1 }],
		});
		const svc = new BrewRecordService(adapter);
		await svc.getAll();
		await svc.add(makeFilter());
		const saved = JSON.parse(adapter.data);
		expect(saved.records).toHaveLength(2);
		expect(saved._invalid).toHaveLength(1);
		expect(saved._invalid[0].id).toBe('old-bad');
	});

	it('merges new invalid records with existing _invalid from envelope', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		adapter.data = JSON.stringify({
			version: 1,
			records: [makeFilter(), { id: 'new-bad', garbage: true }],
			_invalid: [{ id: 'old-bad', x: 1 }],
		});
		const svc = new BrewRecordService(adapter);
		await svc.getAll();
		await svc.add(makeFilter());
		const saved = JSON.parse(adapter.data);
		expect(saved._invalid).toHaveLength(2);
		expect(saved._invalid.map((r: any) => r.id)).toContain('old-bad');
		expect(saved._invalid.map((r: any) => r.id)).toContain('new-bad');
		warnSpy.mockRestore();
	});

	it('loads future version envelope', async () => {
		const record = makeFilter();
		adapter.data = JSON.stringify({ version: 99, records: [record] });
		const svc = new BrewRecordService(adapter);
		const result = await svc.getAll();
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toHaveLength(1);
	});

	it('getMatchingRecords returns all matching records sorted newest first', async () => {
		await service.add(makeFilter({ timestamp: '2026-02-24T10:00:00Z', grindSize: 2.4 }));
		await service.add(makeFilter({ timestamp: '2026-02-25T10:00:00Z', grindSize: 2.5 }));
		await service.add(makeFilter({ timestamp: '2026-02-26T10:00:00Z', grindSize: 2.6 }));
		await service.add(makeFilter({ bean: '룰 디카페인', timestamp: '2026-02-27T10:00:00Z' }));
		const result = await service.getMatchingRecords('첼로 블렌드', 'filter', 'hot');
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toHaveLength(3);
			expect(result.data[0].grindSize).toBe(2.6);
			expect(result.data[1].grindSize).toBe(2.5);
			expect(result.data[2].grindSize).toBe(2.4);
		}
	});

	it('getMatchingRecords respects equipment filters', async () => {
		await service.add(makeFilter({ timestamp: '2026-02-25T10:00:00Z', grinder: 'C40', grindSize: 24 }));
		await service.add(makeFilter({ timestamp: '2026-02-26T10:00:00Z', grinder: 'C40', grindSize: 25 }));
		await service.add(makeFilter({ timestamp: '2026-02-27T10:00:00Z', grinder: 'J-Ultra', grindSize: 2.5 }));
		const result = await service.getMatchingRecords('첼로 블렌드', 'filter', 'hot', { grinder: 'C40' });
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toHaveLength(2);
			expect(result.data[0].grindSize).toBe(25);
			expect(result.data[1].grindSize).toBe(24);
		}
	});

	it('getMatchingRecords returns empty array when no match', async () => {
		await service.add(makeFilter());
		const result = await service.getMatchingRecords('없는원두', 'espresso', 'hot');
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data).toEqual([]);
	});

	it('update returns RECORD_NOT_FOUND for missing id', async () => {
		const result = await service.update('nonexistent', { grindSize: 3.0 });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe('RECORD_NOT_FOUND');
	});

	it('remove returns RECORD_NOT_FOUND for missing id', async () => {
		const result = await service.remove('nonexistent');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.code).toBe('RECORD_NOT_FOUND');
	});
});

describe('migrateYields', () => {
	it('updates yield for filter records with profilePath', async () => {
		const record = makeFilter({ profilePath: 'profiles/test.json', yield: 5 });
		const adapter = new InMemoryAdapter();
		adapter.data = JSON.stringify({ version: 1, records: [record] });
		const service = new BrewRecordService(adapter);

		const mockProfileStorage = {
			load: async (_path: string) => ({
				ok: true as const,
				data: [
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
			}),
		};

		await service.migrateYields(mockProfileStorage);
		const result = await service.getAll();
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data[0].yield).toBeGreaterThanOrEqual(184);
			expect(result.data[0].yield).toBeLessThanOrEqual(186);
		}
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
		const mockProfileStorage = { load: async () => ({ ok: true as const, data: [] }) };

		await service.migrateYields(mockProfileStorage);
		const result = await service.getAll();
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data[0].yield).toBe(36);
	});

	it('skips records without profilePath', async () => {
		const record = makeFilter({ yield: 200 });
		const adapter = new InMemoryAdapter();
		adapter.data = JSON.stringify({ version: 1, records: [record] });
		const service = new BrewRecordService(adapter);
		const mockProfileStorage = { load: async () => ({ ok: true as const, data: [] }) };

		await service.migrateYields(mockProfileStorage);
		const result = await service.getAll();
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data[0].yield).toBe(200);
	});
});
