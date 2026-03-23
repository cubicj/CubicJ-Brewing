import { type FlowStep, STEP_CONFIG, STEP_ORDER } from './StepRenderers';

interface AccordionCallbacks {
	renderStep: (step: FlowStep, container: HTMLElement) => void;
	getStepSummary: (step: FlowStep) => string;
	getCurrentStep: () => string;
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
	private accordionEndListeners = new WeakMap<HTMLElement, (e: TransitionEvent) => void>();

	constructor(
		private contentArea: HTMLElement,
		private callbacks: AccordionCallbacks,
	) {}

	build(): void {
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

				body.empty();
				const inner = body.createDiv({ cls: 'brew-accordion-body-inner' });
				this.callbacks.renderStep(config.step, inner);
				if (!wasOpen) {
					body.classList.add('is-open');
					const h = body.scrollHeight;
					body.style.maxHeight = '0px';
					requestAnimationFrame(() => {
						body.style.maxHeight = h + 'px';
					});
					const ref = body;
					const onOpenEnd = (e: TransitionEvent) => {
						if (e.propertyName === 'max-height') {
							ref.style.maxHeight = 'none';
							ref.removeEventListener('transitionend', onOpenEnd);
							this.accordionEndListeners.delete(ref);
						}
					};
					this.accordionEndListeners.set(body, onOpenEnd);
					body.addEventListener('transitionend', onOpenEnd);
				} else {
					body.style.maxHeight = 'none';
				}
			} else {
				if (wasOpen) {
					const prevOnEnd = this.accordionEndListeners.get(body);
					if (prevOnEnd) {
						body.removeEventListener('transitionend', prevOnEnd);
					}

					body.style.maxHeight = body.scrollHeight + 'px';
					void body.offsetHeight;
					requestAnimationFrame(() => {
						body.classList.remove('is-open');
						body.style.maxHeight = '0px';
					});
					const ref = body;
					const onEnd = (e: TransitionEvent) => {
						if (e.propertyName === 'max-height') {
							ref.empty();
							ref.style.maxHeight = '';
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
		body.style.height = before + 'px';
		void body.offsetHeight;
		requestAnimationFrame(() => {
			body.style.height = after + 'px';
			const onEnd = (e: TransitionEvent) => {
				if (e.propertyName !== 'height') return;
				body.style.height = '';
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

	private renderCheckIcon(container: HTMLElement): void {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '14');
		svg.setAttribute('height', '14');
		svg.setAttribute('viewBox', '0 0 14 14');
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
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
