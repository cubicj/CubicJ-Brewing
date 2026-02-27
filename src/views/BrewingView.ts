import { ItemView, WorkspaceLeaf } from 'obsidian';
import type CubicJBrewingPlugin from '../main';
import type { AcaiaState } from '../acaia/types';

export const VIEW_TYPE_BREWING = 'cubicj-brewing';

export class BrewingView extends ItemView {
  private plugin: CubicJBrewingPlugin;
  private listeners: Array<{ event: string; fn: (...args: any[]) => void }> = [];

  private statusEl!: HTMLElement;
  private batteryEl!: HTMLElement;
  private connectBtn!: HTMLButtonElement;
  private weightEl!: HTMLElement;
  private timerEl!: HTMLElement;
  private tareBtn!: HTMLButtonElement;
  private timerBtn!: HTMLButtonElement;

  constructor(leaf: WorkspaceLeaf, plugin: CubicJBrewingPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_BREWING; }
  getDisplayText(): string { return 'Brewing'; }
  getIcon(): string { return 'coffee'; }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('cubicj-brewing-view');

    this.buildConnectionSection(container);
    this.buildDataSection(container);
    this.buildControlSection(container);
    this.bindServiceEvents();
    this.updateUI(this.plugin.acaiaService.state);
  }

  async onClose(): Promise<void> {
    const service = this.plugin.acaiaService;
    for (const { event, fn } of this.listeners) {
      service.removeListener(event, fn);
    }
    this.listeners = [];
  }

  private buildConnectionSection(container: HTMLElement): void {
    const section = container.createDiv({ cls: 'brewing-section brewing-connection' });

    this.connectBtn = section.createEl('button', { cls: 'brewing-connect-btn' });
    this.connectBtn.addEventListener('click', () => this.handleConnectClick());

    const statusRow = section.createDiv({ cls: 'brewing-status-row' });
    this.statusEl = statusRow.createSpan({ cls: 'brewing-status' });
    this.batteryEl = statusRow.createSpan({ cls: 'brewing-battery' });
  }

  private buildDataSection(container: HTMLElement): void {
    const section = container.createDiv({ cls: 'brewing-section brewing-data' });
    this.weightEl = section.createDiv({ cls: 'brewing-weight', text: '-- g' });
    this.timerEl = section.createDiv({ cls: 'brewing-timer', text: '--:--' });
  }

  private buildControlSection(container: HTMLElement): void {
    const section = container.createDiv({ cls: 'brewing-section brewing-controls' });
    this.tareBtn = section.createEl('button', { text: 'Tare', cls: 'brewing-ctrl-btn' });
    this.timerBtn = section.createEl('button', { text: 'Start', cls: 'brewing-ctrl-btn' });

    this.tareBtn.addEventListener('click', () => this.plugin.acaiaService.tare());
    this.timerBtn.addEventListener('click', () => this.handleTimerClick());
  }

  private bindServiceEvents(): void {
    const service = this.plugin.acaiaService;

    this.listen('state', (state: AcaiaState) => this.updateUI(state));

    this.listen('weight', (grams: number) => {
      this.weightEl.textContent = `${grams.toFixed(1)} g`;
    });

    this.listen('timer', (seconds: number) => {
      const min = Math.floor(seconds / 60);
      const sec = Math.floor(seconds % 60);
      const ds = Math.round((seconds % 1) * 10);
      this.timerEl.textContent = `${min}:${sec.toString().padStart(2, '0')}.${ds}`;
    });

    this.listen('battery', (percent: number) => {
      this.batteryEl.textContent = `${percent}%`;
    });

    this.listen('error', (err: Error) => {
      this.statusEl.textContent = err.message;
      this.statusEl.addClass('brewing-error');
      setTimeout(() => this.statusEl.removeClass('brewing-error'), 3000);
    });
  }

  private listen(event: string, fn: (...args: any[]) => void): void {
    this.plugin.acaiaService.on(event, fn);
    this.listeners.push({ event, fn });
  }

  private updateUI(state: AcaiaState): void {
    const connected = state === 'connected';
    const busy = state === 'scanning' || state === 'connecting';

    switch (state) {
      case 'idle':
        this.connectBtn.textContent = '연결';
        this.statusEl.textContent = '';
        break;
      case 'scanning':
        this.connectBtn.textContent = '스캔 중...';
        this.statusEl.textContent = '저울을 찾고 있어요';
        break;
      case 'connecting':
        this.connectBtn.textContent = '연결 중...';
        this.statusEl.textContent = '연결하는 중';
        break;
      case 'connected':
        this.connectBtn.textContent = '해제';
        this.statusEl.textContent = '연결됨';
        break;
      case 'disconnected':
        this.connectBtn.textContent = '재연결';
        this.statusEl.textContent = '연결 끊김';
        this.weightEl.addClass('brewing-dimmed');
        this.timerEl.addClass('brewing-dimmed');
        break;
    }

    this.connectBtn.disabled = busy;
    this.tareBtn.disabled = !connected;
    this.timerBtn.disabled = !connected;

    if (state === 'connected') {
      this.weightEl.removeClass('brewing-dimmed');
      this.timerEl.removeClass('brewing-dimmed');
    }

    if (state === 'idle') {
      this.weightEl.textContent = '-- g';
      this.timerEl.textContent = '--:--';
      this.batteryEl.textContent = '';
      this.weightEl.removeClass('brewing-dimmed');
      this.timerEl.removeClass('brewing-dimmed');
    }
  }

  private async handleConnectClick(): Promise<void> {
    const service = this.plugin.acaiaService;
    if (service.state === 'connected') {
      await service.disconnect();
    } else {
      await service.connect();
    }
  }

  private timerRunning = false;

  private async handleTimerClick(): Promise<void> {
    const service = this.plugin.acaiaService;
    if (this.timerRunning) {
      await service.stopTimer();
      this.timerBtn.textContent = 'Start';
      this.timerRunning = false;
    } else {
      await service.startTimer();
      this.timerBtn.textContent = 'Stop';
      this.timerRunning = true;
    }
  }
}
