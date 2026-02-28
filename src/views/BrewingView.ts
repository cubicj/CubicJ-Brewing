import { ItemView, WorkspaceLeaf } from 'obsidian';
import type CubicJBrewingPlugin from '../main';
import type { AcaiaState } from '../acaia/types';
import { BrewFlowState } from '../brew/BrewFlowState';
import type { BrewMethod, BrewTemp, EspressoDrink } from '../brew/types';

export const VIEW_TYPE_BREWING = 'cubicj-brewing';

const METHOD_LABELS: Record<BrewMethod, string> = { brewing: '브루잉', espresso: '에스프레소' };
const TEMP_LABELS: Record<BrewTemp, string> = { hot: 'Hot', iced: 'Ice' };
const DRINK_LABELS: Record<EspressoDrink, string> = { shot: '샷', americano: '아메리카노', latte: '라떼' };

type FlowStep = 'method' | 'bean' | 'configure' | 'brewing' | 'saving';

const STEP_CONFIG: Array<{ step: FlowStep; label: string }> = [
	{ step: 'method', label: '추출 방식' },
	{ step: 'bean', label: '원두 선택' },
	{ step: 'configure', label: '추출 변수 설정' },
	{ step: 'brewing', label: '브루잉' },
	{ step: 'saving', label: '메모' },
];

export class BrewingView extends ItemView {
	private plugin: CubicJBrewingPlugin;
	private listeners: Array<{ event: string; fn: (...args: any[]) => void }> = [];
	private flowState = new BrewFlowState();

	private scaleHeaderEl!: HTMLElement;
	private scaleDotEl!: HTMLElement;
	private scaleStatusEl!: HTMLElement;
	private scaleBatteryEl!: HTMLElement;
	private scaleConnectBtn!: HTMLButtonElement;
	private scaleDataEl!: HTMLElement;
	private contentArea!: HTMLElement;
	private accordionPanels: Array<{ panel: HTMLElement; header: HTMLElement; indicator: HTMLElement; titleArea: HTMLElement; body: HTMLElement }> = [];
	private expandedSteps = new Set<number>();

	private weightEl!: HTMLElement;
	private timerEl!: HTMLElement;
	private tareBtn!: HTMLButtonElement;
	private timerBtn!: HTMLButtonElement;
	private timerState: 'idle' | 'running' | 'stopped' = 'idle';
	private timerStartedAt = 0;
	private timerElapsedAtStop = 0;
	private localTimerInterval: ReturnType<typeof setInterval> | null = null;

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

		this.buildScaleHeader(container);
		this.scaleDataEl = container.createDiv({ cls: 'brewing-scale-data' });
		this.buildScaleData();
		this.contentArea = container.createDiv({ cls: 'brewing-content-area' });
		this.bindServiceEvents();
		this.updateScaleHeader(this.plugin.acaiaService.state);
		this.renderContent();
	}

	async onClose(): Promise<void> {
		this.stopLocalTimer();
		const service = this.plugin.acaiaService;
		for (const { event, fn } of this.listeners) {
			service.removeListener(event, fn);
		}
		this.listeners = [];
	}

	private buildScaleHeader(container: HTMLElement): void {
		this.scaleHeaderEl = container.createDiv({ cls: 'brewing-scale-header' });

		const infoRow = this.scaleHeaderEl.createDiv({ cls: 'brewing-scale-info' });
		this.scaleDotEl = infoRow.createSpan({ cls: 'brewing-scale-dot' });
		this.scaleStatusEl = infoRow.createSpan({ cls: 'brewing-scale-status' });
		this.scaleBatteryEl = infoRow.createSpan({ cls: 'brewing-scale-battery' });

		this.scaleConnectBtn = this.scaleHeaderEl.createEl('button', {
			cls: 'brewing-scale-connect-btn',
		});
		this.scaleConnectBtn.addEventListener('click', () => this.handleConnectClick());
	}

	private buildScaleData(): void {
		const dataSection = this.scaleDataEl.createDiv({ cls: 'brewing-data' });
		this.timerEl = dataSection.createDiv({ cls: 'brewing-timer', text: '0:00' });
		this.weightEl = dataSection.createDiv({ cls: 'brewing-weight', text: '--' });

		const controls = this.scaleDataEl.createDiv({ cls: 'brewing-controls brewing-scale-controls' });
		this.timerBtn = controls.createEl('button', { text: '\u23FB', cls: 'brewing-ctrl-btn brewing-btn-icon' });
		this.timerState = 'idle';
		this.timerBtn.addEventListener('click', () => this.handleTimerClick());

		this.tareBtn = controls.createEl('button', { text: 'T', cls: 'brewing-ctrl-btn brewing-btn-icon' });
		this.tareBtn.addEventListener('click', () => this.plugin.acaiaService.tare());

		const connected = this.plugin.acaiaService.state === 'connected';
		this.scaleDataEl.style.display = connected ? '' : 'none';
		this.tareBtn.disabled = !connected;
		this.timerBtn.disabled = !connected;
		if (connected) {
			this.weightEl.textContent = '0.0';
		}
	}

	private getStepSummary(step: FlowStep): string {
		const sel = this.flowState.selection;
		switch (step) {
			case 'method': {
				if (!sel.method) return '';
				const parts = [METHOD_LABELS[sel.method], TEMP_LABELS[sel.temp!]];
				if (sel.drink) parts.push(DRINK_LABELS[sel.drink]);
				return parts.join(' · ');
			}
			case 'bean':
				return sel.bean ? sel.bean.name : '';
			case 'configure': {
				if (sel.grindSize == null) return '';
				const parts = [`${sel.grindSize}`, `${sel.dose}g`];
				if (sel.method === 'brewing' && sel.waterTemp) parts.push(`${sel.waterTemp}°`);
				if (sel.method === 'brewing' && sel.filter) parts.push(sel.filter);
				if (sel.method === 'espresso' && sel.basket) parts.push(sel.basket);
				return parts.join(' · ');
			}
			case 'brewing': {
				const parts: string[] = [];
				if (sel.time) parts.push(this.formatTimer(sel.time));
				if (sel.yield) parts.push(`${sel.yield}g`);
				return parts.join(' / ');
			}
			case 'saving':
				return '';
		}
	}

	private buildAccordionPanels(): void {
		this.contentArea.empty();
		this.accordionPanels = [];
		this.expandedSteps.clear();

		for (let i = 0; i < STEP_CONFIG.length; i++) {
			const panel = this.contentArea.createDiv({ cls: 'brew-accordion-panel' });

			const header = panel.createDiv({ cls: 'brew-accordion-header' });
			header.addEventListener('click', () => this.togglePanel(i));

			const indicator = header.createDiv({ cls: 'brew-accordion-indicator' });
			indicator.createSpan({ text: String(i + 1) });

			const titleArea = header.createDiv({ cls: 'brew-accordion-title-area' });
			titleArea.createSpan({ cls: 'brew-accordion-title', text: STEP_CONFIG[i].label });

			const body = panel.createDiv({ cls: 'brew-accordion-body' });

			this.accordionPanels.push({ panel, header, indicator, titleArea, body });
		}
	}

	private togglePanel(index: number): void {
		if (this.expandedSteps.has(index)) {
			this.expandedSteps.delete(index);
		} else {
			this.expandedSteps.add(index);
		}
		this.updateAccordion();
	}

	private updateAccordion(): void {
		const currentStep = this.flowState.step;
		const stepOrder: FlowStep[] = ['method', 'bean', 'configure', 'brewing', 'saving'];
		const currentIdx = stepOrder.indexOf(currentStep as FlowStep);

		for (let i = 0; i < STEP_CONFIG.length; i++) {
			const config = STEP_CONFIG[i];
			const { panel, header, indicator, titleArea, body } = this.accordionPanels[i];
			const idx = stepOrder.indexOf(config.step);
			const hasData = !!this.getStepSummary(config.step);
			const isExpanded = this.expandedSteps.has(i);
			const wasOpen = body.classList.contains('is-open');

			panel.className = 'brew-accordion-panel';
			header.className = 'brew-accordion-header';

			indicator.empty();
			if (hasData) {
				indicator.addClass('is-done');
				indicator.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 7l3 3 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
			} else {
				indicator.removeClass('is-done');
				indicator.createSpan({ text: String(i + 1) });
			}

			const existingSummary = titleArea.querySelector('.brew-accordion-summary');
			if (existingSummary) existingSummary.remove();

			if (hasData && !isExpanded) {
				const summary = this.getStepSummary(config.step);
				if (summary) {
					titleArea.createSpan({ cls: 'brew-accordion-summary', text: summary });
				}
			}

			if (isExpanded) {
				body.empty();
				const inner = body.createDiv({ cls: 'brew-accordion-body-inner' });
				switch (config.step) {
					case 'method': this.renderMethod(inner); break;
					case 'bean': this.renderBean(inner); break;
					case 'configure': this.renderConfigure(inner); break;
					case 'brewing': this.renderBrewing(inner); break;
					case 'saving': this.renderSaving(inner); break;
				}
				if (!wasOpen) {
					body.classList.add('is-open');
					const h = body.scrollHeight;
					body.style.maxHeight = '0px';
					requestAnimationFrame(() => {
						body.style.maxHeight = h + 'px';
					});
				} else {
					body.style.maxHeight = body.scrollHeight + 'px';
				}
			} else {
				if (wasOpen) {
					body.style.maxHeight = body.scrollHeight + 'px';
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
						}
					};
					ref.addEventListener('transitionend', onEnd);
				}
			}
		}
	}

	private renderContent(): void {
		if (this.flowState.step === 'idle') {
			this.flowState.startBrew();
		}

		const isInitial = this.accordionPanels.length === 0;
		if (isInitial) {
			this.buildAccordionPanels();
		} else {
			const stepOrder: FlowStep[] = ['method', 'bean', 'configure', 'brewing', 'saving'];
			const currentIdx = stepOrder.indexOf(this.flowState.step as FlowStep);
			this.expandedSteps.clear();
			this.expandedSteps.add(currentIdx);
		}

		this.updateAccordion();
	}

	

	private renderMethod(container: HTMLElement): void {
		container.addClass('brew-flow-method');

		const sel = this.flowState.selection;
		let selectedMethod: BrewMethod | null = sel.method ?? null;
		let selectedTemp: BrewTemp | null = sel.temp ?? null;
		let selectedDrink: EspressoDrink | null = sel.drink ?? null;

		const syncSelection = () => {
			sel.method = selectedMethod ?? undefined;
			sel.temp = selectedTemp ?? undefined;
			sel.drink = selectedDrink ?? undefined;
		};

		const methodGroup = container.createDiv({ cls: 'brew-flow-toggle-group' });
		const methods: BrewMethod[] = ['brewing', 'espresso'];
		const methodBtns = methods.map(m => {
			const btn = methodGroup.createDiv({ cls: 'brew-flow-toggle', text: METHOD_LABELS[m] });
			if (m === selectedMethod) btn.addClass('is-active');
			btn.addEventListener('click', () => {
				if (selectedMethod === m) {
					selectedMethod = null;
					btn.removeClass('is-active');
				} else {
					selectedMethod = m;
					methodBtns.forEach(b => b.removeClass('is-active'));
					btn.addClass('is-active');
				}
				drinkRow.style.display = selectedMethod === 'espresso' ? '' : 'none';
				if (selectedMethod !== 'espresso') selectedDrink = null;
				syncSelection();
				tryAdvance();
			});
			return btn;
		});

		container.createEl('h4', { text: '온도' });
		const tempGroup = container.createDiv({ cls: 'brew-flow-toggle-group' });
		const temps: BrewTemp[] = ['hot', 'iced'];
		const tempBtns = temps.map(t => {
			const btn = tempGroup.createDiv({ cls: 'brew-flow-toggle', text: TEMP_LABELS[t] });
			if (t === selectedTemp) btn.addClass('is-active');
			btn.addEventListener('click', () => {
				if (selectedTemp === t) {
					selectedTemp = null;
					btn.removeClass('is-active');
				} else {
					selectedTemp = t;
					tempBtns.forEach(b => b.removeClass('is-active'));
					btn.addClass('is-active');
				}
				syncSelection();
				tryAdvance();
			});
			return btn;
		});

		const drinkRow = container.createDiv({ cls: 'brew-flow-drink-row' });
		drinkRow.style.display = selectedMethod === 'espresso' ? '' : 'none';
		drinkRow.createEl('h4', { text: '음료' });
		const drinkGroup = drinkRow.createDiv({ cls: 'brew-flow-toggle-group' });
		const drinks: EspressoDrink[] = ['shot', 'americano', 'latte'];
		const drinkBtns = drinks.map(d => {
			const btn = drinkGroup.createDiv({ cls: 'brew-flow-toggle', text: DRINK_LABELS[d] });
			if (d === selectedDrink) btn.addClass('is-active');
			btn.addEventListener('click', () => {
				if (selectedDrink === d) {
					selectedDrink = null;
					btn.removeClass('is-active');
				} else {
					selectedDrink = d;
					drinkBtns.forEach(b => b.removeClass('is-active'));
					btn.addClass('is-active');
				}
				syncSelection();
				tryAdvance();
			});
			return btn;
		});

		const tryAdvance = () => {
			if (!selectedMethod || !selectedTemp) return;
			if (selectedMethod === 'espresso' && !selectedDrink) return;
			setTimeout(() => {
				this.flowState.selectMethod(selectedMethod!, selectedTemp!, selectedDrink ?? undefined);
				this.renderContent();
			}, 150);
		};
	}

	private async renderBean(container: HTMLElement): Promise<void> {
		container.addClass('brew-flow-bean');

		const beans = this.plugin.vaultData.getActiveBeans();

		if (beans.length === 0) {
			container.createDiv({ cls: 'brew-flow-empty', text: 'type: bean frontmatter가 있는 노트가 없어요' });
			return;
		}

		for (const bean of beans) {
			const item = container.createDiv({ cls: 'brew-flow-bean-item' });
			item.createDiv({ text: bean.name });

			const days = this.plugin.vaultData.getDaysSinceRoast(bean);
			const metaParts = [bean.roaster];
			if (days !== null) metaParts.push(`D+${days}`);
			item.createDiv({ cls: 'brew-flow-bean-meta', text: metaParts.join(' · ') });

			item.addEventListener('click', async () => {
				const lastRecord = await this.plugin.recordService.getLastRecord(
					bean.name,
					this.flowState.selection.method!
				);
				this.flowState.selectBean(bean, lastRecord);
				this.renderContent();
			});
		}
	}

	private renderConfigure(container: HTMLElement): void {
		container.addClass('brew-flow-configure');
		const sel = this.flowState.selection;
		const isBrewing = sel.method === 'brewing';

		if (sel.lastRecord) {
			const card = container.createDiv({ cls: 'brew-flow-last-record' });
			card.createDiv({ cls: 'brew-flow-last-record-title', text: '이전 기록' });
			const r = sel.lastRecord;
			const parts = [`분쇄도 ${r.grindSize}`, `${r.dose}g`];
			if (r.method === 'brewing') parts.push(`${r.waterTemp}°`, r.filter);
			if (r.method === 'espresso') parts.push(r.basket);
			if (r.time) {
				const min = Math.floor(r.time / 60);
				const sec = Math.floor(r.time % 60);
				parts.push(`${min}:${sec.toString().padStart(2, '0')}`);
			}
			if (r.yield) parts.push(`${r.yield}g`);
			card.createDiv({ cls: 'brew-flow-last-record-meta', text: parts.join(' · ') });
		}

		const form = container.createDiv({ cls: 'brew-flow-form' });

		const grindInput = this.createFormField(form, '분쇄도', 'number', String(sel.grindSize ?? ''));
		const doseInput = this.createFormField(form, '원두량 (g)', 'number', String(sel.dose ?? ''));

		let waterTempInput: HTMLInputElement | null = null;
		let filterSelect: HTMLSelectElement | null = null;
		let basketSelect: HTMLSelectElement | null = null;

		if (isBrewing) {
			waterTempInput = this.createFormField(form, '수온 (°C)', 'number', String(sel.waterTemp ?? ''));

			const filterGroup = form.createDiv();
			filterGroup.createEl('label', { text: '필터' });
			filterSelect = filterGroup.createEl('select');
			for (const f of this.plugin.settings.filters) {
				filterSelect.createEl('option', { text: f, value: f });
			}
			if (sel.filter) filterSelect.value = sel.filter;
		} else {
			const basketGroup = form.createDiv();
			basketGroup.createEl('label', { text: '바스켓' });
			basketSelect = basketGroup.createEl('select');
			for (const b of this.plugin.settings.baskets) {
				basketSelect.createEl('option', { text: b, value: b });
			}
			if (sel.basket) basketSelect.value = sel.basket;
		}

		const recipes = this.plugin.vaultData.getAllRecipes();
		if (recipes.length > 0) {
			const recipeGroup = container.createDiv({ cls: 'brew-flow-recipe-select' });
			recipeGroup.createEl('label', { text: '레시피' });
			const recipeSelect = recipeGroup.createEl('select');
			recipeSelect.createEl('option', { text: '선택 안 함', value: '' });
			for (const r of recipes) {
				recipeSelect.createEl('option', { text: r.name, value: r.path });
			}
			recipeSelect.addEventListener('change', () => {
				const recipe = recipes.find(r => r.path === recipeSelect.value);
				if (recipe) this.flowState.selectRecipe(recipe);
			});
		}

		const startBtn = container.createEl('button', { text: '브루잉 시작', cls: 'brew-flow-start-btn' });
		startBtn.addEventListener('click', () => {
			const vars: Record<string, any> = {
				grindSize: parseFloat(grindInput.value) || 0,
				dose: parseFloat(doseInput.value) || 0,
			};
			if (isBrewing) {
				vars.waterTemp = parseFloat(waterTempInput!.value) || 0;
				vars.filter = filterSelect!.value;
			} else {
				vars.basket = basketSelect!.value;
			}
			this.flowState.updateVariables(vars);
			this.flowState.startBrewing();
			this.renderContent();
		});
	}

	private renderBrewing(container: HTMLElement): void {
		container.addClass('brew-flow-active-brew');
		const scaleConnected = this.plugin.acaiaService.state === 'connected';

		if (!scaleConnected) {
			container.createDiv({ cls: 'brew-flow-notice', text: '저울 미연결 — 수동 입력 가능' });
		}

		const recipe = this.flowState.selection.recipe;
		if (recipe && recipe.steps.length > 0) {
			const stepsEl = container.createDiv({ cls: 'brew-flow-recipe-steps' });
			stepsEl.createEl('h4', { text: recipe.name });
			for (const step of recipe.steps) {
				const stepEl = stepsEl.createDiv({ cls: 'brew-flow-recipe-step' });
				const parts = [step.time];
				if (step.target) parts.push(`→ ${step.target}g`);
				if (step.note) parts.push(step.note);
				stepEl.textContent = parts.join(' ');
			}
		}

		const controls = container.createDiv({ cls: 'brewing-controls' });

		const stopBtn = controls.createEl('button', { text: '완료', cls: 'brewing-ctrl-btn brew-flow-stop-btn' });
		stopBtn.addEventListener('click', () => {
			if (scaleConnected) {
				this.stopLocalTimer();
				const totalSeconds = this.getElapsedSeconds();
				const weightText = this.weightEl.textContent || '0';
				const yieldGrams = parseFloat(weightText) || undefined;
				this.flowState.finishBrewing(totalSeconds || undefined, yieldGrams);
			} else {
				this.flowState.finishBrewing(undefined, undefined);
			}
			this.renderContent();
		});
	}

	private renderSaving(container: HTMLElement): void {
		container.addClass('brew-flow-saving');
		const sel = this.flowState.selection;

		const resultEl = container.createDiv({ cls: 'brew-flow-result' });
		const parts: string[] = [];
		if (sel.time) {
			const min = Math.floor(sel.time / 60);
			const sec = Math.floor(sel.time % 60);
			parts.push(`${min}:${sec.toString().padStart(2, '0')}`);
		}
		if (sel.yield) parts.push(`${sel.yield}g`);
		resultEl.textContent = parts.length > 0 ? parts.join(' / ') : '수동 기록';

		if (!sel.time) {
			const manualForm = container.createDiv({ cls: 'brew-flow-form' });
			const timeInput = this.createFormField(manualForm, '시간 (초)', 'number', '');
			const yieldInput = this.createFormField(manualForm, '추출량 (g)', 'number', '');
			timeInput.addEventListener('change', () => {
				this.flowState.updateVariables({ time: parseFloat(timeInput.value) || undefined });
			});
			yieldInput.addEventListener('change', () => {
				this.flowState.updateVariables({ yield: parseFloat(yieldInput.value) || undefined });
			});
		}

		container.createEl('h4', { text: '마시는 사람', cls: 'brew-flow-section-label' });
		const drinkerGroup = container.createDiv({ cls: 'brew-flow-toggle-group' });
		let selectedDrinker = this.plugin.settings.defaultDrinker;
		const drinkerBtns = this.plugin.settings.drinkers.map(d => {
			const btn = drinkerGroup.createDiv({ cls: 'brew-flow-toggle', text: d });
			if (d === selectedDrinker) btn.addClass('is-active');
			btn.addEventListener('click', () => {
				selectedDrinker = d;
				drinkerBtns.forEach(b => b.removeClass('is-active'));
				btn.addClass('is-active');
			});
			return btn;
		});

		container.createEl('h4', { text: '메모', cls: 'brew-flow-section-label' });
		const noteEl = container.createEl('textarea', { cls: 'brew-flow-note' });
		noteEl.placeholder = '맛, 변수 조절 메모...';

		const btnRow = container.createDiv({ cls: 'brewing-controls' });
		const saveBtn = btnRow.createEl('button', { text: '저장', cls: 'brewing-ctrl-btn brew-flow-save-btn' });
		const cancelBtn = btnRow.createEl('button', { text: '취소', cls: 'brewing-ctrl-btn' });

		saveBtn.addEventListener('click', async () => {
			const record = this.flowState.buildRecord(
				selectedDrinker,
				noteEl.value.trim() || undefined
			);
			await this.plugin.recordService.add(record);
			this.flowState.cancel();
			this.renderContent();
		});

		cancelBtn.addEventListener('click', () => {
			this.flowState.cancel();
			this.renderContent();
		});
	}

	private createFormField(container: HTMLElement, label: string, type: string, value: string): HTMLInputElement {
		const group = container.createDiv();
		group.createEl('label', { text: label });
		const input = group.createEl('input', { type });
		input.value = value;
		if (type === 'number') input.step = 'any';
		return input;
	}

	private bindServiceEvents(): void {
		this.listen('state', (state: AcaiaState) => {
			this.updateScaleHeader(state);
			this.updateScaleControls(state);
		});

		this.listen('weight', (grams: number) => {
			if (this.weightEl) this.weightEl.textContent = `${grams.toFixed(1)}`;
		});

		this.listen('timer', (seconds: number) => {
			this.handleScaleTimer(seconds);
		});

		this.listen('button', (event: { type: string; weight?: number; timer?: number }) => {
			this.handleScaleButton(event);
		});

		this.listen('battery', (percent: number) => {
			this.scaleBatteryEl.textContent = `Battery: ${percent}%`;
		});

		this.listen('error', (err: Error) => {
			this.scaleStatusEl.textContent = err.message;
			this.scaleStatusEl.addClass('brewing-error');
			setTimeout(() => this.scaleStatusEl.removeClass('brewing-error'), 3000);
		});
	}

	private listen(event: string, fn: (...args: any[]) => void): void {
		this.plugin.acaiaService.on(event, fn);
		this.listeners.push({ event, fn });
	}

	private updateScaleHeader(state: AcaiaState): void {
		this.scaleDotEl.className = 'brewing-scale-dot';
		if (state === 'connected') this.scaleDotEl.addClass('is-connected');
		else if (state === 'disconnected') this.scaleDotEl.addClass('is-disconnected');
		else if (state === 'scanning' || state === 'connecting' || state === 'reconnecting') this.scaleDotEl.addClass('is-busy');

		this.scaleStatusEl.removeClass('brewing-error');

		switch (state) {
			case 'idle':
				this.scaleStatusEl.textContent = '';
				this.scaleConnectBtn.textContent = '연결';
				this.scaleBatteryEl.textContent = '';
				break;
			case 'scanning':
				this.scaleStatusEl.textContent = '스캔 중';
				this.scaleConnectBtn.textContent = '취소';
				this.scaleBatteryEl.textContent = '';
				break;
			case 'connecting':
				this.scaleStatusEl.textContent = '연결 중';
				this.scaleConnectBtn.textContent = '취소';
				this.scaleBatteryEl.textContent = '';
				break;
			case 'connected':
				this.scaleStatusEl.textContent = '연결됨';
				this.scaleConnectBtn.textContent = '해제';
				break;
			case 'disconnected':
				this.scaleStatusEl.textContent = '연결 끊김';
				this.scaleConnectBtn.textContent = '재연결';
				this.scaleBatteryEl.textContent = '';
				break;
			case 'reconnecting': {
				const attempt = this.plugin.acaiaService.currentReconnectAttempt;
				this.scaleStatusEl.textContent = `재연결 중 (${attempt}/3)`;
				this.scaleConnectBtn.textContent = '취소';
				this.scaleBatteryEl.textContent = '';
				break;
			}
		}

		this.scaleConnectBtn.disabled = false;
	}

	private updateScaleControls(state: AcaiaState): void {
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
				this.stopLocalTimer();
				this.timerElapsedAtStop = 0;
				this.timerStartedAt = 0;
				this.timerState = 'idle';
				if (this.timerBtn) this.timerBtn.textContent = '\u23FB';
			}
			this.scaleDataEl.style.display = 'none';
		}

		if (state === 'idle') {
			if (this.weightEl) this.weightEl.textContent = '--';
			if (this.timerEl) this.timerEl.textContent = '0:00';
			this.weightEl?.removeClass('brewing-dimmed');
			this.timerEl?.removeClass('brewing-dimmed');
			this.stopLocalTimer();
			this.timerElapsedAtStop = 0;
			this.timerStartedAt = 0;
			this.timerState = 'idle';
			if (this.timerBtn) this.timerBtn.textContent = '\u23FB';
			this.scaleDataEl.style.display = 'none';
		}
	}

	private async handleConnectClick(): Promise<void> {
		const service = this.plugin.acaiaService;
		if (service.state === 'scanning' || service.state === 'connecting' || service.state === 'reconnecting') {
			await service.cancelConnect();
		} else if (service.state === 'connected') {
			await service.disconnect();
		} else {
			await service.connect();
		}
	}

	private getElapsedSeconds(): number {
		if (this.timerState === 'running') {
			return this.timerElapsedAtStop + (Date.now() - this.timerStartedAt) / 1000;
		}
		return this.timerElapsedAtStop;
	}

	private formatTimer(seconds: number): string {
		const min = Math.floor(seconds / 60);
		const sec = Math.floor(seconds % 60);
		return `${min}:${sec.toString().padStart(2, '0')}`;
	}

	private updateTimerDisplay(): void {
		if (!this.timerEl) return;
		this.timerEl.textContent = this.formatTimer(this.getElapsedSeconds());
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

	private async handleTimerClick(): Promise<void> {
		const service = this.plugin.acaiaService;
		switch (this.timerState) {
			case 'idle':
				await service.startTimer();
				this.timerStartedAt = Date.now();
				this.timerElapsedAtStop = 0;
				this.startLocalTimer();
				this.timerBtn.textContent = '\u23F9';
				this.timerState = 'running';
				break;
			case 'running':
				await service.stopTimer();
				this.timerElapsedAtStop = this.getElapsedSeconds();
				this.timerState = 'stopped';
				this.stopLocalTimer();
				this.updateTimerDisplay();
				this.timerBtn.textContent = '\u21BA';
				break;
			case 'stopped':
				await service.resetTimer();
				this.timerElapsedAtStop = 0;
				this.timerStartedAt = 0;
				this.stopLocalTimer();
				this.timerEl.textContent = '0:00';
				this.timerBtn.textContent = '\u23FB';
				this.timerState = 'idle';
				break;
		}
	}

	private handleScaleTimer(seconds: number): void {
		if (this.timerState === 'running' && seconds > 0) {
			this.timerStartedAt = Date.now() - seconds * 1000;
		} else if (this.timerState === 'stopped' && seconds === 0) {
			this.timerElapsedAtStop = 0;
			this.timerStartedAt = 0;
			this.stopLocalTimer();
			this.timerEl.textContent = '0:00';
			this.timerBtn.textContent = '\u23FB';
			this.timerState = 'idle';
		}
	}

	private handleScaleButton(event: { type: string; weight?: number; timer?: number }): void {
		switch (event.type) {
			case 'timer_start':
				if (this.timerState === 'idle' || this.timerState === 'stopped') {
					this.timerStartedAt = Date.now();
					this.timerElapsedAtStop = 0;
					this.startLocalTimer();
					this.timerBtn.textContent = '\u23F9';
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
					this.timerBtn.textContent = '\u21BA';
				}
				break;
			case 'timer_reset':
				this.timerElapsedAtStop = 0;
				this.timerStartedAt = 0;
				this.stopLocalTimer();
				this.timerEl.textContent = '0:00';
				this.timerBtn.textContent = '\u23FB';
				this.timerState = 'idle';
				break;
		}
	}
}
