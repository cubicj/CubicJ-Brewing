import { describe, expect, it, vi } from 'vitest';
import type { EquipmentSettings, GrinderConfig } from '../../src/brew/types';
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

describe('PluginDataStore legacy equipment', () => {
	it('parses valid legacy equipment separately from plugin settings', async () => {
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

		expect(store.legacyEquipment).toEqual({
			grinders: [validGrinder],
			drippers: ['V60'],
			filters: ['HF'],
			baskets: ['18g'],
			accessories: ['WDT'],
			scales: [],
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

		expect(store.legacyEquipment?.grinders).toEqual([validGrinder]);
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

		expect(store.legacyEquipment?.drippers).toEqual(['V60']);
		expect(store.legacyEquipment?.filters).toEqual([]);
		expect(store.legacyEquipment?.baskets).toEqual(['18g']);
		expect(store.legacyEquipment?.accessories).toEqual([]);
	});

	it('keeps defaults when an equipment key is not an array', async () => {
		const { port } = makePort({
			equipment: { grinders: 'broken', drippers: [], filters: [], baskets: [], accessories: [] },
		});
		const store = new PluginDataStore(port);

		await store.load();

		expect(store.legacyEquipment).toBeNull();
	});

	it('keeps a valid rpm config on a grinder', async () => {
		const { port } = makePort({
			equipment: { grinders: [rpmGrinder], drippers: [], filters: [], baskets: [], accessories: [] },
		});
		const store = new PluginDataStore(port);

		await store.load();

		expect(store.legacyEquipment?.grinders).toEqual([rpmGrinder]);
	});

	it('strips a malformed rpm config but keeps the grinder', async () => {
		const broken = { ...validGrinder, rpm: { min: 300, max: 2000, step: 10, current: 'fast' } };
		const { port } = makePort({
			equipment: { grinders: [broken], drippers: [], filters: [], baskets: [], accessories: [] },
		});
		const store = new PluginDataStore(port);

		await store.load();

		expect(store.legacyEquipment?.grinders).toEqual([validGrinder]);
	});

	it('removes only the legacy equipment key from the latest plugin data', async () => {
		const legacyEquipment: EquipmentSettings = {
			grinders: [validGrinder],
			drippers: [],
			filters: [],
			baskets: [],
			accessories: [],
			scales: [],
		};
		const { port, getData, saveData } = makePort({
			equipment: legacyEquipment,
			locale: 'ko',
			custom: { preserved: true },
		});
		const store = new PluginDataStore(port);
		await store.load();

		await store.clearLegacyEquipment();

		expect(getData()).toEqual({ locale: 'ko', custom: { preserved: true } });
		expect(saveData).toHaveBeenCalledOnce();
		expect(store.legacyEquipment).toBeNull();
	});
});

describe('PluginDataStore settings state', () => {
	it('loads version, log config, bean folder, locale, and existing-install state', async () => {
		const { port } = makePort({
			dataVersion: 2,
			logConfig: { enabled: true, categories: ['BLE'] },
			beanFolder: 'Coffee/Beans',
			locale: 'ko',
		});
		const store = new PluginDataStore(port);

		await store.load();

		expect(store.savedDataVersion).toBe(2);
		expect(store.logConfig).toEqual({ enabled: true, categories: ['BLE'] });
		expect(store.beanFolder).toBe('Coffee/Beans');
		expect(store.locale).toBe('ko');
		expect(store.firstInstall).toBe(false);
	});

	it('uses defaults for missing data and detects first install', async () => {
		const { port } = makePort(null);
		const store = new PluginDataStore(port);

		await store.load();

		expect(store.savedDataVersion).toBe(0);
		expect(store.logConfig).toEqual({ enabled: false, categories: [] });
		expect(store.beanFolder).toBe('');
		expect(store.locale).toBe('en');
		expect(store.firstInstall).toBe(true);
		expect(store.legacyEquipment).toBeNull();
	});

	it('loads beanHubNote and defaults it to an empty string', async () => {
		const loaded = new PluginDataStore(makePort({ beanHubNote: 'Coffee/Beans.md' }).port);
		await loaded.load();
		expect(loaded.beanHubNote).toBe('Coffee/Beans.md');

		const empty = new PluginDataStore(makePort({}).port);
		await empty.load();
		expect(empty.beanHubNote).toBe('');

		const wrongType = new PluginDataStore(makePort({ beanHubNote: 42 }).port);
		await wrongType.load();
		expect(wrongType.beanHubNote).toBe('');
	});

	it('saveBeanHubNote patches the stored data', async () => {
		const { port, getData } = makePort({ beanFolder: 'Beans' });
		const store = new PluginDataStore(port);
		await store.load();

		await store.saveBeanHubNote('Coffee/Beans.md');

		expect(store.beanHubNote).toBe('Coffee/Beans.md');
		expect(getData()).toEqual({ beanFolder: 'Beans', beanHubNote: 'Coffee/Beans.md' });
	});

	it('defaults malformed log config fields independently', async () => {
		const { port } = makePort({
			logConfig: { enabled: 'yes', categories: 'BLE' },
		});
		const store = new PluginDataStore(port);

		await store.load();

		expect(store.logConfig).toEqual({ enabled: false, categories: [] });
	});
});

describe('PluginDataStore persistence', () => {
	it('patches each setting into the latest saved data without adding equipment', async () => {
		const { port, getData, saveData } = makePort({
			custom: 'preserved',
		});
		const store = new PluginDataStore(port);
		await store.load();

		await store.saveLogConfig({ enabled: true, categories: ['FLOW'] });
		await store.saveBeanFolder('Beans');
		await store.saveLocale('ko');
		await store.saveDataVersion();

		expect(getData()).toEqual({
			custom: 'preserved',
			logConfig: { enabled: true, categories: ['FLOW'] },
			beanFolder: 'Beans',
			locale: 'ko',
			dataVersion: DATA_VERSION,
		});
		expect(saveData).toHaveBeenCalledTimes(4);
	});
});

describe('PluginDataStore write serialization', () => {
	it('applies overlapping patchData calls in call order', async () => {
		let data: Record<string, unknown> = { keep: true };
		const pending: Array<() => void> = [];
		const port: PluginDataPort = {
			loadData: () =>
				new Promise((resolve) => {
					pending.push(() => resolve({ ...data }));
				}),
			saveData: async (next: unknown) => {
				data = next as Record<string, unknown>;
			},
		};
		const store = new PluginDataStore(port);

		const first = store.saveBeanHubNote('A.md');
		const second = store.saveBeanHubNote('AB.md');

		await Promise.resolve();
		expect(pending).toHaveLength(1);
		pending.shift()!();
		await first;
		await Promise.resolve();
		expect(pending).toHaveLength(1);
		pending.shift()!();
		await second;

		expect(data).toEqual({ keep: true, beanHubNote: 'AB.md' });
	});

	it('rejects a failed write without wedging the next write', async () => {
		let data: Record<string, unknown> = { keep: true };
		let saveCount = 0;
		const error = new Error('save failed');
		const port: PluginDataPort = {
			loadData: async () => ({ ...data }),
			saveData: async (next: unknown) => {
				saveCount += 1;
				if (saveCount === 1) {
					throw error;
				}
				data = next as Record<string, unknown>;
			},
		};
		const store = new PluginDataStore(port);

		const failed = store.patchData({ failed: true });
		const recovered = store.patchData({ recovered: true });

		await expect(failed).rejects.toBe(error);
		await expect(recovered).resolves.toBeUndefined();

		expect(saveCount).toBe(2);
		expect(data).toEqual({ keep: true, recovered: true });
	});

	it('serializes clearLegacyEquipment and patchData in either call order', async () => {
		const runScenario = async (clearFirst: boolean) => {
			let data: Record<string, unknown> = { equipment: { grinders: [] }, keep: true };
			const pending: Array<() => void> = [];
			const saved: Record<string, unknown>[] = [];
			const port: PluginDataPort = {
				loadData: () =>
					new Promise((resolve) => {
						pending.push(() => resolve({ ...data }));
					}),
				saveData: async (next: unknown) => {
					data = next as Record<string, unknown>;
					saved.push({ ...data });
				},
			};
			const store = new PluginDataStore(port);

			const first = clearFirst
				? store.clearLegacyEquipment()
				: store.patchData({ beanFolder: 'Beans' });
			const second = clearFirst
				? store.patchData({ beanFolder: 'Beans' })
				: store.clearLegacyEquipment();

			await Promise.resolve();
			expect(pending).toHaveLength(1);
			pending.shift()!();
			await first;
			expect(saved).toHaveLength(1);
			await Promise.resolve();
			expect(pending).toHaveLength(1);
			pending.shift()!();
			await second;

			expect(saved).toHaveLength(2);
			expect(data).toEqual({ keep: true, beanFolder: 'Beans' });
		};

		await runScenario(true);
		await runScenario(false);
	});
});
