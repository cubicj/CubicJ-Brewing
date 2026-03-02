import { Notice, Platform, Plugin } from 'obsidian';
import type { AcaiaService, BleLogger } from './acaia/AcaiaService';
import type { FileLogger } from './utils/FileLogger';
import { PluginLogger } from './utils/PluginLogger';
import { BrewRecordService, type StorageAdapter } from './services/BrewRecordService';
import { BrewProfileStorage } from './services/BrewProfileStorage';
import type { FileAdapter } from './services/FileAdapter';
import { VaultDataService } from './services/VaultDataService';
import { BeanCodeBlock } from './views/BeanCodeBlock';
import { BrewCodeBlock } from './views/BrewCodeBlock';
import type { EquipmentSettings } from './brew/types';

const BLE_PACKET_DEBUG = false;
const PLUGIN_DEBUG = true;

export default class CubicJBrewingPlugin extends Plugin {
  acaiaService: AcaiaService | null = null;
  recordService!: BrewRecordService;
  profileStorage!: BrewProfileStorage;
  vaultData!: VaultDataService;
  equipment: EquipmentSettings = { grinders: [], drippers: [], filters: [], baskets: [], accessories: [] };
  pluginLogger: PluginLogger | null = null;
  private beforeUnloadHandler: (() => void) | null = null;
  private blePacketLogger: FileLogger | null = null;
  private viewType: string | null = null;

  async onload() {
    if (PLUGIN_DEBUG) {
      const vaultIO = {
        read: async (p: string) => this.app.vault.adapter.read(p),
        write: async (p: string, c: string) => this.app.vault.adapter.write(p, c),
      };
      this.pluginLogger = new PluginLogger(vaultIO, `${this.manifest.dir}/plugin-debug.log`);
      this.pluginLogger.start();
    }
    this.pluginLogger?.log('PLUGIN', 'onload');
    this.vaultData = new VaultDataService(this.app);
    await this.loadEquipment();

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

    const recordsPath = `${this.manifest.dir}/brew-records.json`;
    const adapter: StorageAdapter = {
      read: async () => {
        try { return await this.app.vault.adapter.read(recordsPath); }
        catch { return null; }
      },
      write: async (content) => {
        await this.app.vault.adapter.write(recordsPath, content);
      },
    };
    this.recordService = new BrewRecordService(adapter);

    const fileAdapter: FileAdapter = {
      read: async (path) => {
        try { return await this.app.vault.adapter.read(path); }
        catch { return null; }
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
    this.profileStorage = new BrewProfileStorage(this.manifest.dir, fileAdapter);

    const brewBlock = new BrewCodeBlock(this.app, this.recordService, this.profileStorage, () => this.equipment);
    brewBlock.register((lang, handler) => this.registerMarkdownCodeBlockProcessor(lang, handler));
    this.recordService.onChange = () => brewBlock.refreshAll();

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

    if (BLE_PACKET_DEBUG) {
      const { FileLogger } = await import('./utils/FileLogger');
      this.blePacketLogger = new FileLogger(vaultAdapter, `${this.manifest.dir}/ble-debug.log`, 1000, 1000);
      this.blePacketLogger.start();
      this.blePacketLogger.log(`\n=== session ${new Date().toISOString()} ===`);
    }

    this.acaiaService = new AcaiaService({ logger });

    this.registerView(VIEW_TYPE_BREWING, (leaf) => new BrewingView(leaf, this));

    this.addRibbonIcon('coffee', 'CubicJ Brewing', () => {
      this.activateView();
    });

    this.app.workspace.onLayoutReady(() => this.activateView());

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

  async loadEquipment(): Promise<void> {
    const data = await this.loadData() ?? {};
    if (data.equipment) {
      this.equipment = data.equipment;
    }
  }

  async saveEquipment(): Promise<void> {
    const data = await this.loadData() ?? {};
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
