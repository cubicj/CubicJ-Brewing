import { describe, expect, it, vi } from 'vitest';
import type { BrewFlowSelection } from '../../../../src/brew/types';
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
		const records = [{ id: '1' }, { id: '2' }];
		const getMatchingRecords = vi.fn(async () => ({ ok: true, data: records }));
		const recordService = {
			getMatchingRecords,
		} as any;
		const sel: BrewFlowSelection = {
			method: 'filter',
			temp: 'hot',
			bean: { path: 'a.md', name: 'A', roaster: '', status: 'active', roastDate: null, weight: null },
		};

		expect(await getLooseMatchingRecords(recordService, sel)).toBe(records);
		expect(getMatchingRecords).toHaveBeenCalledWith('A', 'filter', 'hot', {});
	});

	it('getLooseMatchingRecords returns espresso matches with the drink loose query', async () => {
		const records = [{ id: '1' }, { id: '2' }];
		const getMatchingRecords = vi.fn(async () => ({ ok: true, data: records }));
		const recordService = {
			getMatchingRecords,
		} as any;
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
