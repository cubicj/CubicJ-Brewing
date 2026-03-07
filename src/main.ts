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
import type { EquipmentSettings, LogConfig } from './brew/types';

const DATA_DIR = 'cubicj-brewing';

export default class CubicJBrewingPlugin extends Plugin {
	acaiaService: AcaiaService | null = null;
	recordService!: BrewRecordService;
	profileStorage!: BrewProfileStorage;
	vaultData!: VaultDataService;
	equipment: EquipmentSettings = { grinders: [], drippers: [], filters: [], baskets: [], accessories: [] };
	pluginLogger: PluginLogger | null = null;
	private logConfig: LogConfig = { enabled: true, categories: [], packetLog: false };
	private beforeUnloadHandler: (() => void) | null = null;
	private blePacketLogger: FileLogger | null = null;
	private fileAdapter!: FileAdapter;
	private viewType: string | null = null;

	async onload() {
		this.vaultData = new VaultDataService(this.app);
		await this.loadPluginData();
		if (this.logConfig.enabled) {
			const vaultIO = {
				read: async (p: string) => this.app.vault.adapter.read(p),
				write: async (p: string, c: string) => this.app.vault.adapter.write(p, c),
			};
			this.pluginLogger = new PluginLogger(vaultIO, `${this.manifest.dir}/plugin-debug.log`, this.logConfig.categories);
			this.pluginLogger.start();
		}
		this.pluginLogger?.log('PLUGIN', 'onload');

		const beanBlock = new BeanCodeBlock(this.app, this.vaultData);
		beanBlock.register((lang, handler) => this.registerMarkdownCodeBlockProcessor(lang, handler));
		this.registerEvent(
			this.app.metadataCache.on('changed', (file) => {
				const cache = this.app.metadataCache.getFileCache(file);
				if (cache?.frontmatter?.type === 'bean') {
					beanBlock.refreshAll();
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
		};
		this.recordService = new BrewRecordService(adapter);

		this.profileStorage = new BrewProfileStorage(DATA_DIR, this.fileAdapter);

		const brewBlock = new BrewCodeBlock(this.app, this.recordService, this.profileStorage, () => this.equipment);
		brewBlock.register((lang, handler) => this.registerMarkdownCodeBlockProcessor(lang, handler));
		this.recordService.onChange = () => brewBlock.refreshAll();

		this.app.workspace.onLayoutReady(() => this.vaultData.refreshRoastDays());

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

		this.acaiaService = new AcaiaService({ logger });

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

		this.addCommand({
			id: 'auto-fill',
			name: '무게 자동 입력',
			checkCallback: (checking) => {
				const view = getView();
				if (!view) return false;
				if (!checking) view.autoFill();
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

		this.addRibbonIcon('coffee', 'CubicJ Brewing', () => {
			this.activateView();
		});

		this.beforeUnloadHandler = () => {
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
		this.acaiaService?.destroy();
		this.pluginLogger?.stop();
		this.blePacketLogger?.stop();
	}

	async loadPluginData(): Promise<void> {
		const data = (await this.loadData()) ?? {};
		const eq = data.equipment;
		if (eq && typeof eq === 'object' && !Array.isArray(eq)) {
			const keys: (keyof EquipmentSettings)[] = ['grinders', 'drippers', 'filters', 'baskets', 'accessories'];
			const valid = keys.every((k) => Array.isArray(eq[k]));
			if (valid) {
				this.equipment = eq as EquipmentSettings;
			} else {
				this.pluginLogger?.log('PLUGIN', 'data.json equipment schema mismatch, using defaults');
			}
		}
		const lc = data.logConfig;
		if (lc && typeof lc === 'object' && !Array.isArray(lc)) {
			this.logConfig = {
				enabled: typeof lc.enabled === 'boolean' ? lc.enabled : true,
				categories: Array.isArray(lc.categories) ? lc.categories : [],
				packetLog: typeof lc.packetLog === 'boolean' ? lc.packetLog : false,
			};
		}
	}

	async saveEquipment(): Promise<void> {
		const data = (await this.loadData()) ?? {};
		data.equipment = this.equipment;
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
