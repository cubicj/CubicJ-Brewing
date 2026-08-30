import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform } from 'obsidian';
import type { EquipmentSettings, GrinderConfig } from '../src/brew/types';
import CubicJBrewingPlugin from '../src/main';
import { BrewCodeBlock } from '../src/views/BrewCodeBlock';
import { BrewDayCodeBlock } from '../src/views/BrewDayCodeBlock';

const desktopMocks = vi.hoisted(() => ({
	acaiaOptions: [] as unknown[],
	teardown: [] as string[],
	viewCreations: [] as Array<{ leaf: unknown; plugin: unknown }>,
	nobleGuards: [] as Array<() => boolean>,
	loadedNoblePaths: [] as string[],
	acaiaInstances: [] as Array<{
		scaleName: string | null;
		scaleAddress: string | null;
		emitState(state: string): void;
	}>,
}));

vi.mock('../src/acaia/NobleInstaller', () => ({
	createNobleInstaller: vi.fn((_plugin: unknown, guard: () => boolean) => {
		desktopMocks.nobleGuards.push(guard);
		return {};
	}),
	isNobleModuleLoaded: vi.fn((path: string) => {
		desktopMocks.loadedNoblePaths.push(path);
		return true;
	}),
}));

vi.mock('../src/acaia/AcaiaService', () => ({
	AcaiaService: class {
		state = 'connected';
		lastWeight = 42;
		scaleName: string | null = 'Acaia Pearl S';
		scaleAddress: string | null = 'AA:BB:CC:DD:EE:FF';
		private stateListeners: Array<(state: string) => void> = [];

		constructor(options: unknown) {
			desktopMocks.acaiaOptions.push(options);
			desktopMocks.acaiaInstances.push(this);
		}

		on(event: string, listener: (state: string) => void): this {
			if (event === 'state') this.stateListeners.push(listener);
			return this;
		}

		emitState(state: string): void {
			for (const listener of this.stateListeners) listener(state);
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
	desktopMocks.nobleGuards.length = 0;
	desktopMocks.loadedNoblePaths.length = 0;
	desktopMocks.acaiaInstances.length = 0;
	Platform.isDesktop = true;
	Platform.isMobile = false;
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
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

const defaultEquipment: EquipmentSettings = {
	grinders: [],
	drippers: [],
	filters: [],
	baskets: [],
	accessories: [],
	scales: [],
};

interface OnloadHarness {
	plugin: CubicJBrewingPlugin;
	files: Map<string, string>;
	getPluginData: () => unknown;
	emitVaultEvent: (event: 'modify' | 'create', path: string) => void;
	enableModifyOnWrite: () => void;
	setEquipmentRead: (read: () => Promise<string>) => void;
}

function makeOnloadHarness(initialData: unknown, initialFiles: Record<string, string> = {}): OnloadHarness {
	let pluginData = initialData;
	let emitModifyOnWrite = false;
	let equipmentRead: (() => Promise<string>) | null = null;
	const files = new Map(Object.entries(initialFiles));
	const vaultHandlers = new Map<string, Array<(file: { path: string }) => void>>();
	const app = {
		vault: {
			adapter: {
				exists: vi.fn(async (path: string) => files.has(path)),
				read: vi.fn(async (path: string) => {
					if (path === 'cubicj-brewing/equipment.json' && equipmentRead) return equipmentRead();
					const content = files.get(path);
					if (content === undefined) throw new Error('not found');
					return content;
				}),
				write: vi.fn(async (path: string, content: string) => {
					files.set(path, content);
					if (emitModifyOnWrite && path === 'cubicj-brewing/equipment.json') {
						for (const handler of vaultHandlers.get('modify') ?? []) handler({ path });
					}
				}),
				mkdir: vi.fn(async () => {}),
				remove: vi.fn(async (path: string) => {
					files.delete(path);
				}),
			},
			on: vi.fn((event: string, handler: (file: { path: string }) => void) => {
				const handlers = vaultHandlers.get(event) ?? [];
				handlers.push(handler);
				vaultHandlers.set(event, handlers);
				return {};
			}),
		},
		metadataCache: {
			on: vi.fn(() => ({})),
			getFileCache: vi.fn(() => null),
		},
		workspace: {
			onLayoutReady: vi.fn(),
		},
	};
	const plugin = new (CubicJBrewingPlugin as unknown as new (
		app: unknown,
		manifest: unknown,
	) => CubicJBrewingPlugin)(app, { dir: '.obsidian/plugins/cubicj-brewing' });
	Object.assign(plugin, { app, manifest: { dir: '.obsidian/plugins/cubicj-brewing' } });
	(plugin as unknown as { loadData: () => Promise<unknown> }).loadData = async () => pluginData;
	(plugin as unknown as { saveData: (data: unknown) => Promise<void> }).saveData = async (data) => {
		pluginData = data;
	};
	(plugin as unknown as { registerEvent: (ref: unknown) => void }).registerEvent = vi.fn();
	(
		plugin as unknown as {
			registerMarkdownCodeBlockProcessor: (lang: string, handler: unknown) => void;
		}
	).registerMarkdownCodeBlockProcessor = vi.fn();
	(plugin as unknown as { addSettingTab: (tab: unknown) => void }).addSettingTab = vi.fn();

	return {
		plugin,
		files,
		getPluginData: () => pluginData,
		emitVaultEvent: (event, path) => {
			for (const handler of vaultHandlers.get(event) ?? []) handler({ path });
		},
		enableModifyOnWrite: () => {
			emitModifyOnWrite = true;
		},
		setEquipmentRead: (read) => {
			equipmentRead = read;
		},
	};
}

describe('equipment storage wiring', () => {
	it('migrates legacy equipment into the vault file and removes only the legacy data key', async () => {
		Platform.isDesktop = false;
		Platform.isMobile = true;
		const legacyEquipment: EquipmentSettings = { ...defaultEquipment, grinders: [rpmGrinder], drippers: ['V60'] };
		const harness = makeOnloadHarness({ equipment: legacyEquipment, locale: 'ko', custom: 'preserved' });

		await harness.plugin.onload();

		expect(harness.plugin.equipment).toEqual(legacyEquipment);
		expect(harness.files.get('cubicj-brewing/equipment.json')).toBe(JSON.stringify(legacyEquipment, null, 2));
		expect(harness.getPluginData()).toEqual({ locale: 'ko', custom: 'preserved' });
	});

	it('does not overwrite an existing equipment file when reading it fails', async () => {
		Platform.isDesktop = false;
		Platform.isMobile = true;
		const legacyEquipment: EquipmentSettings = { ...defaultEquipment, drippers: ['Legacy'] };
		const storedEquipment: EquipmentSettings = { ...defaultEquipment, drippers: ['Stored'] };
		const rawStoredEquipment = JSON.stringify(storedEquipment);
		const harness = makeOnloadHarness(
			{ equipment: legacyEquipment, locale: 'ko' },
			{ 'cubicj-brewing/equipment.json': rawStoredEquipment },
		);
		harness.setEquipmentRead(async () => {
			throw new Error('permission denied');
		});

		await expect(harness.plugin.onload()).rejects.toThrow('permission denied');

		expect(harness.files.get('cubicj-brewing/equipment.json')).toBe(rawStoredEquipment);
		expect(harness.getPluginData()).toEqual({ equipment: legacyEquipment, locale: 'ko' });
	});

	it('persists mutations through the same equipment object exposed to views', async () => {
		Platform.isDesktop = false;
		Platform.isMobile = true;
		const storedEquipment: EquipmentSettings = { ...defaultEquipment, grinders: [validGrinder] };
		const harness = makeOnloadHarness(
			{},
			{ 'cubicj-brewing/equipment.json': JSON.stringify(storedEquipment) },
		);
		await harness.plugin.onload();
		const equipment = harness.plugin.equipment;
		equipment.drippers.push('V60');

		await harness.plugin.saveEquipment();

		expect(harness.plugin.equipment).toBe(equipment);
		expect(JSON.parse(harness.files.get('cubicj-brewing/equipment.json') ?? '')).toEqual(equipment);
	});

	it('serializes queued equipment saves in invocation order', async () => {
		Platform.isDesktop = false;
		Platform.isMobile = true;
		const harness = makeOnloadHarness(
			{},
			{ 'cubicj-brewing/equipment.json': JSON.stringify(defaultEquipment) },
		);
		await harness.plugin.onload();
		const writes: string[] = [];
		const releaseWrites: Array<() => void> = [];
		const write = harness.plugin.app.vault.adapter.write as ReturnType<typeof vi.fn>;
		write.mockImplementation(async (_path: string, content: string) => {
			writes.push(content);
			await new Promise<void>((resolve) => releaseWrites.push(resolve));
		});

		harness.plugin.equipment.drippers.push('V60');
		const first = harness.plugin.saveEquipment();
		harness.plugin.equipment.drippers.push('Kalita');
		const second = harness.plugin.saveEquipment();

		await vi.waitFor(() => expect(writes).toHaveLength(1));
		expect(JSON.parse(writes[0]).drippers).toEqual(['V60']);
		releaseWrites.shift()!();
		await vi.waitFor(() => expect(writes).toHaveLength(2));
		expect(JSON.parse(writes[1]).drippers).toEqual(['V60', 'Kalita']);
		releaseWrites.shift()!();
		await Promise.all([first, second]);
	});

	it('captures an equipment snapshot before later mutations', async () => {
		Platform.isDesktop = false;
		Platform.isMobile = true;
		const harness = makeOnloadHarness(
			{},
			{ 'cubicj-brewing/equipment.json': JSON.stringify(defaultEquipment) },
		);
		await harness.plugin.onload();
		let written = '';
		let releaseWrite!: () => void;
		const write = harness.plugin.app.vault.adapter.write as ReturnType<typeof vi.fn>;
		write.mockImplementation(async (_path: string, content: string) => {
			written = content;
			await new Promise<void>((resolve) => {
				releaseWrite = resolve;
			});
		});

		harness.plugin.equipment.filters.push('Sibarist');
		const save = harness.plugin.saveEquipment();
		harness.plugin.equipment.filters.push('Abaca');

		await vi.waitFor(() => expect(written).not.toBe(''));
		expect(JSON.parse(written).filters).toEqual(['Sibarist']);
		releaseWrite();
		await save;
	});

	it('preserves equipment and list identity when an internal save triggers a modify event', async () => {
		Platform.isDesktop = false;
		Platform.isMobile = true;
		const storedEquipment: EquipmentSettings = { ...defaultEquipment, grinders: [validGrinder] };
		const harness = makeOnloadHarness(
			{},
			{ 'cubicj-brewing/equipment.json': JSON.stringify(storedEquipment) },
		);
		const brewRefresh = vi.spyOn(BrewCodeBlock.prototype, 'refreshAll');
		const brewDayRefresh = vi.spyOn(BrewDayCodeBlock.prototype, 'refreshAll');
		await harness.plugin.onload();
		const equipment = harness.plugin.equipment;
		const drippers = equipment.drippers;
		const grinder = equipment.grinders[0];
		harness.enableModifyOnWrite();
		drippers.push('V60');

		await harness.plugin.saveEquipment();
		await vi.waitFor(() => expect(brewRefresh).toHaveBeenCalledOnce());
		expect(brewDayRefresh).toHaveBeenCalledOnce();
		drippers.push('Kalita');
		await harness.plugin.saveEquipment();
		await vi.waitFor(() => expect(brewRefresh).toHaveBeenCalledTimes(2));
		expect(brewDayRefresh).toHaveBeenCalledTimes(2);

		expect(harness.plugin.equipment).toBe(equipment);
		expect(harness.plugin.equipment.drippers).toBe(drippers);
		expect(harness.plugin.equipment.grinders[0]).toBe(grinder);
		expect(JSON.parse(harness.files.get('cubicj-brewing/equipment.json') ?? '').drippers).toEqual([
			'V60',
			'Kalita',
		]);
	});

	it('reloads external equipment edits and refreshes both brew code blocks', async () => {
		Platform.isDesktop = false;
		Platform.isMobile = true;
		const harness = makeOnloadHarness(
			{},
			{ 'cubicj-brewing/equipment.json': JSON.stringify(defaultEquipment) },
		);
		const brewRefresh = vi.spyOn(BrewCodeBlock.prototype, 'refreshAll');
		const brewDayRefresh = vi.spyOn(BrewDayCodeBlock.prototype, 'refreshAll');
		await harness.plugin.onload();
		const externalEquipment: EquipmentSettings = { ...defaultEquipment, filters: ['Sibarist'] };
		harness.files.set('cubicj-brewing/equipment.json', JSON.stringify(externalEquipment));

		harness.emitVaultEvent('modify', 'cubicj-brewing/equipment.json');

		await vi.waitFor(() => expect(harness.plugin.equipment).toEqual(externalEquipment));
		expect(brewRefresh).toHaveBeenCalledOnce();
		expect(brewDayRefresh).toHaveBeenCalledOnce();
	});

	it('retains equipment and contains read failures from the modify watcher', async () => {
		Platform.isDesktop = false;
		Platform.isMobile = true;
		const storedEquipment: EquipmentSettings = { ...defaultEquipment, filters: ['Stored'] };
		const harness = makeOnloadHarness(
			{},
			{ 'cubicj-brewing/equipment.json': JSON.stringify(storedEquipment) },
		);
		const brewRefresh = vi.spyOn(BrewCodeBlock.prototype, 'refreshAll');
		const brewDayRefresh = vi.spyOn(BrewDayCodeBlock.prototype, 'refreshAll');
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await harness.plugin.onload();
		harness.setEquipmentRead(async () => {
			throw new Error('sync read failed');
		});

		harness.emitVaultEvent('modify', 'cubicj-brewing/equipment.json');

		await vi.waitFor(() =>
			expect(warn).toHaveBeenCalledWith('[CubicJ-Brewing] failed to reload equipment:', expect.any(Error)),
		);
		expect(harness.plugin.equipment).toEqual(storedEquipment);
		expect(brewRefresh).toHaveBeenCalledOnce();
		expect(brewDayRefresh).toHaveBeenCalledOnce();
	});

	it('ignores an older equipment reload that completes after a newer edit', async () => {
		Platform.isDesktop = false;
		Platform.isMobile = true;
		const harness = makeOnloadHarness(
			{},
			{ 'cubicj-brewing/equipment.json': JSON.stringify(defaultEquipment) },
		);
		const brewRefresh = vi.spyOn(BrewCodeBlock.prototype, 'refreshAll');
		const brewDayRefresh = vi.spyOn(BrewDayCodeBlock.prototype, 'refreshAll');
		await harness.plugin.onload();
		let resolveFirst!: (raw: string) => void;
		let resolveSecond!: (raw: string) => void;
		let readCount = 0;
		let settledReads = 0;
		harness.setEquipmentRead(
			() =>
				new Promise<string>((resolve) => {
					if (readCount++ === 0) resolveFirst = resolve;
					else resolveSecond = resolve;
				}).then((raw) => {
					settledReads++;
					return raw;
				}),
		);
		harness.emitVaultEvent('modify', 'cubicj-brewing/equipment.json');
		harness.emitVaultEvent('modify', 'cubicj-brewing/equipment.json');
		await vi.waitFor(() => expect(readCount).toBe(2));
		const olderEquipment: EquipmentSettings = { ...defaultEquipment, filters: ['Old'] };
		const newerEquipment: EquipmentSettings = { ...defaultEquipment, filters: ['New'] };

		resolveSecond(JSON.stringify(newerEquipment));
		await vi.waitFor(() => expect(harness.plugin.equipment).toEqual(newerEquipment));
		resolveFirst(JSON.stringify(olderEquipment));
		await vi.waitFor(() => expect(settledReads).toBe(2));
		await Promise.resolve();

		expect(harness.plugin.equipment).toEqual(newerEquipment);
		expect(brewRefresh).toHaveBeenCalledOnce();
		expect(brewDayRefresh).toHaveBeenCalledOnce();
	});
});

describe('plugin data delegation', () => {
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
	saveEquipment: ReturnType<typeof vi.fn>;
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
	const saveEquipment = vi.fn().mockResolvedValue(undefined);
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
		equipment: { ...defaultEquipment, scales: [] },
		saveEquipment,
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
		saveEquipment,
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
			{ id: 'open-view', name: 'Open brewing view', callback: expect.any(Function) },
			{ id: 'tare', name: 'Tare scale', checkCallback: expect.any(Function) },
			{ id: 'auto-fill', name: 'Auto-fill weight', checkCallback: expect.any(Function) },
			{ id: 'toggle-brewing', name: 'Proceed / start / stop / save', checkCallback: expect.any(Function) },
			{ id: 'toggle-timer', name: 'Start / stop / reset timer', checkCallback: expect.any(Function) },
			{ id: 'toggle-connect', name: 'Connect / disconnect scale', checkCallback: expect.any(Function) },
			{ id: 'power-off-scale', name: 'Power off scale', checkCallback: expect.any(Function) },
		]);
		expect(harness.addRibbonIcon).toHaveBeenCalledWith('coffee', 'CubicJ Brewing', expect.any(Function));
		expect(harness.setScaleWeightGetter).toHaveBeenCalledOnce();
		expect(harness.getScaleWeight()).toBe(42);
	});

	it('guards installer writes with the resolved Noble module path', async () => {
		const { DesktopRuntime } = await import('../src/DesktopRuntime');
		const harness = makeRuntimeHarness();
		const runtime = new DesktopRuntime(harness.plugin);

		await runtime.init();

		expect(desktopMocks.nobleGuards).toHaveLength(1);
		expect(desktopMocks.nobleGuards[0]()).toBe(true);
		expect(desktopMocks.loadedNoblePaths).toEqual([
			'/vault/.obsidian/plugins/cubicj-brewing/noble',
		]);
	});

	it('auto-registers connected scales and contains persistence failures', async () => {
		const { DesktopRuntime } = await import('../src/DesktopRuntime');
		const harness = makeRuntimeHarness();
		harness.plugin.equipment.scales.push({
			name: 'Kitchen scale',
			address: 'aa:bb:cc:dd:ee:ff',
			lastConnectedAt: '2026-08-01T00:00:00.000Z',
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		harness.saveEquipment.mockRejectedValueOnce(new Error('write failed'));
		const runtime = new DesktopRuntime(harness.plugin);
		await runtime.init();
		const service = desktopMocks.acaiaInstances[0];

		expect(() => service.emitState('connected')).not.toThrow();

		expect(harness.plugin.equipment.scales).toHaveLength(1);
		expect(harness.plugin.equipment.scales[0]).toMatchObject({
			name: 'Kitchen scale',
			address: 'aa:bb:cc:dd:ee:ff',
		});
		expect(harness.plugin.equipment.scales[0].lastConnectedAt).not.toBe('2026-08-01T00:00:00.000Z');
		expect(harness.saveEquipment).toHaveBeenCalledOnce();
		await vi.waitFor(() =>
			expect(warn).toHaveBeenCalledWith(
				'[CubicJ-Brewing] scale registration save failed:',
				expect.objectContaining({ message: 'write failed' }),
			),
		);
		runtime.destroy();
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
