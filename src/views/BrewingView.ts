import { ItemView, WorkspaceLeaf } from 'obsidian';
import type CubicJBrewingPlugin from '../main';
import type { AcaiaState, ButtonEvent } from '../acaia/types';
import { BrewFlowState } from '../brew/BrewFlowState';
import { DataManageModal } from './DataManageModal';
import { TimerController } from './TimerController';
import { ScaleDisplayManager } from './ScaleDisplayManager';
import { type FlowStep, renderStep, getStepSummary, type StepRenderContext } from './StepRenderers';
import { AccordionManager } from './AccordionManager';
import { BrewProfileRecorder } from './BrewProfileRecorder';
import { DEFAULT_FILTERS, DEFAULT_BASKETS, DEFAULT_GRINDERS } from '../brew/constants';

export const VIEW_TYPE_BREWING = 'cubicj-brewing';

export class BrewingView extends ItemView {
	private plugin: CubicJBrewingPlugin;
	private listeners: Array<{ event: string; fn: (...args: any[]) => void }> = [];
	private flowState = new BrewFlowState();

	private scaleConnectBtn!: HTMLButtonElement;
	private scaleDisplay!: ScaleDisplayManager;
	private accordion!: AccordionManager;

	private timerController!: TimerController;
	private brewingStarted = false;
	private recorder = new BrewProfileRecorder();

	constructor(leaf: WorkspaceLeaf, plugin: CubicJBrewingPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return VIEW_TYPE_BREWING; }
	getDisplayText(): string { return 'Brewing'; }
	getIcon(): string { return 'coffee'; }

	async onOpen(): Promise<void> {
		this.log('onOpen');
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('cubicj-brewing-view');

		this.buildToolbar(container);

		const svc = this.plugin.acaiaService;
		this.scaleDisplay = new ScaleDisplayManager(this.scaleConnectBtn, {
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
		const service = this.plugin.acaiaService;
		for (const { event, fn } of this.listeners) {
			service.removeListener(event, fn);
		}
		this.listeners = [];
	}

	private buildToolbar(container: HTMLElement): void {
		const toolbar = container.createDiv({ cls: 'brewing-toolbar' });

		this.scaleConnectBtn = toolbar.createEl('button', { text: '저울 연결', cls: 'brewing-toolbar-btn' });
		this.scaleConnectBtn.addEventListener('click', () => this.handleConnectClick());

		const rightGroup = toolbar.createDiv({ cls: 'brewing-toolbar-right' });

		const resetBtn = rightGroup.createEl('button', { text: '세팅 리셋', cls: 'brewing-toolbar-btn' });
		resetBtn.addEventListener('click', () => this.resetFlow());

		const manageBtn = rightGroup.createEl('button', { text: 'DB 관리', cls: 'brewing-toolbar-btn' });
		manageBtn.addEventListener('click', () => {
			new DataManageModal(this.plugin).open();
		});
	}

	private renderContent(): void {
		if (this.flowState.step === 'idle') {
			this.brewingStarted = false;
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
		return {
			flowState: this.flowState,
			plugin: this.plugin,
			renderContent: () => this.renderContent(),
			updateAccordion: () => this.accordion.update(),
			timerController: this.timerController,
			getWeightText: () => this.scaleDisplay.getWeightText(),
			brewingStarted: this.brewingStarted,
			setBrewingStarted: (v) => { this.brewingStarted = v; },
			resetFlow: () => this.resetFlow(),
			recorder: this.recorder,
			expandStep: (step) => this.accordion.expandStep(step),
			animateContentChange: (step, mutation) => this.accordion.animateContentChange(step, mutation),
			profileStorage: this.plugin.profileStorage,
			filters: DEFAULT_FILTERS,
			baskets: DEFAULT_BASKETS,
			grinders: DEFAULT_GRINDERS,
		};
	}

	private bindServiceEvents(): void {
		this.listen('state', (state: AcaiaState) => {
			this.log(`state → ${state}`);
			this.scaleDisplay.updateHeader(state, this.plugin.acaiaService?.scaleName);
			this.scaleDisplay.updateControls(state, () => this.timerController.resetToIdle());
		});

		this.listen('weight', (grams: number) => {
			this.scaleDisplay.updateWeight(grams);
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
		this.plugin.acaiaService.on(event, fn);
		this.listeners.push({ event, fn });
	}

	private async handleConnectClick(): Promise<void> {
		const service = this.plugin.acaiaService;
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
