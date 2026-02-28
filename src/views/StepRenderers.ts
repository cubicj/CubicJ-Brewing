import type CubicJBrewingPlugin from '../main';
import type { BrewFlowState } from '../brew/BrewFlowState';
import type { BrewMethod, BrewTemp, EspressoDrink, BrewFlowSelection } from '../brew/types';
import type { TimerController } from './TimerController';
import { formatTimer } from './TimerController';

export type FlowStep = 'method' | 'bean' | 'configure' | 'brewing' | 'saving';

const METHOD_LABELS: Record<BrewMethod, string> = { filter: '필터', espresso: '에스프레소' };
const TEMP_LABELS: Record<BrewTemp, string> = { hot: 'Hot', iced: 'Ice' };
const DRINK_LABELS: Record<EspressoDrink, string> = { shot: '샷', americano: '아메리카노', latte: '라떼' };

export const STEP_CONFIG: Array<{ step: FlowStep; label: string }> = [
	{ step: 'method', label: '추출 방식' },
	{ step: 'bean', label: '원두 선택' },
	{ step: 'configure', label: '추출 변수 설정' },
	{ step: 'brewing', label: '브루잉' },
	{ step: 'saving', label: '메모' },
];

export interface StepRenderContext {
	flowState: BrewFlowState;
	plugin: CubicJBrewingPlugin;
	renderContent: () => void;
	updateAccordion: () => void;
	timerController: TimerController;
	getWeightText: () => string;
	brewingStarted: boolean;
	setBrewingStarted: (v: boolean) => void;
	resetFlow: () => void;
}

export function renderStep(step: FlowStep, container: HTMLElement, ctx: StepRenderContext): void {
	switch (step) {
		case 'method': renderMethod(container, ctx); break;
		case 'bean': renderBean(container, ctx); break;
		case 'configure': renderConfigure(container, ctx); break;
		case 'brewing': renderBrewing(container, ctx); break;
		case 'saving': renderSaving(container, ctx); break;
	}
}

export function getStepSummary(step: FlowStep, sel: BrewFlowSelection): string {
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
			if (sel.method === 'filter' && sel.waterTemp) parts.push(`${sel.waterTemp}°`);
			if (sel.method === 'filter' && sel.filter) parts.push(sel.filter);
			if (sel.method === 'espresso' && sel.basket) parts.push(sel.basket);
			return parts.join(' · ');
		}
		case 'brewing': {
			const parts: string[] = [];
			if (sel.time) parts.push(formatTimer(sel.time));
			if (sel.yield) parts.push(`${sel.yield}g`);
			return parts.join(' / ');
		}
		case 'saving':
			return '';
	}
}

function createFormField(container: HTMLElement, label: string, type: string, value: string): HTMLInputElement {
	const group = container.createDiv();
	group.createEl('label', { text: label });
	const input = group.createEl('input', { type });
	input.value = value;
	if (type === 'number') input.step = 'any';
	return input;
}

function renderMethod(container: HTMLElement, ctx: StepRenderContext): void {
	container.addClass('brew-flow-method');

	const sel = ctx.flowState.selection;
	let selectedMethod: BrewMethod | null = sel.method ?? null;
	let selectedTemp: BrewTemp | null = sel.temp ?? null;
	let selectedDrink: EspressoDrink | null = sel.drink ?? null;

	const syncSelection = () => {
		sel.method = selectedMethod ?? undefined;
		sel.temp = selectedTemp ?? undefined;
		sel.drink = selectedDrink ?? undefined;
	};

	const methodGroup = container.createDiv({ cls: 'brew-flow-toggle-group' });
	const methods: BrewMethod[] = ['filter', 'espresso'];
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
		const complete = !!selectedMethod && !!selectedTemp && (selectedMethod !== 'espresso' || !!selectedDrink);
		if (complete) {
			setTimeout(() => {
				ctx.flowState.selectMethod(selectedMethod!, selectedTemp!, selectedDrink ?? undefined);
				ctx.renderContent();
			}, 150);
		} else if (ctx.flowState.step !== 'method') {
			ctx.flowState.goToStep('method');
			ctx.updateAccordion();
		}
	};
}

async function renderBean(container: HTMLElement, ctx: StepRenderContext): Promise<void> {
	container.addClass('brew-flow-bean');

	const beans = [...ctx.plugin.vaultData.getActiveBeans()].sort((a, b) => a.name.localeCompare(b.name));

	if (beans.length === 0) {
		container.createDiv({ cls: 'brew-flow-empty', text: 'type: bean frontmatter가 있는 노트가 없어요' });
		return;
	}

	const selectedBean = ctx.flowState.selection.bean;

	for (const bean of beans) {
		const isSelected = selectedBean?.name === bean.name;
		const item = container.createDiv({ cls: `brew-flow-bean-item${isSelected ? ' is-selected' : ''}` });
		item.createDiv({ text: bean.name });

		const days = ctx.plugin.vaultData.getDaysSinceRoast(bean);
		const metaParts = [bean.roaster];
		if (days !== null) metaParts.push(`D+${days}`);
		item.createDiv({ cls: 'brew-flow-bean-meta', text: metaParts.join(' · ') });

		item.addEventListener('click', async () => {
			if (isSelected) {
				ctx.flowState.deselectBean();
				ctx.updateAccordion();
			} else {
				const lastRecord = await ctx.plugin.recordService.getLastRecord(
					bean.name,
					ctx.flowState.selection.method!
				);
				ctx.flowState.selectBean(bean, lastRecord);
				ctx.renderContent();
			}
		});
	}
}

function renderConfigure(container: HTMLElement, ctx: StepRenderContext): void {
	container.addClass('brew-flow-configure');
	const sel = ctx.flowState.selection;
	const isFilter = sel.method === 'filter';
	const isEspresso = sel.method === 'espresso';

	if (sel.lastRecord) {
		const card = container.createDiv({ cls: 'brew-flow-last-record' });
		card.createDiv({ cls: 'brew-flow-last-record-title', text: '이전 기록' });
		const r = sel.lastRecord;
		const parts = [`분쇄도 ${r.grindSize}`, `${r.dose}g`];
		if (r.method === 'filter') parts.push(`${r.waterTemp}°`, r.filter);
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

	const grindInput = createFormField(form, '분쇄도', 'number', String(sel.grindSize ?? ''));
	const doseInput = createFormField(form, '원두량 (g)', 'number', String(sel.dose ?? ''));

	let waterTempInput: HTMLInputElement | null = null;
	let filterSelect: HTMLSelectElement | null = null;
	let basketSelect: HTMLSelectElement | null = null;

	if (isFilter) {
		waterTempInput = createFormField(form, '수온 (°C)', 'number', String(sel.waterTemp ?? ''));

		const filterGroup = form.createDiv();
		filterGroup.createEl('label', { text: '필터' });
		filterSelect = filterGroup.createEl('select');
		for (const f of ctx.plugin.settings.filters) {
			filterSelect.createEl('option', { text: f, value: f });
		}
		if (sel.filter) filterSelect.value = sel.filter;
	}

	if (isEspresso) {
		const basketGroup = form.createDiv();
		basketGroup.createEl('label', { text: '바스켓' });
		basketSelect = basketGroup.createEl('select');
		for (const b of ctx.plugin.settings.baskets) {
			basketSelect.createEl('option', { text: b, value: b });
		}
		if (sel.basket) basketSelect.value = sel.basket;
	}

	const recipes = ctx.plugin.vaultData.getAllRecipes();
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
			if (recipe) ctx.flowState.selectRecipe(recipe);
		});
	}

	const completeBtn = container.createEl('button', { text: '세팅 완료', cls: 'brew-flow-start-btn' });
	completeBtn.addEventListener('click', () => {
		const vars: Partial<BrewFlowSelection> = {
			grindSize: parseFloat(grindInput.value) || 0,
			dose: parseFloat(doseInput.value) || 0,
		};
		if (isFilter) {
			vars.waterTemp = parseFloat(waterTempInput!.value) || 0;
			vars.filter = filterSelect!.value;
		}
		if (isEspresso) {
			vars.basket = basketSelect!.value;
		}
		ctx.flowState.updateVariables(vars);
		ctx.flowState.startBrewing();
		ctx.renderContent();
	});
}

function renderBrewing(container: HTMLElement, ctx: StepRenderContext): void {
	container.addClass('brew-flow-active-brew');
	const scaleConnected = ctx.plugin.acaiaService.state === 'connected';

	const recipe = ctx.flowState.selection.recipe;
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

	if (!ctx.brewingStarted) {
		const startBtn = controls.createEl('button', { text: '브루잉 시작', cls: 'brewing-ctrl-btn brew-flow-start-btn' });
		startBtn.addEventListener('click', async () => {
			ctx.setBrewingStarted(true);
			if (scaleConnected) {
				await ctx.timerController.handleTimerClick();
			}
			ctx.updateAccordion();
		});
	} else {
		const stopBtn = controls.createEl('button', { text: '완료', cls: 'brewing-ctrl-btn brew-flow-stop-btn' });
		stopBtn.addEventListener('click', async () => {
			if (scaleConnected) {
				await ctx.plugin.acaiaService.stopTimer();
				const totalSeconds = ctx.timerController.getElapsedSeconds();
				const yieldGrams = parseFloat(ctx.getWeightText()) || undefined;
				ctx.flowState.finishBrewing(totalSeconds || undefined, yieldGrams);
				ctx.timerController.resetToIdle();
			} else {
				ctx.flowState.finishBrewing(undefined, undefined);
			}
			ctx.setBrewingStarted(false);
			ctx.renderContent();
		});
	}
}

function renderSaving(container: HTMLElement, ctx: StepRenderContext): void {
	container.addClass('brew-flow-saving');
	const sel = ctx.flowState.selection;

	const resultEl = container.createDiv({ cls: 'brew-flow-result' });
	const parts: string[] = [];
	if (sel.time) {
		const min = Math.floor(sel.time / 60);
		const sec = Math.floor(sel.time % 60);
		parts.push(`${min}:${sec.toString().padStart(2, '0')}`);
	}
	if (sel.yield) parts.push(`${sel.yield}g`);
	if (parts.length > 0) resultEl.textContent = parts.join(' / ');

	if (!sel.time && sel.method === 'espresso') {
		const manualForm = container.createDiv({ cls: 'brew-flow-form' });
		const timeInput = createFormField(manualForm, '시간 (초)', 'number', '');
		const yieldInput = createFormField(manualForm, '추출량 (g)', 'number', '');
		timeInput.addEventListener('change', () => {
			ctx.flowState.updateVariables({ time: parseFloat(timeInput.value) || undefined });
		});
		yieldInput.addEventListener('change', () => {
			ctx.flowState.updateVariables({ yield: parseFloat(yieldInput.value) || undefined });
		});
	}

	container.createEl('h4', { text: '메모', cls: 'brew-flow-section-label' });
	const noteEl = container.createEl('textarea', { cls: 'brew-flow-note' });
	noteEl.placeholder = '맛, 변수 조절 메모...';

	let roReady = false;
	const ro = new ResizeObserver(() => {
		if (!roReady) { roReady = true; return; }
		const body = noteEl.closest('.brew-accordion-body') as HTMLElement | null;
		if (body?.classList.contains('is-open') && body.style.maxHeight !== '0px') {
			body.style.transition = 'none';
			body.style.maxHeight = body.scrollHeight + 'px';
			body.offsetHeight;
			body.style.transition = '';
		}
	});
	ro.observe(noteEl);

	const btnRow = container.createDiv({ cls: 'brewing-controls' });
	const doneBtn = btnRow.createEl('button', { text: '완료', cls: 'brewing-ctrl-btn brew-flow-save-btn' });

	doneBtn.addEventListener('click', () => {
		ctx.resetFlow();
	});
}
