import type { PanelMode } from '../brew/BrewFlowState';
import { type FlowStep, STEP_CONFIG, STEP_ORDER } from './StepRenderers';

interface AccordionCallbacks {
	renderStep: (step: FlowStep, container: HTMLElement, registerCleanup: (fn: () => void) => void) => void;
	getStepSummary: (step: FlowStep) => string;
	getPanelMode: (step: FlowStep) => PanelMode;
}

export class AccordionManager {
	private panels: Array<{
		panel: HTMLElement;
		header: HTMLElement;
		indicator: HTMLElement;
		titleArea: HTMLElement;
		body: HTMLElement;
	}> = [];
	private expandedSteps = new Set<number>();
	private panelCleanups = new Map<number, Array<() => void>>();
	private accordionEndListeners = new WeakMap<HTMLElement, (e: TransitionEvent) => void>();
	private scrollAnimationFrame: number | null = null;

	constructor(
		private contentArea: HTMLElement,
		private callbacks: AccordionCallbacks,
	) {}

	build(): void {
		this.cleanupAllPanels();
		this.contentArea.empty();
		this.panels = [];
		this.expandedSteps.clear();

		for (let i = 0; i < STEP_CONFIG.length; i++) {
			const panel = this.contentArea.createDiv({ cls: 'brew-accordion-panel' });

			const header = panel.createDiv({ cls: 'brew-accordion-header' });
			header.addEventListener('click', () => this.togglePanel(i));

			const indicator = header.createDiv({ cls: 'brew-accordion-indicator' });
			indicator.createSpan({ text: String(i + 1) });

			const titleArea = header.createDiv({ cls: 'brew-accordion-title-area' });
			titleArea.createSpan({ cls: 'brew-accordion-title', text: STEP_CONFIG[i].label() });

			const body = panel.createDiv({ cls: 'brew-accordion-body' });

			this.panels.push({ panel, header, indicator, titleArea, body });
		}
	}

	togglePanel(index: number): void {
		if (this.callbacks.getPanelMode(STEP_CONFIG[index].step) === 'disabled') return;
		if (this.expandedSteps.has(index)) {
			this.expandedSteps.delete(index);
		} else {
			this.expandedSteps.add(index);
		}
		this.update();
	}

	updateSummaries(): void {
		for (let i = 0; i < STEP_CONFIG.length; i++) {
			const config = STEP_CONFIG[i];
			const { panel, header, indicator, titleArea } = this.panels[i];
			const hasData = !!this.callbacks.getStepSummary(config.step);
			const isExpanded = this.expandedSteps.has(i);

			panel.className = 'brew-accordion-panel';
			header.className = 'brew-accordion-header';
			if (this.callbacks.getPanelMode(config.step) === 'disabled') header.addClass('is-disabled');

			indicator.empty();
			if (hasData) {
				indicator.addClass('is-done');
				this.renderCheckIcon(indicator);
			} else {
				indicator.removeClass('is-done');
				indicator.createSpan({ text: String(i + 1) });
			}

			const existingSummary = titleArea.querySelector('.brew-accordion-summary');
			if (existingSummary) existingSummary.remove();

			if (hasData && !isExpanded) {
				const summary = this.callbacks.getStepSummary(config.step);
				if (summary) {
					titleArea.createSpan({ cls: 'brew-accordion-summary', text: summary });
				}
			}
		}
	}

	update(): void {
		for (let i = 0; i < STEP_CONFIG.length; i++) {
			if (this.callbacks.getPanelMode(STEP_CONFIG[i].step) === 'disabled') this.expandedSteps.delete(i);
		}
		this.updateSummaries();
		for (let i = 0; i < STEP_CONFIG.length; i++) {
			const config = STEP_CONFIG[i];
			const { body } = this.panels[i];
			const isExpanded = this.expandedSteps.has(i);
			const wasOpen = body.classList.contains('is-open');

			if (isExpanded) {
				const prevOnEnd = this.accordionEndListeners.get(body);
				if (prevOnEnd) {
					body.removeEventListener('transitionend', prevOnEnd);
					this.accordionEndListeners.delete(body);
				}

				this.cleanupPanel(i);
				body.empty();
				const inner = body.createDiv({ cls: 'brew-accordion-body-inner' });
				if (this.callbacks.getPanelMode(config.step) === 'readonly') {
					inner.addClass('is-readonly');
					inner.setAttribute('inert', '');
				}
				const cleanups: Array<() => void> = [];
				this.panelCleanups.set(i, cleanups);
				this.callbacks.renderStep(config.step, inner, (fn) => cleanups.push(fn));
				if (!wasOpen) {
					body.classList.add('is-open');
					const h = body.scrollHeight;
					body.setCssStyles({ maxHeight: '0px' });
					window.requestAnimationFrame(() => {
						body.setCssStyles({ maxHeight: h + 'px' });
					});
					const ref = body;
					const onOpenEnd = (e: TransitionEvent) => {
						if (e.propertyName === 'max-height') {
							ref.setCssStyles({ maxHeight: 'none' });
							ref.removeEventListener('transitionend', onOpenEnd);
							this.accordionEndListeners.delete(ref);
						}
					};
					this.accordionEndListeners.set(body, onOpenEnd);
					body.addEventListener('transitionend', onOpenEnd);
				} else {
					body.setCssStyles({ maxHeight: 'none' });
				}
			} else {
				if (wasOpen) {
					const prevOnEnd = this.accordionEndListeners.get(body);
					if (prevOnEnd) {
						body.removeEventListener('transitionend', prevOnEnd);
					}

					body.setCssStyles({ maxHeight: body.scrollHeight + 'px' });
					void body.offsetHeight;
					window.requestAnimationFrame(() => {
						body.classList.remove('is-open');
						body.setCssStyles({ maxHeight: '0px' });
					});
					const ref = body;
					const onEnd = (e: TransitionEvent) => {
						if (e.propertyName === 'max-height') {
							this.cleanupPanel(i);
							ref.empty();
							ref.setCssStyles({ maxHeight: '' });
							ref.removeEventListener('transitionend', onEnd);
							this.accordionEndListeners.delete(ref);
						}
					};
					this.accordionEndListeners.set(body, onEnd);
					ref.addEventListener('transitionend', onEnd);
				}
			}
		}
	}

	clearExpandedSteps(): void {
		this.expandedSteps.clear();
	}

	focusStep(step: FlowStep): void {
		this.expandedSteps.clear();
		this.expandedSteps.add(STEP_ORDER.indexOf(step));
	}

	expandStep(step: FlowStep): void {
		this.expandedSteps.add(STEP_ORDER.indexOf(step));
	}

	scrollStepToTop(step: FlowStep): void {
		const idx = STEP_ORDER.indexOf(step);
		const panel = this.panels[idx]?.panel;
		if (!panel) return;
		if (this.scrollAnimationFrame !== null) {
			window.cancelAnimationFrame(this.scrollAnimationFrame);
			this.scrollAnimationFrame = null;
		}
		const top =
			panel.getBoundingClientRect().top - this.contentArea.getBoundingClientRect().top + this.contentArea.scrollTop;
		const maxScrollTop = Math.max(0, this.contentArea.scrollHeight - this.contentArea.clientHeight);
		const target = Math.min(Math.max(top, 0), maxScrollTop);
		const start = this.contentArea.scrollTop;
		const distance = target - start;
		if (Math.abs(distance) < 1) {
			this.contentArea.scrollTop = target;
			return;
		}

		let startTime: number | null = null;
		const animate = (timestamp: number) => {
			if (startTime === null) startTime = timestamp;
			const progress = Math.min((timestamp - startTime) / 500, 1);
			if (progress === 1) {
				this.contentArea.scrollTop = target;
				this.scrollAnimationFrame = null;
				return;
			}
			const eased = 1 - Math.pow(1 - progress, 3);
			this.contentArea.scrollTop = start + distance * eased;
			this.scrollAnimationFrame = window.requestAnimationFrame(animate);
		};

		this.scrollAnimationFrame = window.requestAnimationFrame(animate);
	}

	animateContentChange(step: FlowStep, mutation: () => void): void {
		const idx = STEP_ORDER.indexOf(step);
		const p = this.panels[idx];
		if (
			!p ||
			!this.expandedSteps.has(idx) ||
			!p.body.classList.contains('is-open') ||
			p.body.style.maxHeight !== 'none'
		) {
			mutation();
			return;
		}
		const { body } = p;
		const prev = this.accordionEndListeners.get(body);
		if (prev) {
			body.removeEventListener('transitionend', prev);
			this.accordionEndListeners.delete(body);
		}
		const before = body.scrollHeight;
		mutation();
		const after = body.scrollHeight;
		if (before === after) return;
		body.setCssProps({ height: before + 'px' });
		void body.offsetHeight;
		window.requestAnimationFrame(() => {
			body.setCssProps({ height: after + 'px' });
			const onEnd = (e: TransitionEvent) => {
				if (e.propertyName !== 'height') return;
				body.setCssProps({ height: '' });
				body.removeEventListener('transitionend', onEnd);
				this.accordionEndListeners.delete(body);
			};
			this.accordionEndListeners.set(body, onEnd);
			body.addEventListener('transitionend', onEnd);
		});
	}

	isBuilt(): boolean {
		return this.panels.length > 0;
	}

	getStepPanel(step: FlowStep): HTMLElement | null {
		const idx = STEP_ORDER.indexOf(step);
		return idx >= 0 && idx < this.panels.length ? this.panels[idx].body : null;
	}

	destroy(): void {
		this.cleanupAllPanels();
	}

	private cleanupPanel(index: number): void {
		const cleanups = this.panelCleanups.get(index);
		if (!cleanups) return;
		this.panelCleanups.delete(index);
		for (const fn of cleanups) fn();
	}

	private cleanupAllPanels(): void {
		for (const index of [...this.panelCleanups.keys()]) {
			this.cleanupPanel(index);
		}
	}

	private renderCheckIcon(container: HTMLElement): void {
		const svg = createSvg('svg');
		svg.setAttribute('width', '14');
		svg.setAttribute('height', '14');
		svg.setAttribute('viewBox', '0 0 14 14');
		const path = createSvg('path');
		path.setAttribute('d', 'M3 7l3 3 5-5');
		path.setAttribute('fill', 'none');
		path.setAttribute('stroke', 'currentColor');
		path.setAttribute('stroke-width', '2');
		path.setAttribute('stroke-linecap', 'round');
		path.setAttribute('stroke-linejoin', 'round');
		svg.appendChild(path);
		container.appendChild(svg);
	}
}
