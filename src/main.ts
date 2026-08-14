import { Platform, Plugin } from 'obsidian';
import type { AcaiaService } from './acaia/AcaiaService';
import type { NobleInstaller } from './acaia/NobleInstaller';
import { DesktopRuntime } from './DesktopRuntime';
import { PluginLogger } from './utils/PluginLogger';
import { BrewRecordService, type StorageAdapter } from './services/BrewRecordService';
import { BrewProfileStorage } from './services/BrewProfileStorage';
import { EquipmentStorage } from './services/EquipmentStorage';
import type { FileAdapter } from './services/FileAdapter';
import { DATA_VERSION, PluginDataStore } from './services/PluginDataStore';
import { VaultDataService } from './services/VaultDataService';
import { BeanCodeBlock } from './views/BeanCodeBlock';
import { BrewCodeBlock } from './views/BrewCodeBlock';
import { BrewDayCodeBlock } from './views/BrewDayCodeBlock';
import type { EquipmentSettings, LogConfig } from './brew/types';
import { BrewingSettingTab } from './views/SettingTab';
import { initI18n } from './i18n/index';

const DATA_DIR = 'cubicj-brewing';

export default class CubicJBrewingPlugin extends Plugin {
	acaiaService: AcaiaService | null = null;
	nobleInstaller: NobleInstaller | null = null;
	recordService!: BrewRecordService;
	profileStorage!: BrewProfileStorage;
	vaultData!: VaultDataService;
	pluginLogger: PluginLogger | null = null;
	beanBlock!: BeanCodeBlock;
	private fileAdapter!: FileAdapter;
	private equipmentStorage!: EquipmentStorage;
	private equipmentState: EquipmentSettings = {
		grinders: [],
		drippers: [],
		filters: [],
		baskets: [],
		accessories: [],
	};
	private desktopRuntime: DesktopRuntime | null = null;
	private dataStore = new PluginDataStore({
		loadData: () => this.loadData(),
		saveData: (data) => this.saveData(data),
	});

	get equipment(): EquipmentSettings {
		return this.equipmentState;
	}

	set equipment(equipment: EquipmentSettings) {
		this.equipmentState = equipment;
	}

	private updateEquipmentFromStorage(equipment: EquipmentSettings): void {
		if (JSON.stringify(this.equipmentState) === JSON.stringify(equipment)) return;
		this.equipmentState.grinders.splice(0, this.equipmentState.grinders.length, ...equipment.grinders);
		this.equipmentState.drippers.splice(0, this.equipmentState.drippers.length, ...equipment.drippers);
		this.equipmentState.filters.splice(0, this.equipmentState.filters.length, ...equipment.filters);
		this.equipmentState.baskets.splice(0, this.equipmentState.baskets.length, ...equipment.baskets);
		this.equipmentState.accessories.splice(0, this.equipmentState.accessories.length, ...equipment.accessories);
	}

	async onload() {
		this.fileAdapter = {
			read: async (path) => {
				if (!(await this.app.vault.adapter.exists(path))) return null;
				return this.app.vault.adapter.read(path);
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
		};
		this.equipmentStorage = new EquipmentStorage(DATA_DIR, this.fileAdapter);
		await this.loadPluginData();
		const loadedEquipment = await this.equipmentStorage.load();
		if (loadedEquipment) {
			this.equipment = loadedEquipment;
		} else if (this.dataStore.legacyEquipment) {
			this.equipment = this.dataStore.legacyEquipment;
			await this.equipmentStorage.save(this.equipment);
			await this.dataStore.clearLegacyEquipment();
		}
		initI18n(this.dataStore.locale);
		this.vaultData = new VaultDataService(this.app, this.dataStore.beanFolder);
		if (this.dataStore.logConfig.enabled) {
			const vaultIO = {
				read: async (p: string) => this.app.vault.adapter.read(p),
				write: async (p: string, c: string) => this.app.vault.adapter.write(p, c),
			};
			this.pluginLogger = new PluginLogger(
				vaultIO,
				`${this.manifest.dir}/plugin-debug.log`,
				this.dataStore.logConfig.categories,
			);
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

		const recordsPath = `${DATA_DIR}/brew-records.json`;
		const equipmentPath = `${DATA_DIR}/equipment.json`;
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

		const brewBlock = new BrewCodeBlock(
			this.app,
			this.recordService,
			this.profileStorage,
			() => this.equipment,
			this.vaultData,
		);
		brewBlock.register((lang, handler) => this.registerMarkdownCodeBlockProcessor(lang, handler));

		const brewDayBlock = new BrewDayCodeBlock(
			this.app,
			this.recordService,
			this.profileStorage,
			() => this.equipment,
			this.vaultData,
		);
		brewDayBlock.register((lang, handler) => this.registerMarkdownCodeBlockProcessor(lang, handler));

		this.recordService.onChange = () => {
			brewBlock.refreshAll();
			brewDayBlock.refreshAll();
		};
		const refreshRecordBlocksFromVault = async () => {
			const result = await this.recordService.reload();
			if (!result.ok) {
				console.warn(`[CubicJ-Brewing] failed to reload brew records: [${result.error.code}] ${result.error.message}`);
			}
			brewBlock.refreshAll();
			brewDayBlock.refreshAll();
		};
		const handleRecordFileChange = (file: { path: string }) => {
			if (file.path === recordsPath) void refreshRecordBlocksFromVault();
		};
		this.registerEvent(this.app.vault.on('modify', handleRecordFileChange));
		this.registerEvent(this.app.vault.on('create', handleRecordFileChange));
		let equipmentReloadGeneration = 0;
		const refreshEquipmentBlocksFromVault = async () => {
			const generation = ++equipmentReloadGeneration;
			try {
				const equipment = await this.equipmentStorage.load();
				if (generation !== equipmentReloadGeneration) return;
				if (equipment) this.updateEquipmentFromStorage(equipment);
			} catch (error) {
				if (generation !== equipmentReloadGeneration) return;
				console.warn('[CubicJ-Brewing] failed to reload equipment:', error);
			}
			brewBlock.refreshAll();
			brewDayBlock.refreshAll();
		};
		const handleEquipmentFileChange = (file: { path: string }) => {
			if (file.path === equipmentPath) void refreshEquipmentBlocksFromVault();
		};
		this.registerEvent(this.app.vault.on('modify', handleEquipmentFileChange));
		this.registerEvent(this.app.vault.on('create', handleEquipmentFileChange));

		this.app.workspace.onLayoutReady(async () => {
			if (this.dataStore.savedDataVersion < 2) {
				const failures = await this.vaultData.migrateFrontmatterKeys();
				if (failures.length > 0) {
					console.warn('[CubicJ-Brewing] frontmatter migration had failures, skipping version bump');
				}
			}
			if (this.dataStore.savedDataVersion < 3) {
				await this.recordService.migrateYields(this.profileStorage);
			}
			if (this.dataStore.savedDataVersion < DATA_VERSION) {
				await this.dataStore.saveDataVersion();
			}
			if (this.dataStore.firstInstall) await this.desktopRuntime?.activateView();
		});

		this.addSettingTab(new BrewingSettingTab(this.app, this));

		// manifest.json: isDesktopOnly = false
		// Mobile gets read-only features: bean/brew code blocks, record detail modals, brew history.
		// Desktop adds BLE scale (AcaiaService), BrewingView sidebar, and live brew flow.
		if (Platform.isDesktop) {
			this.desktopRuntime = new DesktopRuntime(this);
			await this.desktopRuntime.init();
		}
	}

	onunload() {
		this.pluginLogger?.log('PLUGIN', 'onunload');
		if (this.desktopRuntime) {
			this.desktopRuntime.destroy();
		} else {
			void this.pluginLogger?.stop();
		}
	}

	async loadPluginData(): Promise<void> {
		await this.dataStore.load();
	}

	async saveEquipment(): Promise<void> {
		await this.equipmentStorage.save(this.equipment);
	}

	getBeanFolder(): string {
		return this.dataStore.beanFolder;
	}

	async saveBeanFolder(folder: string): Promise<void> {
		this.dataStore.beanFolder = folder;
		this.vaultData = new VaultDataService(this.app, folder);
		this.beanBlock.updateVaultData(this.vaultData);
		await this.dataStore.patchData({ beanFolder: folder });
	}

	getLocale(): string {
		return this.dataStore.locale;
	}

	async saveLocale(locale: string): Promise<void> {
		await this.dataStore.saveLocale(locale);
	}

	getLogConfig(): LogConfig {
		return { ...this.dataStore.logConfig };
	}

	async saveLogConfig(config: LogConfig): Promise<void> {
		await this.dataStore.saveLogConfig(config);
	}
}
