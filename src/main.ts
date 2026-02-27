import { Plugin } from 'obsidian';
import { AcaiaService } from './acaia/AcaiaService';
import { BrewingView, VIEW_TYPE_BREWING } from './views/BrewingView';

export default class CubicJBrewingPlugin extends Plugin {
  acaiaService!: AcaiaService;

  async onload() {
    this.acaiaService = new AcaiaService();

    this.registerView(VIEW_TYPE_BREWING, (leaf) => new BrewingView(leaf, this));

    this.addRibbonIcon('coffee', 'CubicJ Brewing', () => {
      this.activateView();
    });

    this.app.workspace.onLayoutReady(() => this.activateView());
  }

  onunload() {
    this.acaiaService.destroy();
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
