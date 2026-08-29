import { ItemView, WorkspaceLeaf } from 'obsidian';
import type CubicJBrewingPlugin from '../main';
import { t } from '../i18n/index';
import type { AcaiaEvents, AcaiaState, ButtonEvent } from '../acaia/types';
import { BrewFlowState } from '../brew/BrewFlowState';
import type { BrewFlowStep } from '../brew/types';
import { DataManageModal } from './DataManageModal';
import { TimerController } from './TimerController';
import { ScaleDisplayManager } from './ScaleDisplayManager';
import { type FlowStep, renderStep, getStepSummary, type StepRenderContext } from './StepRenderers';
import { AccordionManager } from './AccordionManager';
import { BrewProfileRecorder } from './BrewProfileRecorder';
import { NobleInstallModal } from './NobleInstallModal';

export const VIEW_TYPE_BREWING = 'cubicj-brewing';

export class BrewingView extends ItemView {
	private plugin: CubicJBrewingPlugin;
	private listenerCleanups: Array<() => void> = [];
	private cleanups: Array<() => void> = [];
	private flowState = new BrewFlowState();
	private lastFocusedStep: BrewFlowStep | null = null;
	private lastStepChangeTime = 0;
	private nobleConnectGateInFlight = false;

	private scaleConnectBtn!: HTMLButtonElement;
	private scalePowerOffBtn!: HTMLButtonElement;
	private scaleDisplay!: ScaleDisplayManager;
	private accordion!: AccordionManager;

	private timerController!: TimerController;
	private recorder = new BrewProfileRecorder();

	constructor(leaf: WorkspaceLeaf, plugin: CubicJBrewingPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_BREWING;
	}
	getDisplayText(): string {
		return 'Brewing';
	}
	getIcon(): string {
		return 'coffee';
	}

	async onOpen(): Promise<void> {
		this.log('onOpen');
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('cubicj-brewing-view');

		this.buildToolbar(container);

		const svc = this.plugin.acaiaService!;
		this.scaleDisplay = new ScaleDisplayManager(this.scaleConnectBtn, this.scalePowerOffBtn, {
			onTimerClick: () => {
				void this.timerController.handleTimerClick();
			},
			onTare: () => {
				void svc.tare();
			},
			isConnected: () => svc.state === 'connected',
			getReconnectAttempt: () => svc.currentReconnectAttempt,
		});
		this.scaleDisplay.buildHeader(container);

		const dataEl = container.createDiv({ cls: 'brewing-scale-data' });
		const scaleElems = this.scaleDisplay.buildData(dataEl);
		this.timerController = new TimerController(
			{ timerEl: scaleElems.timerEl, timerBtn: scaleElems.timerBtn },
			{ startTimer: () => svc.startTimer(), stopTimer: () => svc.stopTimer(), resetTimer: () => svc.resetTimer() },
		);

		const contentArea = container.createDiv({ cls: 'brewing-content-area' });
		this.accordion = new AccordionManager(contentArea, {
			renderStep: (step, el, registerCleanup) =>
				renderStep(step, el, this.buildRenderContext(registerCleanup)),
			getStepSummary: (step) => getStepSummary(step, this.flowState.selection),
			getPanelMode: (step) => this.flowState.panelMode(step),
		});

		this.bindServiceEvents();
		this.scaleDisplay.updateHeader(svc.state, svc.scaleName);
		this.renderContent();
	}

	async onClose(): Promise<void> {
		this.log('onClose');
		this.timerController.destroy();
		this.accordion.destroy();
		for (const fn of this.cleanups) fn();
		this.cleanups = [];
		for (const cleanup of this.listenerCleanups) cleanup();
		this.listenerCleanups = [];
	}

	tare(): void {
		if (this.plugin.acaiaService?.state === 'connected') {
			void this.plugin.acaiaService.tare();
		}
	}

	autoFill(): void {
		const panel = this.accordion.getStepPanel(this.flowState.step as FlowStep);
		if (!panel) return;
		const btns = panel.querySelectorAll<HTMLButtonElement>('.cubicj-stepper-scale-btn');
		if (btns.length > 0) btns[btns.length - 1].click();
	}

	toggleTimer(): void {
		void this.timerController.handleTimerClick();
	}

	powerOff(): void {
		if (this.plugin.acaiaService?.state === 'connected') {
			void this.plugin.acaiaService.powerOff();
		}
	}

	toggleBrewing(): void {
		const step = this.flowState.step;
		if (step === 'saving') {
			if (Date.now() - this.lastStepChangeTime < 500) return;
			const panel = this.accordion.getStepPanel('saving');
			const saveBtn = panel?.querySelector('.brew-flow-save-btn') as HTMLButtonElement | null;
			saveBtn?.click();
			return;
		}
		if (step === 'configure') {
			const panel = this.accordion.getStepPanel('configure');
			const completeBtn = panel?.querySelector('.brew-flow-start-btn') as HTMLButtonElement | null;
			completeBtn?.click();
			return;
		}
		if (step !== 'brewing') return;
		const panel = this.accordion.getStepPanel('brewing');
		if (!panel) return;
		const isEspresso = this.flowState.selection.method === 'espresso';
		if (isEspresso || this.flowState.brewingStarted) {
			this.lastStepChangeTime = Date.now();
			const stopBtn = panel.querySelector<HTMLButtonElement>('.brew-flow-stop-btn');
			stopBtn?.click();
		} else {
			const startBtn = panel.querySelector<HTMLButtonElement>('.brew-flow-start-btn');
			startBtn?.click();
		}
	}

	private buildToolbar(container: HTMLElement): void {
		const toolbar = container.createDiv({ cls: 'brewing-toolbar' });

		this.scaleConnectBtn = toolbar.createEl('button', { text: t('scale.connect'), cls: 'brewing-toolbar-btn' });
		this.scaleConnectBtn.addEventListener('click', () => {
			void this.handleConnectClick();
		});

		this.scalePowerOffBtn = toolbar.createEl('button', {
			text: t('toolbar.powerOff'),
			cls: 'brewing-toolbar-btn brewing-power-off-btn',
		});
		this.scalePowerOffBtn.addEventListener('click', () => this.powerOff());
		this.scalePowerOffBtn.setCssProps({ display: 'none' });

		const rightGroup = toolbar.createDiv({ cls: 'brewing-toolbar-right' });

		const resetBtn = rightGroup.createEl('button', { text: t('toolbar.resetSettings'), cls: 'brewing-toolbar-btn' });
		resetBtn.addEventListener('click', () => this.resetFlow());

		const manageBtn = rightGroup.createEl('button', { text: t('toolbar.dataManage'), cls: 'brewing-toolbar-btn' });
		manageBtn.addEventListener('click', () => {
			new DataManageModal(this.plugin).open();
		});
	}

	private renderContent(focusStep?: FlowStep): void {
		this.accordion.destroy();
		for (const fn of this.cleanups) fn();
		this.cleanups = [];

		if (this.flowState.step === 'idle') {
			this.flowState.startBrew();
		}

		if (!this.accordion.isBuilt()) {
			this.accordion.build();
		}

		const stepChanged = this.flowState.step !== this.lastFocusedStep;
		const shouldFocus = stepChanged || focusStep !== undefined;
		const targetStep = focusStep ?? (this.flowState.step as FlowStep);
		if (shouldFocus) {
			this.accordion.focusStep(targetStep);
			this.lastFocusedStep = this.flowState.step;
		}
		this.accordion.update();
		if (shouldFocus) {
			this.accordion.scrollStepToTop(targetStep);
		}
	}

	private resetFlow(): void {
		this.log('resetFlow');
		this.flowState.cancel();
		this.recorder.reset();
		this.flowState.startBrew();
		this.renderContent();
	}

	private buildRenderContext(registerCleanup: (fn: () => void) => void): StepRenderContext {
		return {
			flowState: this.flowState,
			plugin: this.plugin,
			renderContent: (focusStep) => this.renderContent(focusStep),
			accordion: {
				update: () => this.accordion.update(),
				expand: (step) => this.accordion.expandStep(step),
				scrollToStep: (step) => this.accordion.scrollStepToTop(step),
				animateContentChange: (step, fn) => this.accordion.animateContentChange(step, fn),
				updateSummaries: () => this.accordion.updateSummaries(),
			},
			timerController: this.timerController,
			getWeightText: () => this.scaleDisplay.getWeightText(),
			resetFlow: () => this.resetFlow(),
			recorder: this.recorder,
			profileStorage: this.plugin.profileStorage,
			equipment: this.plugin.equipment,
			registerCleanup,
		};
	}

	private bindServiceEvents(): void {
		this.listen('state', (state: AcaiaState) => {
			this.log(`state → ${state}`);
			this.scaleDisplay.updateHeader(state, this.plugin.acaiaService?.scaleName);
			this.scaleDisplay.updateControls(state, () => this.timerController.resetToIdle());
		});

		this.listen('weight', (grams: number, stable: boolean) => {
			this.scaleDisplay.updateWeight(grams, stable);
			if (this.recorder.isRecording) this.recorder.record(grams, stable);
		});

		this.listen('timer', (seconds: number) => {
			this.timerController.handleScaleTimer(seconds);
		});

		this.listen('button', (event: ButtonEvent) => {
			this.timerController.handleScaleButton(event);
		});

		this.listen('battery', (percent: number) => {
			this.scaleDisplay.updateBattery(percent);
		});

		this.listen('error', (err: Error) => {
			this.log(`error: ${err.message}`);
			this.scaleDisplay.showError(err.message);
		});
	}

	private listen<K extends keyof AcaiaEvents>(event: K, fn: AcaiaEvents[K]): void {
		const service = this.plugin.acaiaService!;
		service.on(event, fn);
		this.listenerCleanups.push(() => service.removeListener(event, fn));
	}

	async toggleConnect(): Promise<void> {
		return this.handleConnectClick();
	}

	private async handleConnectClick(): Promise<void> {
		const service = this.plugin.acaiaService!;
		if (service.state === 'scanning' || service.state === 'connecting' || service.state === 'reconnecting') {
			this.log('cancelConnect');
			await service.cancelConnect();
		} else if (service.state === 'connected') {
			this.log('disconnect');
			service.disconnect();
		} else {
			const installer = this.plugin.nobleInstaller;
			if (installer) {
				if (this.nobleConnectGateInFlight) return;
				this.nobleConnectGateInFlight = true;
				try {
					const status = await installer.status();
					if (status.kind !== 'installed') {
						const wikiUrl =
							this.plugin.getLocale() === 'ko'
								? 'https://github.com/cubicj/CubicJ-Brewing/wiki/Installation-(Korean)'
								: 'https://github.com/cubicj/CubicJ-Brewing/wiki/Installation';
						new NobleInstallModal(this.app, {
							variant: status.kind === 'not-installed' ? 'install' : 'update',
							installed: status.kind === 'version-mismatch' ? status.installed : undefined,
							installer,
							wikiUrl,
							onDone: (installed) => {
								this.nobleConnectGateInFlight = false;
								if (installed) {
									this.log('connect after noble install');
									void service.connect();
								}
							},
						}).open();
						return;
					}
				} catch (error) {
					this.log(`noble status error: ${error instanceof Error ? error.message : String(error)}`);
				}
				this.nobleConnectGateInFlight = false;
			}
			this.log('connect');
			await service.connect();
		}
	}

	private log(msg: string): void {
		this.plugin.pluginLogger?.log('VIEW', msg);
	}
}
