import { Plugin } from 'obsidian';
import { AcaiaService } from './acaia/AcaiaService';
import { BrewingView, VIEW_TYPE_BREWING } from './views/BrewingView';
import { BrewingSettings, DEFAULT_SETTINGS, BrewingSettingTab } from './settings';
import { BrewRecordService, type StorageAdapter } from './services/BrewRecordService';
import { VaultDataService } from './services/VaultDataService';

export default class CubicJBrewingPlugin extends Plugin {
  acaiaService!: AcaiaService;
  settings!: BrewingSettings;
  recordService!: BrewRecordService;
  vaultData!: VaultDataService;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new BrewingSettingTab(this.app, this));
    this.acaiaService = new AcaiaService();

    this.vaultData = new VaultDataService(this.app);
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

    this.registerView(VIEW_TYPE_BREWING, (leaf) => new BrewingView(leaf, this));

    this.addRibbonIcon('coffee', 'CubicJ Brewing', () => {
      this.activateView();
    });

    this.app.workspace.onLayoutReady(() => this.activateView());
  }

  onunload() {
    this.acaiaService.destroy();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async activateView(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BREWING);
    if (leaves.length === 0) {
      const leaf = this.app.workspace.getRightLeaf(false);
      await leaf?.setViewState({ type: VIEW_TYPE_BREWING, active: true });
    }
    const target = this.app.workspace.getLeavesOfType(VIEW_TYPE_BREWING)[0];
    if (target) this.app.workspace.revealLeaf(target);
  }
}
