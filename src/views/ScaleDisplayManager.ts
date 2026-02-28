import type { AcaiaState } from '../acaia/types';

export interface ScaleDataElements {
	timerEl: HTMLElement;
	timerBtn: HTMLButtonElement;
	weightEl: HTMLElement;
}

interface ScaleDisplayCallbacks {
	onTimerClick: () => void;
	onTare: () => void;
	isConnected: () => boolean;
	getReconnectAttempt: () => number;
}

export class ScaleDisplayManager {
	private scaleHeaderEl!: HTMLElement;
	private scaleDotEl!: HTMLElement;
	private scaleStatusEl!: HTMLElement;
	private scaleBatteryEl!: HTMLElement;
	private scaleDataEl!: HTMLElement;
	private weightEl!: HTMLElement;
	private timerEl!: HTMLElement;
	private tareBtn!: HTMLButtonElement;
	private timerBtn!: HTMLButtonElement;

	constructor(
		private connectBtn: HTMLButtonElement,
		private callbacks: ScaleDisplayCallbacks,
	) {}

	buildHeader(container: HTMLElement): void {
		this.scaleHeaderEl = container.createDiv({ cls: 'brewing-scale-header' });

		const infoRow = this.scaleHeaderEl.createDiv({ cls: 'brewing-scale-info' });
		this.scaleDotEl = infoRow.createSpan({ cls: 'brewing-scale-dot' });
		this.scaleStatusEl = infoRow.createSpan({ cls: 'brewing-scale-status' });
		this.scaleBatteryEl = infoRow.createSpan({ cls: 'brewing-scale-battery' });
	}

	buildData(container: HTMLElement): ScaleDataElements {
		this.scaleDataEl = container;

		const dataSection = container.createDiv({ cls: 'brewing-data' });
		this.timerEl = dataSection.createDiv({ cls: 'brewing-timer', text: '0:00' });
		this.weightEl = dataSection.createDiv({ cls: 'brewing-weight', text: '--' });

		const controls = container.createDiv({ cls: 'brewing-controls brewing-scale-controls' });
		this.timerBtn = controls.createEl('button', { text: '\u23FB', cls: 'brewing-ctrl-btn brewing-btn-icon' });
		this.timerBtn.addEventListener('click', () => this.callbacks.onTimerClick());

		this.tareBtn = controls.createEl('button', { text: 'T', cls: 'brewing-ctrl-btn brewing-btn-icon' });
		this.tareBtn.addEventListener('click', () => this.callbacks.onTare());

		const connected = this.callbacks.isConnected();
		this.scaleDataEl.style.display = connected ? '' : 'none';
		this.tareBtn.disabled = !connected;
		this.timerBtn.disabled = !connected;
		if (connected) {
			this.weightEl.textContent = '0.0';
		}

		return { timerEl: this.timerEl, timerBtn: this.timerBtn, weightEl: this.weightEl };
	}

	updateHeader(state: AcaiaState): void {
		this.scaleDotEl.className = 'brewing-scale-dot';
		if (state === 'connected') this.scaleDotEl.addClass('is-connected');
		else if (state === 'disconnected') this.scaleDotEl.addClass('is-disconnected');
		else if (state === 'scanning' || state === 'connecting' || state === 'reconnecting') this.scaleDotEl.addClass('is-busy');

		this.scaleStatusEl.removeClass('brewing-error');

		switch (state) {
			case 'idle':
				this.scaleStatusEl.textContent = '';
				this.connectBtn.textContent = '저울 연결';
				this.scaleBatteryEl.textContent = '';
				break;
			case 'scanning':
				this.scaleStatusEl.textContent = '스캔 중';
				this.connectBtn.textContent = '취소';
				this.scaleBatteryEl.textContent = '';
				break;
			case 'connecting':
				this.scaleStatusEl.textContent = '연결 중';
				this.connectBtn.textContent = '취소';
				this.scaleBatteryEl.textContent = '';
				break;
			case 'connected':
				this.scaleStatusEl.textContent = '연결됨';
				this.connectBtn.textContent = '해제';
				break;
			case 'disconnected':
				this.scaleStatusEl.textContent = '연결 끊김';
				this.connectBtn.textContent = '재연결';
				this.scaleBatteryEl.textContent = '';
				break;
			case 'reconnecting': {
				const attempt = this.callbacks.getReconnectAttempt();
				this.scaleStatusEl.textContent = `재연결 중 (${attempt}/3)`;
				this.connectBtn.textContent = '취소';
				this.scaleBatteryEl.textContent = '';
				break;
			}
		}

		this.connectBtn.disabled = false;
	}

	updateControls(state: AcaiaState, resetTimer: () => void): void {
		const connected = state === 'connected';
		this.scaleDataEl.style.display = connected ? '' : 'none';

		if (this.tareBtn) this.tareBtn.disabled = !connected;
		if (this.timerBtn) this.timerBtn.disabled = !connected;

		if (state === 'connected') {
			this.weightEl?.removeClass('brewing-dimmed');
			this.timerEl?.removeClass('brewing-dimmed');
		}

		if (state === 'disconnected' || state === 'reconnecting') {
			this.weightEl?.addClass('brewing-dimmed');
			this.timerEl?.addClass('brewing-dimmed');
			if (state === 'disconnected') {
				resetTimer();
			}
			this.scaleDataEl.style.display = 'none';
		}

		if (state === 'idle') {
			if (this.weightEl) this.weightEl.textContent = '--';
			if (this.timerEl) this.timerEl.textContent = '0:00';
			this.weightEl?.removeClass('brewing-dimmed');
			this.timerEl?.removeClass('brewing-dimmed');
			resetTimer();
			this.scaleDataEl.style.display = 'none';
		}
	}

	updateWeight(grams: number): void {
		this.weightEl.textContent = grams.toFixed(1);
	}

	updateBattery(percent: number): void {
		this.scaleBatteryEl.textContent = `Battery: ${percent}%`;
	}

	showError(message: string): void {
		this.scaleStatusEl.textContent = message;
		this.scaleStatusEl.addClass('brewing-error');
		setTimeout(() => this.scaleStatusEl.removeClass('brewing-error'), 3000);
	}

	getWeightText(): string {
		return this.weightEl.textContent || '0';
	}
}
