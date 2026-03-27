import { ItemView, WorkspaceLeaf } from 'obsidian';
import type CubicJBrewingPlugin from '../main';
import { t } from '../i18n/index';
import type { AcaiaState, ButtonEvent } from '../acaia/types';
import { BrewFlowState } from '../brew/BrewFlowState';
import { DataManageModal } from './DataManageModal';
import { TimerController } from './TimerController';
import { ScaleDisplayManager } from './ScaleDisplayManager';
import { type FlowStep, renderStep, getStepSummary, type StepRenderContext } from './StepRenderers';
import { AccordionManager } from './AccordionManager';
import { BrewProfileRecorder } from './BrewProfileRecorder';

export const VIEW_TYPE_BREWING = 'cubicj-brewing';

export class BrewingView extends ItemView {
	private plugin: CubicJBrewingPlugin;
	private listeners: Array<{ event: string; fn: (...args: any[]) => void }> = [];
	private cleanups: Array<() => void> = [];
	private flowState = new BrewFlowState();
	private brewingStarted = false;
	private lastStepChangeTime = 0;

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
			onTimerClick: () => this.timerController.handleTimerClick(),
			onTare: () => svc.tare(),
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
			renderStep: (step, el) => renderStep(step, el, this.buildRenderContext()),
			getStepSummary: (step) => getStepSummary(step, this.flowState.selection),
			getCurrentStep: () => this.flowState.step,
		});

		this.bindServiceEvents();
		this.scaleDisplay.updateHeader(svc.state, svc.scaleName);
		this.renderContent();
	}

	async onClose(): Promise<void> {
		this.log('onClose');
		this.timerController.destroy();
		for (const fn of this.cleanups) fn();
		this.cleanups = [];
		const service = this.plugin.acaiaService!;
		for (const { event, fn } of this.listeners) {
			service.removeListener(event, fn);
		}
		this.listeners = [];
	}

	tare(): void {
		if (this.plugin.acaiaService?.state === 'connected') {
			this.plugin.acaiaService.tare();
		}
	}

	autoFill(): void {
		const container = this.containerEl.children[1] as HTMLElement;
		const btns = container.querySelectorAll('.cubicj-stepper-scale-btn') as NodeListOf<HTMLButtonElement>;
		if (btns.length > 0) btns[btns.length - 1].click();
	}

	powerOff(): void {
		if (this.plugin.acaiaService?.state === 'connected') {
			this.plugin.acaiaService.powerOff();
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
		if (isEspresso || this.brewingStarted) {
			this.lastStepChangeTime = Date.now();
			const stopBtn = panel.querySelector('.brew-flow-stop-btn') as HTMLButtonElement | null;
			stopBtn?.click();
		} else {
			const startBtn = panel.querySelector('.brew-flow-start-btn') as HTMLButtonElement | null;
			startBtn?.click();
		}
	}

	private buildToolbar(container: HTMLElement): void {
		const toolbar = container.createDiv({ cls: 'brewing-toolbar' });

		this.scaleConnectBtn = toolbar.createEl('button', { text: t('scale.connect'), cls: 'brewing-toolbar-btn' });
		this.scaleConnectBtn.addEventListener('click', () => this.handleConnectClick());

		this.scalePowerOffBtn = toolbar.createEl('button', {
			text: t('toolbar.powerOff'),
			cls: 'brewing-toolbar-btn brewing-power-off-btn',
		});
		this.scalePowerOffBtn.addEventListener('click', () => this.powerOff());
		this.scalePowerOffBtn.style.display = 'none';

		const rightGroup = toolbar.createDiv({ cls: 'brewing-toolbar-right' });

		const resetBtn = rightGroup.createEl('button', { text: t('toolbar.resetSettings'), cls: 'brewing-toolbar-btn' });
		resetBtn.addEventListener('click', () => this.resetFlow());

		const manageBtn = rightGroup.createEl('button', { text: t('toolbar.dataManage'), cls: 'brewing-toolbar-btn' });
		manageBtn.addEventListener('click', () => {
			new DataManageModal(this.plugin).open();
		});
	}

	private renderContent(): void {
		for (const fn of this.cleanups) fn();
		this.cleanups = [];

		if (this.flowState.step === 'idle') {
			this.flowState.startBrew();
		}

		if (!this.accordion.isBuilt()) {
			this.accordion.build();
		} else {
			this.accordion.focusStep(this.flowState.step as FlowStep);
		}

		this.accordion.update();
	}

	private resetFlow(): void {
		this.log('resetFlow');
		this.flowState.cancel();
		this.brewingStarted = false;
		this.recorder.reset();
		this.flowState.startBrew();
		this.accordion.clearExpandedSteps();
		this.accordion.update();
	}

	private buildRenderContext(): StepRenderContext {
		const getBrewing = () => this.brewingStarted;
		const setBrewing = (v: boolean) => {
			this.brewingStarted = v;
		};
		return {
			flowState: this.flowState,
			plugin: this.plugin,
			renderContent: () => this.renderContent(),
			accordion: {
				update: () => this.accordion.update(),
				expand: (step) => this.accordion.expandStep(step),
				animateContentChange: (step, fn) => this.accordion.animateContentChange(step, fn),
				updateSummaries: () => this.accordion.updateSummaries(),
			},
			timerController: this.timerController,
			getWeightText: () => this.scaleDisplay.getWeightText(),
			resetFlow: () => this.resetFlow(),
			recorder: this.recorder,
			profileStorage: this.plugin.profileStorage,
			equipment: this.plugin.equipment,
			get brewingStarted() {
				return getBrewing();
			},
			set brewingStarted(v: boolean) {
				setBrewing(v);
			},
			registerCleanup: (fn: () => void) => {
				this.cleanups.push(fn);
			},
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
			if (this.recorder.isRecording) this.recorder.record(grams);
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

	private listen(event: string, fn: (...args: any[]) => void): void {
		this.plugin.acaiaService!.on(event, fn);
		this.listeners.push({ event, fn });
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
			await service.disconnect();
		} else {
			this.log('connect');
			await service.connect();
		}
	}

	private log(msg: string): void {
		this.plugin.pluginLogger?.log('VIEW', msg);
	}
}
