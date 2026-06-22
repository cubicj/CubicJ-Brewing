import { describe, expect, it } from 'vitest';
import type { BrewFlowSelection } from '../../../brew/types';
import { buildLooseRecordQuery, buildStrictRecordQuery } from './ConfigureRecords';

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
});
