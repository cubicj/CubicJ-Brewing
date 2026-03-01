import { Notice, Platform, Plugin } from 'obsidian';
import type { AcaiaService, BleLogger } from './acaia/AcaiaService';
import type { FileLogger } from './utils/FileLogger';
import { BrewRecordService, type StorageAdapter } from './services/BrewRecordService';
import { BrewProfileStorage } from './services/BrewProfileStorage';
import type { FileAdapter } from './services/FileAdapter';
import { VaultDataService } from './services/VaultDataService';
import { BeanCodeBlock } from './views/BeanCodeBlock';
import { BrewCodeBlock } from './views/BrewCodeBlock';

const BLE_DEBUG = true;

export default class CubicJBrewingPlugin extends Plugin {
  acaiaService: AcaiaService | null = null;
  recordService!: BrewRecordService;
  profileStorage!: BrewProfileStorage;
  vaultData!: VaultDataService;
  private beforeUnloadHandler: (() => void) | null = null;
  private bleLogger: FileLogger | null = null;
  private viewType: string | null = null;

  async onload() {
    this.vaultData = new VaultDataService(this.app);

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
    };
    this.profileStorage = new BrewProfileStorage(this.manifest.dir, fileAdapter);

    const brewBlock = new BrewCodeBlock(this.app, this.recordService, this.profileStorage);
    brewBlock.register((lang, handler) => this.registerMarkdownCodeBlockProcessor(lang, handler));
    this.recordService.onChange = () => brewBlock.refreshAll();

    if (Platform.isDesktop) {
      await this.initDesktop();
    }
  }

  private async initDesktop(): Promise<void> {
    const { AcaiaService } = await import('./acaia/AcaiaService');
    const { BrewingView, VIEW_TYPE_BREWING } = await import('./views/BrewingView');
    const { FileLogger } = await import('./utils/FileLogger');
    this.viewType = VIEW_TYPE_BREWING;

    let logger: BleLogger | undefined;
    if (BLE_DEBUG) {
      const logPath = `${this.manifest.dir}/ble-debug.log`;
      this.bleLogger = new FileLogger(
        {
          read: async (p) => this.app.vault.adapter.read(p),
          write: async (p, c) => this.app.vault.adapter.write(p, c),
        },
        logPath,
        1000,
        1000,
      );
      this.bleLogger.start();
      this.bleLogger.log(`\n=== session ${new Date().toISOString()} ===`);
      logger = this.bleLogger;
    }

    this.acaiaService = new AcaiaService({ logger });

    this.registerView(VIEW_TYPE_BREWING, (leaf) => new BrewingView(leaf, this));

    this.addRibbonIcon('coffee', 'CubicJ Brewing', () => {
      this.activateView();
    });

    this.app.workspace.onLayoutReady(() => this.activateView());

    this.beforeUnloadHandler = () => {
      this.acaiaService?.destroy();
      this.bleLogger?.stop();
    };
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  onunload() {
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }
    this.acaiaService?.destroy();
    this.bleLogger?.stop();
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
