import { ItemView, WorkspaceLeaf } from 'obsidian';
import type CubicJBrewingPlugin from '../main';
import type { AcaiaState } from '../acaia/types';
import { BrewFlowState } from '../brew/BrewFlowState';
import type { BrewMethod, BrewTemp, EspressoDrink } from '../brew/types';

export const VIEW_TYPE_BREWING = 'cubicj-brewing';

const METHOD_LABELS: Record<BrewMethod, string> = { brewing: '브루잉', espresso: '에스프레소' };
const TEMP_LABELS: Record<BrewTemp, string> = { hot: '핫', iced: '아이스' };
const DRINK_LABELS: Record<EspressoDrink, string> = { shot: '샷', americano: '아메리카노', latte: '라떼' };

export class BrewingView extends ItemView {
	private plugin: CubicJBrewingPlugin;
	private listeners: Array<{ event: string; fn: (...args: any[]) => void }> = [];
	private flowState = new BrewFlowState();

	private scaleHeaderEl!: HTMLElement;
	private scaleDotEl!: HTMLElement;
	private scaleStatusEl!: HTMLElement;
	private scaleBatteryEl!: HTMLElement;
	private scaleConnectBtn!: HTMLButtonElement;
	private contentArea!: HTMLElement;

	private weightEl!: HTMLElement;
	private timerEl!: HTMLElement;
	private tareBtn!: HTMLButtonElement;
	private timerBtn!: HTMLButtonElement;
	private timerState: 'idle' | 'running' | 'stopped' = 'idle';

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
		this.contentArea = container.createDiv({ cls: 'brewing-content-area' });
		this.bindServiceEvents();
		this.updateScaleHeader(this.plugin.acaiaService.state);
		this.renderContent();
	}

	async onClose(): Promise<void> {
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

	private renderContent(): void {
		this.contentArea.empty();
		this.renderSummaryStack(this.contentArea);
		switch (this.flowState.step) {
			case 'idle': this.renderIdle(this.contentArea); break;
			case 'method': this.renderMethod(this.contentArea); break;
			case 'bean': this.renderBean(this.contentArea); break;
			case 'configure': this.renderConfigure(this.contentArea); break;
			case 'brewing': this.renderBrewing(this.contentArea); break;
			case 'saving': this.renderSaving(this.contentArea); break;
		}
	}

	private renderSummaryStack(container: HTMLElement): void {
		if (this.flowState.step === 'idle') return;

		const stack = container.createDiv({ cls: 'brew-flow-summary' });
		const sel = this.flowState.selection;

		if (sel.method) {
			const label = `${METHOD_LABELS[sel.method]} · ${TEMP_LABELS[sel.temp!]}`;
			const chip = stack.createSpan({ cls: 'brew-flow-chip', text: label });
			if (sel.drink) chip.textContent += ` · ${DRINK_LABELS[sel.drink]}`;
			chip.addEventListener('click', () => {
				this.flowState.goToStep('method');
				this.renderContent();
			});
		}

		if (sel.bean) {
			const chip = stack.createSpan({ cls: 'brew-flow-chip', text: sel.bean.name });
			chip.addEventListener('click', () => {
				this.flowState.goToStep('bean');
				this.renderContent();
			});
		}

		if (sel.grindSize != null && this.flowState.step !== 'configure') {
			const parts = [`${sel.grindSize}`, `${sel.dose}g`];
			if (sel.method === 'brewing' && sel.waterTemp) parts.push(`${sel.waterTemp}°`);
			const chip = stack.createSpan({ cls: 'brew-flow-chip', text: parts.join(' · ') });
			chip.addEventListener('click', () => {
				this.flowState.goToStep('configure');
				this.renderContent();
			});
		}

		const cancel = stack.createSpan({ cls: 'brew-flow-cancel', text: '✕' });
		cancel.addEventListener('click', () => {
			this.flowState.cancel();
			this.renderContent();
		});
	}

	private renderIdle(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'brewing-section brew-flow-idle' });

		const btn = section.createEl('button', { text: '새 브루잉', cls: 'brew-flow-start-btn' });
		btn.addEventListener('click', () => {
			this.flowState.startBrew();
			this.renderContent();
		});

		this.renderLastBrewSummary(section);
	}

	private async renderLastBrewSummary(container: HTMLElement): Promise<void> {
		const records = await this.plugin.recordService.getAll();
		if (records.length === 0) return;

		const last = [...records].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
		const card = container.createDiv({ cls: 'brew-flow-last-record' });
		const date = new Date(last.timestamp);
		const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;

		card.createDiv({ cls: 'brew-flow-last-record-title', text: `마지막: ${last.bean}` });
		const meta = card.createDiv({ cls: 'brew-flow-last-record-meta' });
		const parts = [dateStr, `${last.grindSize}`, `${last.dose}g`];
		if (last.time) {
			const min = Math.floor(last.time / 60);
			const sec = Math.floor(last.time % 60);
			parts.push(`${min}:${sec.toString().padStart(2, '0')}`);
		}
		if (last.yield) parts.push(`${last.yield}g`);
		meta.textContent = parts.join(' · ');
	}

	private renderMethod(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'brewing-section brew-flow-method' });
		section.createEl('h4', { text: '추출 방식' });

		let selectedMethod: BrewMethod | null = null;
		let selectedTemp: BrewTemp | null = null;
		let selectedDrink: EspressoDrink | null = null;

		const methodGroup = section.createDiv({ cls: 'brew-flow-toggle-group' });
		const methods: BrewMethod[] = ['brewing', 'espresso'];
		const methodBtns = methods.map(m => {
			const btn = methodGroup.createDiv({ cls: 'brew-flow-toggle', text: METHOD_LABELS[m] });
			btn.addEventListener('click', () => {
				selectedMethod = m;
				methodBtns.forEach(b => b.removeClass('is-active'));
				btn.addClass('is-active');
				drinkRow.style.display = m === 'espresso' ? '' : 'none';
				if (m === 'brewing') selectedDrink = null;
				tryAdvance();
			});
			return btn;
		});

		section.createEl('h4', { text: '온도' });
		const tempGroup = section.createDiv({ cls: 'brew-flow-toggle-group' });
		const temps: BrewTemp[] = ['hot', 'iced'];
		const tempBtns = temps.map(t => {
			const btn = tempGroup.createDiv({ cls: 'brew-flow-toggle', text: TEMP_LABELS[t] });
			btn.addEventListener('click', () => {
				selectedTemp = t;
				tempBtns.forEach(b => b.removeClass('is-active'));
				btn.addClass('is-active');
				tryAdvance();
			});
			return btn;
		});

		const drinkRow = section.createDiv({ cls: 'brew-flow-drink-row' });
		drinkRow.style.display = 'none';
		drinkRow.createEl('h4', { text: '음료' });
		const drinkGroup = drinkRow.createDiv({ cls: 'brew-flow-toggle-group' });
		const drinks: EspressoDrink[] = ['shot', 'americano', 'latte'];
		const drinkBtns = drinks.map(d => {
			const btn = drinkGroup.createDiv({ cls: 'brew-flow-toggle', text: DRINK_LABELS[d] });
			btn.addEventListener('click', () => {
				selectedDrink = d;
				drinkBtns.forEach(b => b.removeClass('is-active'));
				btn.addClass('is-active');
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
		const section = container.createDiv({ cls: 'brewing-section brew-flow-bean' });
		section.createEl('h4', { text: '원두 선택' });

		const beans = this.plugin.vaultData.getActiveBeans();

		if (beans.length === 0) {
			section.createDiv({ cls: 'brew-flow-empty', text: 'type: bean frontmatter가 있는 노트가 없어요' });
			return;
		}

		for (const bean of beans) {
			const item = section.createDiv({ cls: 'brew-flow-bean-item' });
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
		const section = container.createDiv({ cls: 'brewing-section brew-flow-configure' });
		const sel = this.flowState.selection;
		const isBrewing = sel.method === 'brewing';

		if (sel.lastRecord) {
			const card = section.createDiv({ cls: 'brew-flow-last-record' });
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

		const form = section.createDiv({ cls: 'brew-flow-form' });

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
			const recipeGroup = section.createDiv({ cls: 'brew-flow-recipe-select' });
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

		const startBtn = section.createEl('button', { text: '브루잉 시작', cls: 'brew-flow-start-btn' });
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
		const section = container.createDiv({ cls: 'brewing-section brew-flow-active-brew' });
		const scaleConnected = this.plugin.acaiaService.state === 'connected';

		const dataSection = section.createDiv({ cls: 'brewing-data' });
		this.weightEl = dataSection.createDiv({ cls: 'brewing-weight', text: scaleConnected ? '0.0 g' : '-- g' });
		this.timerEl = dataSection.createDiv({ cls: 'brewing-timer', text: '0:00.0' });

		if (!scaleConnected) {
			this.weightEl.addClass('brewing-dimmed');
			section.createDiv({ cls: 'brew-flow-notice', text: '저울 미연결 — 수동 입력 가능' });
		}

		const recipe = this.flowState.selection.recipe;
		if (recipe && recipe.steps.length > 0) {
			const stepsEl = section.createDiv({ cls: 'brew-flow-recipe-steps' });
			stepsEl.createEl('h4', { text: recipe.name });
			for (const step of recipe.steps) {
				const stepEl = stepsEl.createDiv({ cls: 'brew-flow-recipe-step' });
				const parts = [step.time];
				if (step.target) parts.push(`→ ${step.target}g`);
				if (step.note) parts.push(step.note);
				stepEl.textContent = parts.join(' ');
			}
		}

		const controls = section.createDiv({ cls: 'brewing-controls' });

		if (scaleConnected) {
			this.tareBtn = controls.createEl('button', { text: 'Tare', cls: 'brewing-ctrl-btn' });
			this.tareBtn.addEventListener('click', () => this.plugin.acaiaService.tare());

			this.timerBtn = controls.createEl('button', { text: 'Start', cls: 'brewing-ctrl-btn' });
			this.timerState = 'idle';
			this.timerBtn.addEventListener('click', () => this.handleTimerClick());
		}

		const stopBtn = controls.createEl('button', { text: '완료', cls: 'brewing-ctrl-btn brew-flow-stop-btn' });
		stopBtn.addEventListener('click', () => {
			if (scaleConnected) {
				const timeText = this.timerEl.textContent || '0:00.0';
				const timeParts = timeText.split(':');
				const min = parseInt(timeParts[0]) || 0;
				const secParts = (timeParts[1] || '0').split('.');
				const sec = parseInt(secParts[0]) || 0;
				const ds = parseInt(secParts[1]) || 0;
				const totalSeconds = min * 60 + sec + ds / 10;

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
		const section = container.createDiv({ cls: 'brewing-section brew-flow-saving' });
		const sel = this.flowState.selection;

		const resultEl = section.createDiv({ cls: 'brew-flow-result' });
		const parts: string[] = [];
		if (sel.time) {
			const min = Math.floor(sel.time / 60);
			const sec = Math.floor(sel.time % 60);
			parts.push(`${min}:${sec.toString().padStart(2, '0')}`);
		}
		if (sel.yield) parts.push(`${sel.yield}g`);
		resultEl.textContent = parts.length > 0 ? parts.join(' / ') : '수동 기록';

		if (!sel.time) {
			const manualForm = section.createDiv({ cls: 'brew-flow-form' });
			const timeInput = this.createFormField(manualForm, '시간 (초)', 'number', '');
			const yieldInput = this.createFormField(manualForm, '추출량 (g)', 'number', '');
			timeInput.addEventListener('change', () => {
				this.flowState.updateVariables({ time: parseFloat(timeInput.value) || undefined });
			});
			yieldInput.addEventListener('change', () => {
				this.flowState.updateVariables({ yield: parseFloat(yieldInput.value) || undefined });
			});
		}

		section.createEl('h4', { text: '마시는 사람', cls: 'brew-flow-section-label' });
		const drinkerGroup = section.createDiv({ cls: 'brew-flow-toggle-group' });
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

		section.createEl('h4', { text: '메모', cls: 'brew-flow-section-label' });
		const noteEl = section.createEl('textarea', { cls: 'brew-flow-note' });
		noteEl.placeholder = '맛, 변수 조절 메모...';

		const btnRow = section.createDiv({ cls: 'brewing-controls' });
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
			if (this.weightEl) this.weightEl.textContent = `${grams.toFixed(1)} g`;
		});

		this.listen('timer', (seconds: number) => {
			if (!this.timerEl) return;
			const min = Math.floor(seconds / 60);
			const sec = Math.floor(seconds % 60);
			const ds = Math.round((seconds % 1) * 10);
			this.timerEl.textContent = `${min}:${sec.toString().padStart(2, '0')}.${ds}`;
		});

		this.listen('battery', (percent: number) => {
			this.scaleBatteryEl.textContent = `${percent}%`;
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
		else if (state === 'scanning' || state === 'connecting') this.scaleDotEl.addClass('is-busy');

		switch (state) {
			case 'idle':
				this.scaleStatusEl.textContent = '';
				this.scaleConnectBtn.textContent = '연결';
				this.scaleBatteryEl.textContent = '';
				break;
			case 'scanning':
				this.scaleStatusEl.textContent = '스캔 중';
				this.scaleConnectBtn.textContent = '취소';
				break;
			case 'connecting':
				this.scaleStatusEl.textContent = '연결 중';
				this.scaleConnectBtn.textContent = '취소';
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
		}

		this.scaleConnectBtn.disabled = false;
	}

	private updateScaleControls(state: AcaiaState): void {
		const connected = state === 'connected';

		if (this.tareBtn) this.tareBtn.disabled = !connected;
		if (this.timerBtn) this.timerBtn.disabled = !connected;

		if (state === 'connected') {
			this.weightEl?.removeClass('brewing-dimmed');
			this.timerEl?.removeClass('brewing-dimmed');
		}

		if (state === 'disconnected') {
			this.weightEl?.addClass('brewing-dimmed');
			this.timerEl?.addClass('brewing-dimmed');
			this.timerState = 'idle';
			if (this.timerBtn) this.timerBtn.textContent = 'Start';
		}

		if (state === 'idle') {
			if (this.weightEl) this.weightEl.textContent = '-- g';
			if (this.timerEl) this.timerEl.textContent = '--:--';
			this.weightEl?.removeClass('brewing-dimmed');
			this.timerEl?.removeClass('brewing-dimmed');
			this.timerState = 'idle';
			if (this.timerBtn) this.timerBtn.textContent = 'Start';
		}
	}

	private async handleConnectClick(): Promise<void> {
		const service = this.plugin.acaiaService;
		if (service.state === 'connected') {
			await service.disconnect();
		} else {
			await service.connect();
		}
	}

	private async handleTimerClick(): Promise<void> {
		const service = this.plugin.acaiaService;
		switch (this.timerState) {
			case 'idle':
				await service.startTimer();
				this.timerBtn.textContent = 'Stop';
				this.timerState = 'running';
				break;
			case 'running':
				await service.stopTimer();
				this.timerBtn.textContent = 'Reset';
				this.timerState = 'stopped';
				break;
			case 'stopped':
				await service.resetTimer();
				this.timerBtn.textContent = 'Start';
				this.timerState = 'idle';
				break;
		}
	}
}
