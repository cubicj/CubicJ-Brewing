import { describe, expect, it, vi } from 'vitest';
import type { GrinderConfig } from '../../src/brew/types';
import { DATA_VERSION, PluginDataStore, type PluginDataPort } from '../../src/services/PluginDataStore';

function makePort(initialData: unknown): {
	port: PluginDataPort;
	getData: () => unknown;
	saveData: ReturnType<typeof vi.fn>;
} {
	let data = initialData;
	const saveData = vi.fn(async (nextData: unknown) => {
		data = nextData;
	});
	return {
		port: {
			loadData: async () => data,
			saveData,
		},
		getData: () => data,
		saveData,
	};
}

const validGrinder: GrinderConfig = { name: 'C40', step: 1, min: 0, max: 40 };
const rpmGrinder: GrinderConfig = {
	name: 'DF64V',
	step: 1,
	min: 0,
	max: 90,
	rpm: { min: 300, max: 2000, step: 10, current: 1200 },
};

describe('PluginDataStore equipment validation', () => {
	it('keeps valid equipment intact', async () => {
		const { port } = makePort({
			equipment: {
				grinders: [validGrinder],
				drippers: ['V60'],
				filters: ['HF'],
				baskets: ['18g'],
				accessories: ['WDT'],
			},
		});
		const store = new PluginDataStore(port);

		await store.load();

		expect(store.equipment).toEqual({
			grinders: [validGrinder],
			drippers: ['V60'],
			filters: ['HF'],
			baskets: ['18g'],
			accessories: ['WDT'],
		});
	});

	it('filters malformed grinder entries', async () => {
		const { port } = makePort({
			equipment: {
				grinders: [validGrinder, { name: 'no-range' }, null, { name: 5, step: 0.1, min: 0, max: 50 }],
				drippers: [],
				filters: [],
				baskets: [],
				accessories: [],
			},
		});
		const store = new PluginDataStore(port);

		await store.load();

		expect(store.equipment.grinders).toEqual([validGrinder]);
	});

	it('filters non-string entries from string lists', async () => {
		const { port } = makePort({
			equipment: {
				grinders: [],
				drippers: ['V60', 3, null],
				filters: [{}],
				baskets: ['18g'],
				accessories: [false],
			},
		});
		const store = new PluginDataStore(port);

		await store.load();

		expect(store.equipment.drippers).toEqual(['V60']);
		expect(store.equipment.filters).toEqual([]);
		expect(store.equipment.baskets).toEqual(['18g']);
		expect(store.equipment.accessories).toEqual([]);
	});

	it('keeps defaults when an equipment key is not an array', async () => {
		const { port } = makePort({
			equipment: { grinders: 'broken', drippers: [], filters: [], baskets: [], accessories: [] },
		});
		const store = new PluginDataStore(port);

		await store.load();

		expect(store.equipment).toEqual({ grinders: [], drippers: [], filters: [], baskets: [], accessories: [] });
	});

	it('keeps a valid rpm config on a grinder', async () => {
		const { port } = makePort({
			equipment: { grinders: [rpmGrinder], drippers: [], filters: [], baskets: [], accessories: [] },
		});
		const store = new PluginDataStore(port);

		await store.load();

		expect(store.equipment.grinders).toEqual([rpmGrinder]);
	});

	it('strips a malformed rpm config but keeps the grinder', async () => {
		const broken = { ...validGrinder, rpm: { min: 300, max: 2000, step: 10, current: 'fast' } };
		const { port } = makePort({
			equipment: { grinders: [broken], drippers: [], filters: [], baskets: [], accessories: [] },
		});
		const store = new PluginDataStore(port);

		await store.load();

		expect(store.equipment.grinders).toEqual([validGrinder]);
	});
});

describe('PluginDataStore settings state', () => {
	it('loads version, log config, bean folder, locale, and existing-install state', async () => {
		const { port } = makePort({
			dataVersion: 2,
			logConfig: { enabled: true, categories: ['BLE'], packetLog: true },
			beanFolder: 'Coffee/Beans',
			locale: 'ko',
		});
		const store = new PluginDataStore(port);

		await store.load();

		expect(store.savedDataVersion).toBe(2);
		expect(store.logConfig).toEqual({ enabled: true, categories: ['BLE'], packetLog: true });
		expect(store.beanFolder).toBe('Coffee/Beans');
		expect(store.locale).toBe('ko');
		expect(store.firstInstall).toBe(false);
	});

	it('uses defaults for missing data and detects first install', async () => {
		const { port } = makePort(null);
		const store = new PluginDataStore(port);

		await store.load();

		expect(store.savedDataVersion).toBe(0);
		expect(store.logConfig).toEqual({ enabled: false, categories: [], packetLog: false });
		expect(store.beanFolder).toBe('');
		expect(store.locale).toBe('en');
		expect(store.firstInstall).toBe(true);
	});

	it('defaults malformed log config fields independently', async () => {
		const { port } = makePort({
			logConfig: { enabled: 'yes', categories: 'BLE', packetLog: 1 },
		});
		const store = new PluginDataStore(port);

		await store.load();

		expect(store.logConfig).toEqual({ enabled: false, categories: [], packetLog: false });
	});
});

describe('PluginDataStore persistence', () => {
	it('patches each setting into the latest saved data and round-trips equipment mutations', async () => {
		const { port, getData, saveData } = makePort({
			custom: 'preserved',
			equipment: { grinders: [validGrinder], drippers: [], filters: [], baskets: [], accessories: [] },
		});
		const store = new PluginDataStore(port);
		await store.load();
		const equipment = store.equipment;
		equipment.drippers.push('V60');

		await store.saveEquipment();
		await store.saveLogConfig({ enabled: true, categories: ['FLOW'], packetLog: false });
		await store.saveBeanFolder('Beans');
		await store.saveLocale('ko');
		await store.saveDataVersion();

		expect(store.equipment).toBe(equipment);
		expect(getData()).toEqual({
			custom: 'preserved',
			equipment,
			logConfig: { enabled: true, categories: ['FLOW'], packetLog: false },
			beanFolder: 'Beans',
			locale: 'ko',
			dataVersion: DATA_VERSION,
		});
		expect(saveData).toHaveBeenCalledTimes(5);

		const reloaded = new PluginDataStore(port);
		await reloaded.load();
		expect(reloaded.equipment).toEqual(equipment);
	});
});
