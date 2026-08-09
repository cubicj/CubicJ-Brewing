import { describe, expect, it } from 'vitest';
import type { GrinderConfig } from '../src/brew/types';
import CubicJBrewingPlugin from '../src/main';

function makePlugin(data: unknown): CubicJBrewingPlugin {
	const plugin = new (CubicJBrewingPlugin as unknown as new (app: unknown, manifest: unknown) => CubicJBrewingPlugin)(
		{},
		{},
	);
	(plugin as unknown as { loadData: () => Promise<unknown> }).loadData = async () => data;
	return plugin;
}

const validGrinder: GrinderConfig = { name: 'C40', step: 1, min: 0, max: 40 };
const rpmGrinder: GrinderConfig = {
	name: 'DF64V',
	step: 1,
	min: 0,
	max: 90,
	rpm: { min: 300, max: 2000, step: 10, current: 1200 },
};

describe('loadPluginData equipment validation', () => {
	it('keeps valid equipment intact', async () => {
		const plugin = makePlugin({
			equipment: {
				grinders: [validGrinder],
				drippers: ['V60'],
				filters: ['HF'],
				baskets: ['18g'],
				accessories: ['WDT'],
			},
		});
		await plugin.loadPluginData();
		expect(plugin.equipment).toEqual({
			grinders: [validGrinder],
			drippers: ['V60'],
			filters: ['HF'],
			baskets: ['18g'],
			accessories: ['WDT'],
		});
	});

	it('filters malformed grinder entries', async () => {
		const plugin = makePlugin({
			equipment: {
				grinders: [validGrinder, { name: 'no-range' }, null, { name: 5, step: 0.1, min: 0, max: 50 }],
				drippers: [],
				filters: [],
				baskets: [],
				accessories: [],
			},
		});
		await plugin.loadPluginData();
		expect(plugin.equipment.grinders).toEqual([validGrinder]);
	});

	it('filters non-string entries from string lists', async () => {
		const plugin = makePlugin({
			equipment: {
				grinders: [],
				drippers: ['V60', 3, null],
				filters: [{}],
				baskets: ['18g'],
				accessories: [false],
			},
		});
		await plugin.loadPluginData();
		expect(plugin.equipment.drippers).toEqual(['V60']);
		expect(plugin.equipment.filters).toEqual([]);
		expect(plugin.equipment.baskets).toEqual(['18g']);
		expect(plugin.equipment.accessories).toEqual([]);
	});

	it('keeps defaults when an equipment key is not an array', async () => {
		const plugin = makePlugin({
			equipment: { grinders: 'broken', drippers: [], filters: [], baskets: [], accessories: [] },
		});
		await plugin.loadPluginData();
		expect(plugin.equipment).toEqual({ grinders: [], drippers: [], filters: [], baskets: [], accessories: [] });
	});

	it('keeps a valid rpm config on a grinder', async () => {
		const plugin = makePlugin({
			equipment: { grinders: [rpmGrinder], drippers: [], filters: [], baskets: [], accessories: [] },
		});
		await plugin.loadPluginData();
		expect(plugin.equipment.grinders).toEqual([rpmGrinder]);
	});

	it('strips a malformed rpm config but keeps the grinder', async () => {
		const broken = { ...validGrinder, rpm: { min: 300, max: 2000, step: 10, current: 'fast' } };
		const plugin = makePlugin({
			equipment: { grinders: [broken], drippers: [], filters: [], baskets: [], accessories: [] },
		});
		await plugin.loadPluginData();
		expect(plugin.equipment.grinders).toEqual([validGrinder]);
	});
});
