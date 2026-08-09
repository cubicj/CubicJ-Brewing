import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GrinderConfig } from '../src/brew/types';
import CubicJBrewingPlugin from '../src/main';

const desktopMocks = vi.hoisted(() => ({
	acaiaOptions: [] as unknown[],
	teardown: [] as string[],
	viewCreations: [] as Array<{ leaf: unknown; plugin: unknown }>,
}));

vi.mock('../src/acaia/AcaiaService', () => ({
	AcaiaService: class {
		state = 'connected';
		lastWeight = 42;

		constructor(options: unknown) {
			desktopMocks.acaiaOptions.push(options);
		}

		destroy(): void {
			desktopMocks.teardown.push('acaia');
		}
	},
}));

vi.mock('../src/views/BrewingView', () => ({
	VIEW_TYPE_BREWING: 'cubicj-brewing',
	BrewingView: class {
		constructor(leaf: unknown, plugin: unknown) {
			desktopMocks.viewCreations.push({ leaf, plugin });
		}

		tare(): void {}
		autoFill(): void {}
		toggleBrewing(): void {}
		toggleConnect(): void {}
		powerOff(): void {}
	},
}));

beforeEach(() => {
	desktopMocks.acaiaOptions.length = 0;
	desktopMocks.teardown.length = 0;
	desktopMocks.viewCreations.length = 0;
});

afterEach(() => {
	vi.unstubAllGlobals();
});

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

describe('plugin data delegation', () => {
	it('persists mutations through the same equipment object exposed to views', async () => {
		let data: unknown = {
			equipment: { grinders: [validGrinder], drippers: [], filters: [], baskets: [], accessories: [] },
		};
		const plugin = makePlugin(data);
		(plugin as unknown as { saveData: (nextData: unknown) => Promise<void> }).saveData = async (nextData) => {
			data = nextData;
		};
		await plugin.loadPluginData();
		const equipment = plugin.equipment;
		equipment.drippers.push('V60');

		await plugin.saveEquipment();

		expect(plugin.equipment).toBe(equipment);
		expect((data as { equipment: unknown }).equipment).toBe(equipment);
	});

	it('keeps locale and log config getter semantics across saves', async () => {
		let data: unknown = {
			locale: 'en',
			logConfig: { enabled: false, categories: [] },
		};
		const plugin = makePlugin(data);
		const saveData = vi.fn(async (nextData: unknown) => {
			data = nextData;
		});
		(plugin as unknown as { saveData: (nextData: unknown) => Promise<void> }).saveData = saveData;
		await plugin.loadPluginData();

		await plugin.saveLocale('ko');
		await plugin.saveLogConfig({ enabled: true, categories: ['BLE'] });
		const config = plugin.getLogConfig();
		config.enabled = false;

		expect(plugin.getLocale()).toBe('ko');
		expect(plugin.getLogConfig()).toEqual({ enabled: true, categories: ['BLE'] });
		expect(saveData).toHaveBeenCalledTimes(2);
	});
});

interface RuntimeHarness {
	plugin: CubicJBrewingPlugin;
	commands: Array<{ id: string; name: string; callback?: unknown; checkCallback?: unknown }>;
	registerView: ReturnType<typeof vi.fn>;
	addRibbonIcon: ReturnType<typeof vi.fn>;
	setScaleWeightGetter: ReturnType<typeof vi.fn>;
	getScaleWeight: () => number | null;
	beforeUnload: () => void;
	removeEventListener: ReturnType<typeof vi.fn>;
	setViewState: ReturnType<typeof vi.fn>;
	revealLeaf: ReturnType<typeof vi.fn>;
}

function makeRuntimeHarness(): RuntimeHarness {
	const commands: Array<{ id: string; name: string; callback?: unknown; checkCallback?: unknown }> = [];
	let scaleWeightGetter = () => null as number | null;
	let beforeUnload = () => {};
	let leaves: Array<{ view: unknown }> = [];
	const target = { view: {} };
	const revealLeaf = vi.fn();
	const setViewState = vi.fn(async () => {
		leaves = [target];
	});
	const removeEventListener = vi.fn((_type: string, _handler: () => void) => {
		desktopMocks.teardown.push('listener');
	});
	vi.stubGlobal('window', {
		addEventListener: vi.fn((_type: string, handler: () => void) => {
			beforeUnload = handler;
		}),
		removeEventListener,
	});
	vi.stubGlobal('document', { querySelector: vi.fn(() => null) });

	const registerView = vi.fn();
	const addRibbonIcon = vi.fn();
	const setScaleWeightGetter = vi.fn((getter: () => number | null) => {
		scaleWeightGetter = getter;
	});
	const plugin = {
		app: {
			vault: {
				adapter: {
					read: vi.fn(async () => ''),
					write: vi.fn(async () => {}),
					getBasePath: () => '/vault',
				},
			},
			workspace: {
				getLeavesOfType: vi.fn(() => leaves),
				getRightLeaf: vi.fn(() => ({ setViewState })),
				revealLeaf,
			},
		},
		manifest: { dir: '.obsidian/plugins/cubicj-brewing' },
		acaiaService: null,
		pluginLogger: {
			log: vi.fn(),
			stop: vi.fn(() => {
				desktopMocks.teardown.push('plugin');
			}),
		},
		beanBlock: { setScaleWeightGetter },
		getLogConfig: () => ({ enabled: true, categories: ['BLE'] }),
		registerView,
		addCommand: vi.fn((command: { id: string; name: string }) => {
			commands.push(command);
		}),
		addRibbonIcon,
	} as unknown as CubicJBrewingPlugin;

	return {
		plugin,
		commands,
		registerView,
		addRibbonIcon,
		setScaleWeightGetter,
		getScaleWeight: () => scaleWeightGetter(),
		beforeUnload: () => beforeUnload(),
		removeEventListener,
		setViewState,
		revealLeaf,
	};
}

describe('DesktopRuntime', () => {
	it('initializes the desktop service, view, commands, ribbon, and scale getter', async () => {
		const { DesktopRuntime } = await import('../src/DesktopRuntime');
		const harness = makeRuntimeHarness();
		const runtime = new DesktopRuntime(harness.plugin);

		await runtime.init();

		expect(harness.plugin.acaiaService).not.toBeNull();
		expect(desktopMocks.acaiaOptions).toEqual([
			{ logger: expect.any(Object), noblePath: '/vault/.obsidian/plugins/cubicj-brewing/noble' },
		]);
		expect(harness.registerView).toHaveBeenCalledWith('cubicj-brewing', expect.any(Function));
		expect(harness.commands).toEqual([
			{ id: 'open-view', name: 'Open Brewing View', callback: expect.any(Function) },
			{ id: 'tare', name: 'Tare Scale', checkCallback: expect.any(Function) },
			{ id: 'auto-fill', name: 'Auto-fill Weight', checkCallback: expect.any(Function) },
			{ id: 'toggle-brewing', name: 'Proceed / Start / Stop / Save', checkCallback: expect.any(Function) },
			{ id: 'toggle-connect', name: 'Connect / Disconnect Scale', checkCallback: expect.any(Function) },
			{ id: 'power-off-scale', name: 'Power Off Scale', checkCallback: expect.any(Function) },
		]);
		expect(harness.addRibbonIcon).toHaveBeenCalledWith('coffee', 'CubicJ Brewing', expect.any(Function));
		expect(harness.setScaleWeightGetter).toHaveBeenCalledOnce();
		expect(harness.getScaleWeight()).toBe(42);
	});

	it('activates and reveals the desktop view through the existing workspace flow', async () => {
		const { DesktopRuntime } = await import('../src/DesktopRuntime');
		const harness = makeRuntimeHarness();
		const runtime = new DesktopRuntime(harness.plugin);
		await runtime.init();

		await runtime.activateView();

		expect(harness.setViewState).toHaveBeenCalledWith({ type: 'cubicj-brewing', active: true });
		expect(harness.revealLeaf).toHaveBeenCalledOnce();
	});

	it('preserves teardown order when beforeunload and plugin unload both run', async () => {
		const { DesktopRuntime } = await import('../src/DesktopRuntime');
		const harness = makeRuntimeHarness();
		const runtime = new DesktopRuntime(harness.plugin);
		await runtime.init();

		harness.beforeUnload();
		runtime.destroy();

		expect(desktopMocks.teardown).toEqual(['acaia', 'plugin', 'listener', 'acaia', 'plugin']);
		expect(harness.removeEventListener).toHaveBeenCalledOnce();
	});
});
