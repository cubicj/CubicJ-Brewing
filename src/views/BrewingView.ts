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

export const VIEW_TYPE_BREWING = 'cubicj-brewing';

export class BrewingView extends ItemView {
	private plugin: CubicJBrewingPlugin;
	private listeners: Array<{ event: string; fn: (...args: any[]) => void }> = [];
	private flowState = new BrewFlowState();

	private scaleConnectBtn!: HTMLButtonElement;
	private scalePowerOffBtn!: HTMLButtonElement;
	private scaleDisplay!: ScaleDisplayManager;
	private accordion!: AccordionManager;

	private timerController!: TimerController;
	private brewingStarted = false;
	private recorder = new BrewProfileRecorder();
	private savingRoRef = { current: null as ResizeObserver | null };

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
		if (this.savingRoRef.current) {
			this.savingRoRef.current.disconnect();
			this.savingRoRef.current = null;
		}
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
		const btns = container.querySelectorAll('.brew-flow-stepper-scale-btn') as NodeListOf<HTMLButtonElement>;
		if (btns.length > 0) btns[btns.length - 1].click();
	}

	powerOff(): void {
		if (this.plugin.acaiaService?.state === 'connected') {
			this.plugin.acaiaService.powerOff();
		}
	}

	toggleBrewing(): void {
		const container = this.containerEl.children[1] as HTMLElement;
		const startBtn = container.querySelector('.brew-flow-start-btn') as HTMLButtonElement | null;
		if (startBtn) {
			startBtn.click();
			return;
		}
		const stopBtn = container.querySelector('.brew-flow-stop-btn') as HTMLButtonElement | null;
		if (stopBtn) stopBtn.click();
	}

	private buildToolbar(container: HTMLElement): void {
		const toolbar = container.createDiv({ cls: 'brewing-toolbar' });

		this.scaleConnectBtn = toolbar.createEl('button', { text: '저울 연결', cls: 'brewing-toolbar-btn' });
		this.scaleConnectBtn.addEventListener('click', () => this.handleConnectClick());

		this.scalePowerOffBtn = toolbar.createEl('button', {
			text: '전원 끄기',
			cls: 'brewing-toolbar-btn brewing-power-off-btn',
		});
		this.scalePowerOffBtn.addEventListener('click', () => this.powerOff());
		this.scalePowerOffBtn.style.display = 'none';

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
			setBrewingStarted: (v) => {
				this.brewingStarted = v;
			},
			resetFlow: () => this.resetFlow(),
			recorder: this.recorder,
			expandStep: (step) => this.accordion.expandStep(step),
			animateContentChange: (step, mutation) => this.accordion.animateContentChange(step, mutation),
			profileStorage: this.plugin.profileStorage,
			grinders: this.plugin.equipment.grinders,
			drippers: this.plugin.equipment.drippers,
			filters: this.plugin.equipment.filters,
			baskets: this.plugin.equipment.baskets,
			accessories: this.plugin.equipment.accessories,
			updateSummaries: () => this.accordion.updateSummaries(),
			savingRo: this.savingRoRef,
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
