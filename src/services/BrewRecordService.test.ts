import { describe, it, expect, beforeEach } from 'vitest';
import { BrewRecordService, type StorageAdapter } from './BrewRecordService';
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

	it('handles non-array JSON', async () => {
		adapter.data = '{"not": "array"}';
		const svc = new BrewRecordService(adapter);
		const records = await svc.getAll();
		expect(records).toEqual([]);
	});
});
