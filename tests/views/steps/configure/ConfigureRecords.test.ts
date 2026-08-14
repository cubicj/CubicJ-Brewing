import { describe, expect, it, vi } from 'vitest';
import type { BrewFlowSelection, EspressoRecord, FilterRecord } from '../../../../src/brew/types';
import type { BrewRecordService } from '../../../../src/services/BrewRecordService';
import {
	buildLooseRecordQuery,
	buildStrictRecordQuery,
	getLooseMatchingRecords,
} from '../../../../src/views/steps/configure/ConfigureRecords';

describe('ConfigureRecords', () => {
	it('buildLooseRecordQuery includes only espresso drink', () => {
		const sel: BrewFlowSelection = {
			method: 'espresso',
			temp: 'hot',
			drink: 'americano',
			filter: 'ignored',
			grinder: 'ignored',
			dripper: 'ignored',
			basket: 'ignored',
		};

		expect(buildLooseRecordQuery(sel)).toEqual({ drink: 'americano' });
	});

	it('buildLooseRecordQuery returns an empty query for filter brewing', () => {
		const sel: BrewFlowSelection = {
			method: 'filter',
			temp: 'hot',
			filter: 'HF',
			grinder: 'C40',
			dripper: 'V60',
		};

		expect(buildLooseRecordQuery(sel)).toEqual({});
	});

	it('buildStrictRecordQuery includes configured equipment fields', () => {
		const sel: BrewFlowSelection = {
			method: 'filter',
			temp: 'hot',
			filter: 'HF',
			grinder: 'C40',
			dripper: 'V60',
		};

		expect(buildStrictRecordQuery(sel)).toEqual({
			filter: 'HF',
			grinder: 'C40',
			dripper: 'V60',
		});
	});

	it('buildStrictRecordQuery includes espresso drink and basket', () => {
		const sel: BrewFlowSelection = {
			method: 'espresso',
			temp: 'hot',
			drink: 'shot',
			grinder: 'J-Ultra',
			basket: '18g',
		};

		expect(buildStrictRecordQuery(sel)).toEqual({
			drink: 'shot',
			grinder: 'J-Ultra',
			basket: '18g',
		});
	});

	it('getLooseMatchingRecords returns filter matches with an empty loose query', async () => {
		const records: FilterRecord[] = [
			{
				id: '1',
				timestamp: '2026-08-14T00:00:00Z',
				bean: 'A',
				roastDate: '2026-08-01',
				roastDays: 13,
				method: 'filter',
				temp: 'hot',
				grindSize: 2.5,
				dose: 18,
				waterTemp: 93,
			},
			{
				id: '2',
				timestamp: '2026-08-13T00:00:00Z',
				bean: 'A',
				roastDate: '2026-08-01',
				roastDays: 12,
				method: 'filter',
				temp: 'hot',
				grindSize: 2.5,
				dose: 18,
				waterTemp: 93,
			},
		];
		const getMatchingRecords = vi.fn(async () => ({ ok: true, data: records }));
		const recordService = {
			getMatchingRecords,
		} as unknown as BrewRecordService;
		const sel: BrewFlowSelection = {
			method: 'filter',
			temp: 'hot',
			bean: { path: 'a.md', name: 'A', roaster: '', status: 'active', roastDate: null, weight: null },
		};

		expect(await getLooseMatchingRecords(recordService, sel)).toBe(records);
		expect(getMatchingRecords).toHaveBeenCalledWith('A', 'filter', 'hot', {});
	});

	it('getLooseMatchingRecords returns espresso matches with the drink loose query', async () => {
		const records: EspressoRecord[] = [
			{
				id: '1',
				timestamp: '2026-08-14T00:00:00Z',
				bean: 'A',
				roastDate: '2026-08-01',
				roastDays: 13,
				method: 'espresso',
				temp: 'hot',
				grindSize: 2.5,
				dose: 18,
				drink: 'americano',
				basket: '18g',
			},
			{
				id: '2',
				timestamp: '2026-08-13T00:00:00Z',
				bean: 'A',
				roastDate: '2026-08-01',
				roastDays: 12,
				method: 'espresso',
				temp: 'hot',
				grindSize: 2.5,
				dose: 18,
				drink: 'americano',
				basket: '18g',
			},
		];
		const getMatchingRecords = vi.fn(async () => ({ ok: true, data: records }));
		const recordService = {
			getMatchingRecords,
		} as unknown as BrewRecordService;
		const sel: BrewFlowSelection = {
			method: 'espresso',
			temp: 'hot',
			drink: 'americano',
			bean: { path: 'a.md', name: 'A', roaster: '', status: 'active', roastDate: null, weight: null },
		};

		expect(await getLooseMatchingRecords(recordService, sel)).toBe(records);
		expect(getMatchingRecords).toHaveBeenCalledWith('A', 'espresso', 'hot', { drink: 'americano' });
	});
});
