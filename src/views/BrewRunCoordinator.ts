import type { AcaiaState, ButtonEvent } from '../acaia/types';
import type { BrewFlowState } from '../brew/BrewFlowState';
import type { BrewFlowStep } from '../brew/types';
import { estimateYield } from '../brew/yieldEstimator';
import type { BrewProfileRecorder } from './BrewProfileRecorder';
import type { TimerController } from './TimerController';

export interface BrewRunDeps {
	getScaleState: () => AcaiaState;
	renderContent: (focusStep?: Exclude<BrewFlowStep, 'idle'>) => void;
}

export class BrewRunCoordinator {
	private generation = 0;
	private linkLost = false;
	private runMode: 'none' | 'manual' | 'scale' = 'none';
	private timerOwned = false;
	private terminalTransition = false;
	private ops: Promise<void> = Promise.resolve();
	private timerOperationClaim = 0;
	private savePending = false;

	constructor(
		private flowState: BrewFlowState,
		private recorder: BrewProfileRecorder,
		private timerController: TimerController,
		private deps: BrewRunDeps,
	) {}

	hasActiveRun(): boolean {
		return this.flowState.step === 'brewing' && this.flowState.brewingStarted;
	}

	isLinkLost(): boolean {
		return this.hasActiveRun() && this.linkLost;
	}

	isScaleModeRun(): boolean {
		return this.hasActiveRun() && this.runMode === 'scale';
	}

	beginSave(): boolean {
		if (this.savePending) return false;
		this.savePending = true;
		return true;
	}

	endSave(): void {
		this.savePending = false;
	}

	isSavePending(): boolean {
		return this.savePending;
	}

	getGeneration(): number {
		return this.generation;
	}

	redoRun(): boolean {
		if (this.savePending || this.flowState.step !== 'saving') return false;
		this.generation += 1;
		this.timerOperationClaim += 1;
		this.linkLost = false;
		this.runMode = 'none';
		this.timerOwned = false;
		this.terminalTransition = false;
		this.recorder.reset();
		this.flowState.redoBrewing();
		if (this.flowState.selection.method === 'filter') this.timerController.resetToIdle();
		this.deps.renderContent();
		return true;
	}

	async startRun(): Promise<boolean> {
		if (!this.flowState.beginBrewingRun()) return false;
		const gen = ++this.generation;
		this.linkLost = false;
		this.terminalTransition = false;
		this.runMode = this.deps.getScaleState() === 'connected' ? 'scale' : 'manual';
		this.timerOwned = this.runMode === 'scale';
		if (this.runMode === 'scale') {
			this.recorder.start();
			return this.runTimerOperation(async (claim) => {
				if (gen !== this.generation) {
					if (claim === this.timerOperationClaim) this.timerController.resetToIdle();
					return false;
				}
				this.timerController.resetToIdle();
				try {
					await this.timerController.handleTimerClick();
				} catch (err) {
					if (gen !== this.generation) {
						if (claim === this.timerOperationClaim) this.timerController.resetToIdle();
						return false;
					}
					this.flowState.cancelBrewingRun();
					this.recorder.reset();
					this.runMode = 'none';
					this.timerOwned = false;
					this.deps.renderContent('brewing');
					throw err;
				}
				if (gen !== this.generation) {
					if (claim === this.timerOperationClaim) this.timerController.resetToIdle();
					return false;
				}
				return true;
			});
		}
		return gen === this.generation;
	}

	async finishRun(): Promise<boolean> {
		if (!this.hasActiveRun() || this.terminalTransition) return false;
		this.terminalTransition = true;
		const scaleMode = this.isScaleModeRun();
		const timerOwned = this.timerOwned;
		const gen = ++this.generation;
		const sel = this.flowState.selection;
		try {
			if (scaleMode) this.recorder.stop();
			const elapsed = timerOwned
				? await this.runTimerOperation(async () => {
					const elapsed = this.timerController.getElapsedSeconds();
					try {
						await this.timerController.freeze();
					} catch (err) {
						if (gen === this.generation) {
							console.error('[BrewRunCoordinator] timer freeze failed:', err);
							this.timerController.resetToIdle();
						}
					}
					return elapsed;
				})
				: await this.runTimerOperation(() => this.timerController.getElapsedSeconds());
			if (gen !== this.generation) return false;
			if (scaleMode) {
				const points = this.recorder.getPoints();
				const yieldGrams =
					(sel.method === 'filter' && points.length > 0 ? estimateYield(points) : undefined) ?? sel.yield;
				this.flowState.finishBrewing(elapsed || undefined, yieldGrams);
			} else {
				this.flowState.finishBrewing(sel.time ?? (elapsed || undefined), sel.yield);
			}
			this.linkLost = false;
			this.runMode = 'none';
			this.timerOwned = false;
			return true;
		} finally {
			if (gen === this.generation) this.terminalTransition = false;
		}
	}

	async cancelRun(): Promise<void> {
		if (!this.hasActiveRun() || this.terminalTransition) return;
		this.terminalTransition = true;
		const timerOwned = this.timerOwned;
		const gen = ++this.generation;
		const connected = this.deps.getScaleState() === 'connected';
		this.recorder.reset();
		this.flowState.cancelBrewingRun();
		this.linkLost = false;
		this.runMode = 'none';
		this.timerOwned = false;
		try {
			await this.runTimerOperation(async () => {
				if (timerOwned && connected) await this.timerController.cancelRun();
				else this.timerController.resetToIdle();
			});
		} finally {
			if (gen === this.generation) this.terminalTransition = false;
		}
	}

	convertToManual(): void {
		if (!this.isLinkLost() || this.terminalTransition) return;
		this.generation += 1;
		this.timerOperationClaim += 1;
		this.recorder.reset();
		this.runMode = 'manual';
		this.linkLost = false;
		this.deps.renderContent('brewing');
	}

	handleScaleState(state: AcaiaState): void {
		if (!this.isScaleModeRun()) return;
		if (state === 'disconnected' || state === 'reconnecting') {
			if (!this.linkLost) {
				this.linkLost = true;
				this.deps.renderContent('brewing');
			}
		} else if (state === 'connected' && this.linkLost) {
			this.linkLost = false;
			this.deps.renderContent('brewing');
		}
	}

	handleScaleButton(event: ButtonEvent): void {
		if (
			this.flowState.selection.method === 'filter' &&
			this.flowState.step === 'brewing' &&
			this.deps.getScaleState() === 'connected'
		) {
			const running = this.flowState.brewingStarted;
			if (this.terminalTransition && running && event.type === 'timer_stop') return;
			if (!running && event.type === 'timer_start') {
				const gen = ++this.generation;
				this.runTimerOperation((claim) => {
					if (gen !== this.generation) {
						if (claim === this.timerOperationClaim) this.timerController.resetToIdle();
						return;
					}
					this.timerController.handleScaleButton(event);
					if (this.flowState.beginBrewingRun()) {
						this.linkLost = false;
						this.runMode = 'scale';
						this.timerOwned = true;
						this.terminalTransition = false;
						this.recorder.start();
						this.deps.renderContent('brewing');
					}
				}).catch((err) => console.error('[BrewRunCoordinator] scale start failed:', err));
				return;
			}
			if (running && event.type === 'timer_stop') {
				this.runTimerOperation(() => this.timerController.handleScaleButton(event)).catch((err) =>
					console.error('[BrewRunCoordinator] scale stop forwarding failed:', err),
				);
				this.finishRun()
					.then((ok) => {
						if (ok) this.deps.renderContent();
					})
					.catch((err) => console.error('[BrewRunCoordinator] scale stop failed:', err));
				return;
			}
		}
		this.runTimerOperation(() => this.timerController.handleScaleButton(event)).catch((err) =>
			console.error('[BrewRunCoordinator] scale button forwarding failed:', err),
		);
	}

	handleToolbarTimer(): void {
		if (this.flowState.selection.method === 'filter' && this.flowState.step === 'brewing') {
			if (this.terminalTransition) return;
			if (!this.flowState.brewingStarted) {
				this.startRun()
					.then((ok) => {
						if (ok) this.deps.renderContent('brewing');
					})
					.catch((err) => console.error('[BrewRunCoordinator] toolbar start failed:', err));
				return;
			}
			this.finishRun()
				.then((ok) => {
					if (ok) this.deps.renderContent();
				})
				.catch((err) => console.error('[BrewRunCoordinator] toolbar stop failed:', err));
			return;
		}
		this.runTimerOperation(() => this.timerController.handleTimerClick()).catch((err) =>
			console.error('[BrewRunCoordinator] toolbar timer failed:', err),
		);
	}

	resetAll(): void {
		this.generation += 1;
		this.linkLost = false;
		this.runMode = 'none';
		this.timerOwned = false;
		this.terminalTransition = false;
		this.recorder.reset();
		const connected = this.deps.getScaleState() === 'connected';
		this.runTimerOperation(async () => {
			if (connected && !this.timerController.isIdle()) await this.timerController.cancelRun();
			else this.timerController.resetToIdle();
		}).catch((err) => {
			console.error('[BrewRunCoordinator] reset timer cancel failed:', err);
		});
	}

	private runTimerOperation<T>(operation: (claim: number) => Promise<T> | T): Promise<T> {
		const claim = ++this.timerOperationClaim;
		const result = this.ops.then(() => operation(claim));
		this.ops = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}
}
