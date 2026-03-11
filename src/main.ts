import { Platform, Plugin } from 'obsidian';
import type { AcaiaService, BleLogger } from './acaia/AcaiaService';
import type { FileLogger } from './utils/FileLogger';
import { PluginLogger } from './utils/PluginLogger';
import { BrewRecordService, type StorageAdapter } from './services/BrewRecordService';
import { BrewProfileStorage } from './services/BrewProfileStorage';
import type { FileAdapter } from './services/FileAdapter';
import { VaultDataService } from './services/VaultDataService';
import { BeanCodeBlock } from './views/BeanCodeBlock';
import { BrewCodeBlock } from './views/BrewCodeBlock';
import type { EquipmentSettings, GlobalHotkeys, LogConfig } from './brew/types';
import { BrewingSettingTab } from './views/SettingTab';

const DATA_DIR = 'cubicj-brewing';
const DATA_VERSION = 1;

const DEFAULT_HOTKEYS: GlobalHotkeys = {};

export default class CubicJBrewingPlugin extends Plugin {
	acaiaService: AcaiaService | null = null;
	recordService!: BrewRecordService;
	profileStorage!: BrewProfileStorage;
	vaultData!: VaultDataService;
	equipment: EquipmentSettings = { grinders: [], drippers: [], filters: [], baskets: [], accessories: [] };
	pluginLogger: PluginLogger | null = null;
	private logConfig: LogConfig = { enabled: false, categories: [], packetLog: false };
	private beforeUnloadHandler: (() => void) | null = null;
	private blePacketLogger: FileLogger | null = null;
	private fileAdapter!: FileAdapter;
	private viewType: string | null = null;
	private hotkeyManager: import('./utils/GlobalHotkeyManager').GlobalHotkeyManager | null = null;
	private globalHotkeys: GlobalHotkeys = DEFAULT_HOTKEYS;
	private firstInstall = false;
	private beanFolder = '';
	private beanBlock!: BeanCodeBlock;

	async onload() {
		await this.loadPluginData();
		this.vaultData = new VaultDataService(this.app, this.beanFolder);
		if (this.logConfig.enabled) {
			const vaultIO = {
				read: async (p: string) => this.app.vault.adapter.read(p),
				write: async (p: string, c: string) => this.app.vault.adapter.write(p, c),
			};
			this.pluginLogger = new PluginLogger(vaultIO, `${this.manifest.dir}/plugin-debug.log`, this.logConfig.categories);
			this.pluginLogger.start();
		}
		this.pluginLogger?.log('PLUGIN', 'onload');

		this.beanBlock = new BeanCodeBlock(this.app, this.vaultData);
		this.beanBlock.register((lang, handler) => this.registerMarkdownCodeBlockProcessor(lang, handler));
		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				const cache = this.app.metadataCache.getFileCache(file);
				if (cache?.frontmatter?.type === 'bean') {
					this.beanBlock.refreshAll();
				}
			}),
		);

		this.fileAdapter = {
			read: async (path) => {
				try {
					return await this.app.vault.adapter.read(path);
				} catch {
					return null;
				}
			},
			write: async (path, content) => {
				await this.app.vault.adapter.write(path, content);
			},
			mkdir: async (path) => {
				await this.app.vault.adapter.mkdir(path);
			},
			remove: async (path) => {
				await this.app.vault.adapter.remove(path);
			},
			exists: async (path) => {
				return await this.app.vault.adapter.exists(path);
			},
			list: async (path) => {
				try {
					const listed = await this.app.vault.adapter.list(path);
					return listed.files.map((f) => f.split('/').pop()!);
				} catch {
					return [];
				}
			},
		};

		const recordsPath = `${DATA_DIR}/brew-records.json`;
		const adapter: StorageAdapter = {
			read: async () => {
				try {
					return await this.app.vault.adapter.read(recordsPath);
				} catch {
					return null;
				}
			},
			write: async (content) => {
				await this.app.vault.adapter.mkdir(DATA_DIR);
				await this.app.vault.adapter.write(recordsPath, content);
			},
			writeBackup: async (content) => {
				await this.app.vault.adapter.mkdir(DATA_DIR);
				const ts = new Date().toISOString().replace(/:/g, '-');
				await this.app.vault.adapter.write(`${DATA_DIR}/brew-records.${ts}.bak`, content);
			},
		};
		this.recordService = new BrewRecordService(adapter);

		this.profileStorage = new BrewProfileStorage(DATA_DIR, this.fileAdapter);

		const brewBlock = new BrewCodeBlock(this.app, this.recordService, this.profileStorage, () => this.equipment);
		brewBlock.register((lang, handler) => this.registerMarkdownCodeBlockProcessor(lang, handler));
		this.recordService.onChange = () => brewBlock.refreshAll();

		this.app.workspace.onLayoutReady(() => {
			this.vaultData.refreshRoastDays();
			if (this.firstInstall) this.activateView();
		});

		this.addSettingTab(new BrewingSettingTab(this.app, this));

		if (Platform.isDesktop) {
			await this.initDesktop();
		}
	}

	private async initDesktop(): Promise<void> {
		const { AcaiaService } = await import('./acaia/AcaiaService');
		const { BrewingView, VIEW_TYPE_BREWING } = await import('./views/BrewingView');
		this.viewType = VIEW_TYPE_BREWING;

		const vaultAdapter = {
			read: async (p: string) => this.app.vault.adapter.read(p),
			write: async (p: string, c: string) => this.app.vault.adapter.write(p, c),
		};

		let logger: BleLogger | undefined;
		if (this.pluginLogger) {
			const pl = this.pluginLogger;
			logger = { log: (msg: string) => pl.log('BLE', msg) };
		}

		if (this.logConfig.packetLog) {
			const { FileLogger } = await import('./utils/FileLogger');
			this.blePacketLogger = new FileLogger(vaultAdapter, `${this.manifest.dir}/ble-debug.log`, 1000, 5000);
			this.blePacketLogger.start();
			this.blePacketLogger.log(`\n=== session ${new Date().toISOString()} ===`);
		}

		const basePath = (this.app.vault.adapter as any).getBasePath();
		const noblePath = require('path').join(basePath, this.manifest.dir, 'noble');
		this.acaiaService = new AcaiaService({ logger, noblePath });

		this.beanBlock.setScaleWeightGetter(() => {
			if (this.acaiaService?.state !== 'connected') return null;
			return this.acaiaService.lastWeight;
		});

		this.registerView(VIEW_TYPE_BREWING, (leaf) => new BrewingView(leaf, this));

		const getView = (): InstanceType<typeof BrewingView> | null => {
			const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BREWING);
			return leaves.length > 0 ? (leaves[0].view as InstanceType<typeof BrewingView>) : null;
		};

		this.addCommand({
			id: 'open-view',
			name: '브루잉 뷰 열기',
			callback: () => this.activateView(),
		});

		this.addCommand({
			id: 'tare',
			name: '영점 맞추기',
			checkCallback: (checking) => {
				const view = getView();
				if (!view) return false;
				if (!checking) view.tare();
				return true;
			},
		});

		const doAutoFill = () => {
			const popoverBtn = document.querySelector('.bwp-auto') as HTMLButtonElement | null;
			if (popoverBtn) {
				popoverBtn.click();
				return;
			}
			getView()?.autoFill();
		};

		this.addCommand({
			id: 'auto-fill',
			name: '무게 자동 입력',
			checkCallback: (checking) => {
				const view = getView();
				const hasPopover = !!document.querySelector('.bean-weight-popover');
				if (!view && !hasPopover) return false;
				if (!checking) doAutoFill();
				return true;
			},
		});

		this.addCommand({
			id: 'toggle-brewing',
			name: '브루잉 시작 / 중지',
			checkCallback: (checking) => {
				const view = getView();
				if (!view) return false;
				if (!checking) view.toggleBrewing();
				return true;
			},
		});

		this.addCommand({
			id: 'toggle-connect',
			name: '저울 연결 / 해제',
			checkCallback: (checking) => {
				const view = getView();
				if (!view) return false;
				if (!checking) view.toggleConnect();
				return true;
			},
		});

		this.addCommand({
			id: 'power-off-scale',
			name: '저울 전원 끄기',
			checkCallback: (checking) => {
				const view = getView();
				if (!view || this.acaiaService?.state !== 'connected') return false;
				if (!checking) view.powerOff();
				return true;
			},
		});

		const win = require('electron').remote.getCurrentWindow();
		const withFocus = (fn: () => void) => () => {
			win.maximize();
			fn();
		};

		const commandActions: Record<string, () => void> = {
			tare: withFocus(() => getView()?.tare()),
			'auto-fill': withFocus(() => doAutoFill()),
			'toggle-brewing': withFocus(() => getView()?.toggleBrewing()),
			'toggle-connect': withFocus(() => getView()?.toggleConnect()),
			'power-off-scale': withFocus(() => getView()?.powerOff()),
		};

		const { GlobalHotkeyManager } = await import('./utils/GlobalHotkeyManager');
		const gs = require('electron').remote.globalShortcut;
		this.hotkeyManager = new GlobalHotkeyManager(gs);
		this.hotkeyManager.register(this.globalHotkeys, commandActions, (msg) => this.pluginLogger?.log('PLUGIN', msg));

		this.addRibbonIcon('coffee', 'CubicJ Brewing', () => {
			this.activateView();
		});

		this.beforeUnloadHandler = () => {
			this.hotkeyManager?.unregisterAll();
			this.acaiaService?.destroy();
			this.pluginLogger?.stop();
			this.blePacketLogger?.stop();
		};
		window.addEventListener('beforeunload', this.beforeUnloadHandler);
	}

	onunload() {
		this.pluginLogger?.log('PLUGIN', 'onunload');
		if (this.beforeUnloadHandler) {
			window.removeEventListener('beforeunload', this.beforeUnloadHandler);
		}
		this.hotkeyManager?.unregisterAll();
		this.acaiaService?.destroy();
		this.pluginLogger?.stop();
		this.blePacketLogger?.stop();
	}

	async loadPluginData(): Promise<void> {
		const raw = await this.loadData();
		this.firstInstall = raw === null || raw === undefined;
		const data = raw ?? {};
		const savedVersion = typeof data.dataVersion === 'number' ? data.dataVersion : 0;
		if (savedVersion < DATA_VERSION) {
			data.dataVersion = DATA_VERSION;
			await this.saveData(data);
		}
		const eq = data.equipment;
		if (eq && typeof eq === 'object' && !Array.isArray(eq)) {
			const keys: (keyof EquipmentSettings)[] = ['grinders', 'drippers', 'filters', 'baskets', 'accessories'];
			const valid = keys.every((k) => Array.isArray(eq[k]));
			if (valid) {
				this.equipment = eq as EquipmentSettings;
			}
		}
		const lc = data.logConfig;
		if (lc && typeof lc === 'object' && !Array.isArray(lc)) {
			this.logConfig = {
				enabled: typeof lc.enabled === 'boolean' ? lc.enabled : false,
				categories: Array.isArray(lc.categories) ? lc.categories : [],
				packetLog: typeof lc.packetLog === 'boolean' ? lc.packetLog : false,
			};
		}
		if (data.globalHotkeys && typeof data.globalHotkeys === 'object' && !Array.isArray(data.globalHotkeys)) {
			const hk = data.globalHotkeys as Record<string, unknown>;
			const valid = Object.values(hk).every((v) => typeof v === 'string');
			if (valid) {
				this.globalHotkeys = hk as GlobalHotkeys;
			}
		} else {
			this.globalHotkeys = DEFAULT_HOTKEYS;
		}
		if (typeof data.beanFolder === 'string') {
			this.beanFolder = data.beanFolder;
		}
	}

	async saveEquipment(): Promise<void> {
		const data = (await this.loadData()) ?? {};
		data.equipment = this.equipment;
		await this.saveData(data);
	}

	getBeanFolder(): string {
		return this.beanFolder;
	}

	async saveBeanFolder(folder: string): Promise<void> {
		this.beanFolder = folder;
		this.vaultData = new VaultDataService(this.app, folder);
		this.beanBlock.updateVaultData(this.vaultData);
		const data = (await this.loadData()) ?? {};
		data.beanFolder = folder;
		await this.saveData(data);
	}

	getLogConfig(): LogConfig {
		return { ...this.logConfig };
	}

	async saveLogConfig(config: LogConfig): Promise<void> {
		this.logConfig = config;
		const data = (await this.loadData()) ?? {};
		data.logConfig = config;
		await this.saveData(data);
	}

	private async activateView(): Promise<void> {
		if (!this.viewType) return;
		const leaves = this.app.workspace.getLeavesOfType(this.viewType);
		if (leaves.length === 0) {
			const leaf = this.app.workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: this.viewType, active: true });
		}
		const target = this.app.workspace.getLeavesOfType(this.viewType)[0];
		if (target) this.app.workspace.revealLeaf(target);
	}
}
