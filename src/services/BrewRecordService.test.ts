import { describe, it, expect, beforeEach } from 'vitest';
import { BrewRecordService, type StorageAdapter } from './BrewRecordService';
import type { FilterRecord } from '../brew/types';

class InMemoryAdapter implements StorageAdapter {
	data = '';
	async read(): Promise<string | null> { return this.data || null; }
	async write(content: string): Promise<void> { this.data = content; }
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

	it('getLastRecord returns most recent by bean x method', async () => {
		await service.add(makeFilter({ timestamp: '2026-02-25T10:00:00Z', grindSize: 2.5 }));
		await service.add(makeFilter({ timestamp: '2026-02-26T10:00:00Z', grindSize: 2.6 }));
		await service.add(makeFilter({ bean: '룰 디카페인', timestamp: '2026-02-27T10:00:00Z' }));
		const last = await service.getLastRecord('첼로 블렌드', 'filter');
		expect(last?.grindSize).toBe(2.6);
	});

	it('getLastRecord returns undefined when no match', async () => {
		await service.add(makeFilter());
		const last = await service.getLastRecord('없는원두', 'espresso');
		expect(last).toBeUndefined();
	});
});
