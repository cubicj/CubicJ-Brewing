import { Notice, Plugin } from 'obsidian';
import { AcaiaService } from './acaia/AcaiaService';
import { BrewingView, VIEW_TYPE_BREWING } from './views/BrewingView';
import { BrewingSettings, DEFAULT_SETTINGS, BrewingSettingTab } from './settings';
import { BrewRecordService, type StorageAdapter } from './services/BrewRecordService';
import { VaultDataService } from './services/VaultDataService';
import { FileLogger } from './utils/FileLogger';

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

    this.addCommand({
      id: 'ble-rate-experiment',
      name: 'BLE Rate Experiment',
      callback: () => this.runRateExperiment(),
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

  private async runRateExperiment(): Promise<void> {
    if (this.acaiaService.state !== 'connected') {
      new Notice('Scale not connected. Connect first.');
      return;
    }

    const logPath = `${this.manifest.dir}/ble-experiment.log`;
    const logger = new FileLogger(
      {
        read: async (p) => this.app.vault.adapter.read(p),
        write: async (p, c) => this.app.vault.adapter.write(p, c),
      },
      logPath,
      1000,
    );

    const testArgs = [0, 1, 2, 3, 5, 10];
    const durationMs = 10_000;

    await logger.clear();
    logger.start();
    logger.log('=== BLE Rate Experiment ===');
    logger.log(`args_to_test: ${JSON.stringify(testArgs)}`);
    logger.log(`duration_per_arg: ${durationMs}ms`);

    new Notice(`BLE Rate Experiment starting (${testArgs.length} args × ${durationMs / 1000}s each)`);

    for (const arg of testArgs) {
      let count = 0;
      const onWeight = () => {
        count++;
        logger.log(`weight\t${arg}\t${count}`);
      };

      logger.log(`--- arg=${arg} START ---`);
      this.acaiaService.on('weight', onWeight);
      await this.acaiaService.sendNotificationRequest(arg);

      await new Promise(r => setTimeout(r, durationMs));

      this.acaiaService.off('weight', onWeight);
      const hz = (count / (durationMs / 1000)).toFixed(2);
      logger.log(`--- arg=${arg} END --- count=${count} hz=${hz}`);
      new Notice(`arg=${arg}: ${count} readings, ${hz} Hz`);

      await new Promise(r => setTimeout(r, 500));
    }

    await this.acaiaService.sendNotificationRequest(1);
    logger.log('=== Experiment complete, restored arg=1 ===');
    await logger.stop();
    new Notice(`Experiment done! Log: ${logPath}`);
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
