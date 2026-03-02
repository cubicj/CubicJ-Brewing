import type { ButtonEvent } from '../acaia/types';

export interface TimerElements {
	timerEl: HTMLElement;
	timerBtn: HTMLButtonElement;
}

export interface TimerCallbacks {
	startTimer: () => Promise<void>;
	stopTimer: () => Promise<void>;
	resetTimer: () => Promise<void>;
}

export class TimerController {
	private timerState: 'idle' | 'running' | 'stopped' = 'idle';
	private timerStartedAt = 0;
	private timerElapsedAtStop = 0;
	private localTimerInterval: ReturnType<typeof setInterval> | null = null;

	constructor(
		private elements: TimerElements,
		private callbacks: TimerCallbacks,
	) {}

	getElapsedSeconds(): number {
		if (this.timerState === 'running') {
			return this.timerElapsedAtStop + (Date.now() - this.timerStartedAt) / 1000;
		}
		return this.timerElapsedAtStop;
	}

	async handleTimerClick(): Promise<void> {
		switch (this.timerState) {
			case 'idle':
				await this.callbacks.resetTimer();
				await this.callbacks.startTimer();
				this.timerStartedAt = Date.now();
				this.timerElapsedAtStop = 0;
				this.startLocalTimer();
				this.elements.timerBtn.textContent = '\u23F9';
				this.timerState = 'running';
				break;
			case 'running':
				await this.callbacks.stopTimer();
				this.timerElapsedAtStop = this.getElapsedSeconds();
				this.timerState = 'stopped';
				this.stopLocalTimer();
				this.updateTimerDisplay();
				this.elements.timerBtn.textContent = '\u21BA';
				break;
			case 'stopped':
				await this.callbacks.resetTimer();
				this.resetToIdle();
				break;
		}
	}

	handleScaleTimer(seconds: number): void {
		if (this.timerState === 'running' && seconds > 0) {
			this.timerStartedAt = Date.now() - seconds * 1000;
		} else if (this.timerState === 'stopped' && seconds === 0) {
			this.resetToIdle();
		}
	}

	handleScaleButton(event: ButtonEvent): void {
		switch (event.type) {
			case 'timer_start':
				if (this.timerState === 'idle' || this.timerState === 'stopped') {
					this.timerStartedAt = Date.now();
					this.timerElapsedAtStop = 0;
					this.startLocalTimer();
					this.elements.timerBtn.textContent = '\u23F9';
					this.timerState = 'running';
				}
				break;
			case 'timer_stop':
				if (this.timerState === 'running') {
					this.timerElapsedAtStop = this.getElapsedSeconds();
					this.timerState = 'stopped';
					this.timerStartedAt = 0;
					this.stopLocalTimer();
					this.updateTimerDisplay();
					this.elements.timerBtn.textContent = '\u21BA';
				}
				break;
			case 'timer_reset':
				this.resetToIdle();
				break;
		}
	}

	async freeze(): Promise<void> {
		if (this.timerState === 'running') {
			await this.callbacks.stopTimer();
			this.timerElapsedAtStop = this.getElapsedSeconds();
			this.timerState = 'stopped';
			this.stopLocalTimer();
			this.updateTimerDisplay();
			this.elements.timerBtn.textContent = '\u21BA';
		}
	}

	resetToIdle(): void {
		this.timerElapsedAtStop = 0;
		this.timerStartedAt = 0;
		this.stopLocalTimer();
		this.elements.timerEl.textContent = '0:00';
		this.elements.timerBtn.textContent = '\u23FB';
		this.timerState = 'idle';
	}

	destroy(): void {
		this.stopLocalTimer();
	}

	private updateTimerDisplay(): void {
		this.elements.timerEl.textContent = formatTimer(this.getElapsedSeconds());
	}

	private startLocalTimer(): void {
		this.stopLocalTimer();
		this.localTimerInterval = setInterval(() => this.updateTimerDisplay(), 100);
	}

	private stopLocalTimer(): void {
		if (this.localTimerInterval) {
			clearInterval(this.localTimerInterval);
			this.localTimerInterval = null;
		}
	}
}

export function formatTimer(seconds: number): string {
	const min = Math.floor(seconds / 60);
	const sec = Math.floor(seconds % 60);
	return `${min}:${sec.toString().padStart(2, '0')}`;
}
