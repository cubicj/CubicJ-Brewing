import { describe, expect, it } from 'vitest';
import type {
	BeanInfo,
	BrewFlowSelection,
	BrewFlowStep,
	EquipmentSettings,
	EspressoRecord,
	FilterRecord,
} from '../../../brew/types';
import {
	buildConfigureSetupKey,
	findNewestApplicableRecord,
	getDefaultConfigureSelection,
	getDefaultDialValues,
	shouldInitializeConfigure,
} from './ConfigureInitialization';

const bean = (name: string): BeanInfo => ({
	path: `${name}.md`,
	name,
	roaster: '',
	status: 'active',
	roastDate: null,
	weight: null,
});

const equipment: EquipmentSettings = {
	grinders: [
		{ name: 'C40', min: 1, max: 40, step: 1 },
		{ name: 'J-Ultra', min: 0.5, max: 5, step: 0.1 },
	],
	filters: ['HF'],
	drippers: ['V60'],
	baskets: ['18g'],
	accessories: ['Puck screen'],
};

const filterRecord = (id: string, overrides: Partial<FilterRecord> = {}): FilterRecord => ({
	id,
	timestamp: `2026-06-2${id}T00:00:00.000Z`,
	bean: 'Kenya',
	roastDate: '',
	roastDays: null,
	method: 'filter',
	temp: 'hot',
	grindSize: 20,
	grinder: 'C40',
	dose: 15,
	waterTemp: 93,
	filter: 'HF',
	dripper: 'V60',
	...overrides,
});

const espressoRecord = (id: string, overrides: Partial<EspressoRecord> = {}): EspressoRecord => ({
	id,
	timestamp: `2026-06-2${id}T00:00:00.000Z`,
	bean: 'Kenya',
	roastDate: '',
	roastDays: null,
	method: 'espresso',
	temp: 'hot',
	drink: 'americano',
	grindSize: 2,
	grinder: 'J-Ultra',
	dose: 18,
	basket: '18g',
	...overrides,
});

describe('ConfigureInitialization', () => {
	it('builds a setup key from method, temp, drink, and bean name', () => {
		const sel: BrewFlowSelection = {
			method: 'espresso',
			temp: 'hot',
			drink: 'americano',
			bean: bean('Ethiopia'),
		};

		expect(buildConfigureSetupKey(sel)).toBe('espresso|hot|americano|Ethiopia');
	});

	it('omits drink for filter setup keys', () => {
		const sel: BrewFlowSelection = {
			method: 'filter',
			temp: 'iced',
			bean: bean('Kenya'),
		};

		expect(buildConfigureSetupKey(sel)).toBe('filter|iced||Kenya');
	});

	it('returns undefined when setup key fields are incomplete', () => {
		expect(buildConfigureSetupKey({ temp: 'hot', bean: bean('Kenya') })).toBeUndefined();
		expect(buildConfigureSetupKey({ method: 'filter', bean: bean('Kenya') })).toBeUndefined();
		expect(buildConfigureSetupKey({ method: 'filter', temp: 'hot' })).toBeUndefined();
	});

	it('allows initialization only when the setup key has not been initialized', () => {
		expect(shouldInitializeConfigure('filter|hot||A', undefined, 'configure')).toBe(true);
		expect(shouldInitializeConfigure('filter|hot||A', 'filter|hot||A', 'configure')).toBe(false);
		expect(shouldInitializeConfigure('filter|hot||B', 'filter|hot||A', 'configure')).toBe(true);
	});

	it('does not initialize without a setup key', () => {
		expect(shouldInitializeConfigure(undefined, undefined, 'configure')).toBe(false);
	});

	it('does not initialize when revisiting from brewing or saving', () => {
		expect(shouldInitializeConfigure('filter|hot||A', undefined, 'brewing')).toBe(false);
		expect(shouldInitializeConfigure('filter|hot||A', undefined, 'saving')).toBe(false);
	});

	it('does not initialize before reaching configure', () => {
		const steps: BrewFlowStep[] = ['idle', 'method', 'bean'];

		for (const step of steps) {
			expect(shouldInitializeConfigure('filter|hot||A', undefined, step)).toBe(false);
		}
	});

	it('skips unavailable equipment and falls back to the next newest applicable record', () => {
		const records = [
			filterRecord('3', { grinder: 'Deleted grinder' }),
			filterRecord('2', { grindSize: 22, dose: 16 }),
			filterRecord('1', { grindSize: 18, dose: 14 }),
		];

		expect(findNewestApplicableRecord(records, equipment)?.id).toBe('2');
	});

	it('selects the newest applicable record without mutating input order', () => {
		const records = [
			filterRecord('1', { timestamp: '2026-06-21T00:00:00.000Z', grindSize: 18 }),
			filterRecord('3', { timestamp: '2026-06-23T00:00:00.000Z', grindSize: 24 }),
			filterRecord('2', { timestamp: '2026-06-22T00:00:00.000Z', grindSize: 22 }),
		];

		expect(findNewestApplicableRecord(records, equipment)?.id).toBe('3');
		expect(records.map((record) => record.id)).toEqual(['1', '3', '2']);
	});

	it('skips grind sizes outside the selected grinder range', () => {
		const records = [filterRecord('3', { grindSize: 50 }), filterRecord('2', { grindSize: 30 })];

		expect(findNewestApplicableRecord(records, equipment)?.id).toBe('2');
	});

	it('skips filter records with unavailable filter or dripper', () => {
		expect(findNewestApplicableRecord([filterRecord('1', { filter: 'Deleted filter' })], equipment)).toBeUndefined();
		expect(findNewestApplicableRecord([filterRecord('1', { dripper: 'Deleted dripper' })], equipment)).toBeUndefined();
	});

	it('skips records with missing dose', () => {
		expect(findNewestApplicableRecord([filterRecord('1', { dose: undefined })], equipment)).toBeUndefined();
	});

	it('skips filter records with missing water temperature', () => {
		expect(findNewestApplicableRecord([filterRecord('1', { waterTemp: undefined })], equipment)).toBeUndefined();
	});

	it('returns default equipment for a new filter setup', () => {
		expect(getDefaultConfigureSelection('filter', equipment)).toEqual({
			filter: 'HF',
			dripper: 'V60',
			grinder: 'C40',
		});
	});

	it('returns default equipment for a new espresso setup', () => {
		expect(getDefaultConfigureSelection('espresso', equipment)).toEqual({
			grinder: 'C40',
			basket: '18g',
			accessories: undefined,
		});
	});

	it('skips espresso records with unavailable baskets', () => {
		const records = [espressoRecord('3', { basket: 'Deleted basket' }), espressoRecord('2', { grindSize: 3 })];

		expect(findNewestApplicableRecord(records, equipment)?.id).toBe('2');
	});

	it('uses selected grinder minimum for default dial values', () => {
		expect(getDefaultDialValues('filter', equipment.grinders[1])).toEqual({
			grindSize: 0.5,
			dose: 0,
			waterTemp: 93,
			accessories: undefined,
		});
	});

	it('uses zero grind size for filter dial defaults without a grinder', () => {
		expect(getDefaultDialValues('filter', undefined)).toEqual({
			grindSize: 0,
			dose: 0,
			waterTemp: 93,
			accessories: undefined,
		});
	});

	it('uses selected grinder minimum for espresso dial defaults without water temperature', () => {
		expect(getDefaultDialValues('espresso', equipment.grinders[1])).toEqual({
			grindSize: 0.5,
			dose: 0,
			accessories: undefined,
		});
	});
});
