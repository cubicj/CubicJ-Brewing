import type CubicJBrewingPlugin from '../main';
import type { BrewFlowState } from '../brew/BrewFlowState';
import type { BrewMethod, BrewTemp, EspressoDrink, BrewFlowSelection, BrewRecord } from '../brew/types';
import type { TimerController } from './TimerController';
import { formatTimer } from './TimerController';
import type { BrewProfileRecorder } from './BrewProfileRecorder';
import type { BrewProfileStorage } from '../services/BrewProfileStorage';
import { BrewProfileChart } from './BrewProfileChart';
import { BrewProfileModal } from './BrewProfileModal';
import { createStepper, type StepperConfig } from './Stepper';
import { Notice } from 'obsidian';

export type FlowStep = 'method' | 'bean' | 'configure' | 'brewing' | 'saving';

const METHOD_LABELS: Record<BrewMethod, string> = { filter: '필터', espresso: '에스프레소' };
const TEMP_LABELS: Record<BrewTemp, string> = { hot: 'Hot', iced: 'Ice' };
const FILTERS = ['하이플럭스', 'V60 기본'];  // TBD: vault note DB
const GRINDERS: string[] = [];  // TBD: vault note DB
const BASKETS = ['DH 18g', 'IMS SF 20g', 'IMS 20g', 'Torch 18g'];  // TBD: vault note DB
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
	recorder: BrewProfileRecorder;
	expandStep: (step: FlowStep) => void;
	animateContentChange: (step: FlowStep, mutation: () => void) => void;
	profileStorage: BrewProfileStorage;
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
		case 'bean': {
			if (!sel.bean) return '';
			const parts = [sel.bean.name];
			if (sel.bean.roastDate) {
				const days = Math.floor((Date.now() - new Date(sel.bean.roastDate).getTime()) / 86400000);
				if (days >= 0) parts.push(`${days}일차`);
			}
			return parts.join(' · ');
		}
		case 'configure': {
			if (sel.grindSize == null) return '';
			const parts = [`${sel.grindSize}`, `${sel.dose}g`];
			if (sel.method === 'filter' && sel.waterTemp) parts.push(`${sel.waterTemp}°C`);
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
			const show = selectedMethod === 'espresso';
			if (!show) selectedDrink = null;
			ctx.animateContentChange('method', () => {
				drinkRow.style.display = show ? '' : 'none';
			});
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
			setTimeout(async () => {
				ctx.flowState.selectMethod(selectedMethod!, selectedTemp!, selectedDrink ?? undefined);
				const bean = ctx.flowState.selection.bean;
				if (bean) {
					const lastRecord = await ctx.plugin.recordService.getLastRecord(
						bean.name, selectedMethod!, selectedTemp!,
					);
					ctx.flowState.selectBean(bean, lastRecord);
				}
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
		if (days !== null) item.createDiv({ cls: 'brew-flow-bean-meta', text: `로스팅 ${days}일차` });

		item.addEventListener('click', async () => {
			if (isSelected) {
				ctx.flowState.deselectBean();
				ctx.updateAccordion();
			} else {
				const lastRecord = await ctx.plugin.recordService.getLastRecord(
					bean.name,
					ctx.flowState.selection.method!,
					ctx.flowState.selection.temp!,
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

	const cardWrapper = container.createDiv();

	const updateCard = (record: BrewRecord | undefined) => {
		cardWrapper.empty();
		const card = cardWrapper.createDiv({ cls: 'brew-flow-last-record' });
		card.createDiv({ cls: 'brew-flow-last-record-title', text: '이전 기록' });
		if (!record) {
			card.createDiv({ cls: 'brew-flow-last-record-meta', text: '-' });
			return;
		}
		const parts = [`분쇄도 ${record.grindSize}`, `${record.dose}g`];
		if (record.method === 'filter') parts.push(`${record.waterTemp}°C`);
		if (record.method === 'espresso') parts.push(record.basket);
		card.createDiv({ cls: 'brew-flow-last-record-meta', text: parts.join(' · ') });
	};

	updateCard(sel.lastRecord);

	const form = container.createDiv({ cls: 'brew-flow-form' });

	let filterSelect: HTMLSelectElement | null = null;
	let basketSelect: HTMLSelectElement | null = null;
	let waterTempStepper: ReturnType<typeof createStepper> | null = null;

	if (isFilter) {
		const filterGroup = form.createDiv();
		filterGroup.createEl('label', { text: '필터' });
		filterSelect = filterGroup.createEl('select');
		for (const f of FILTERS) {
			filterSelect.createEl('option', { text: f, value: f });
		}
		if (sel.filter) filterSelect.value = sel.filter;
	}

	if (isEspresso) {
		const basketGroup = form.createDiv();
		basketGroup.createEl('label', { text: '바스켓' });
		basketSelect = basketGroup.createEl('select');
		for (const b of BASKETS) {
			basketSelect.createEl('option', { text: b, value: b });
		}
		if (sel.basket) basketSelect.value = sel.basket;
	}

	if (GRINDERS.length > 0) {
		const grinderGroup = form.createDiv();
		grinderGroup.createEl('label', { text: '그라인더' });
		const grinderSelect = grinderGroup.createEl('select');
		for (const g of GRINDERS) {
			grinderSelect.createEl('option', { text: g, value: g });
		}
	}

	const grindStepper = createStepper(form, {
		label: '분쇄도', initial: sel.grindSize ?? 0,
		min: 0, max: 50, step: 0.1,
		format: v => v.toFixed(1), pxPerStep: 8,
	});
	const doseStepper = createStepper(form, {
		label: '원두량', initial: sel.dose ?? 0,
		min: 0, max: 100, step: 0.1,
		format: v => `${v.toFixed(1)}g`, pxPerStep: 8,
	});

	const applyLastRecord = (record: BrewRecord) => {
		grindStepper.setValue(record.grindSize);
		doseStepper.setValue(record.dose);
		if (record.method === 'filter') {
			waterTempStepper?.setValue(record.waterTemp);
		}
		sel.lastRecord = record;
		sel.grindSize = record.grindSize;
		sel.dose = record.dose;
		if (record.method === 'filter') {
			sel.waterTemp = record.waterTemp;
		}
	};

	if (isFilter) {
		waterTempStepper = createStepper(form, {
			label: '물 온도', initial: sel.waterTemp ?? 93,
			min: 0, max: 100, step: 1,
			format: v => `${v}°C`, pxPerStep: 8,
		});

		filterSelect!.addEventListener('change', async () => {
			const record = await ctx.plugin.recordService.getLastRecord(
				sel.bean!.name, sel.method!, sel.temp!, filterSelect!.value,
			);
			updateCard(record);
			if (record) applyLastRecord(record);
		});
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
			grindSize: grindStepper.getValue(),
			dose: doseStepper.getValue(),
		};
		if (isFilter) {
			vars.waterTemp = waterTempStepper!.getValue();
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

	let chart: BrewProfileChart | null = null;
	const hasProfile = ctx.recorder.getPoints().length > 0;

	if (ctx.brewingStarted && scaleConnected) {
		const chartContainer = container.createDiv({ cls: 'brew-profile-container' });
		chart = new BrewProfileChart(chartContainer);
		chart.startLive(ctx.recorder);
	} else if (!ctx.brewingStarted && hasProfile) {
		const chartWrapper = container.createDiv({ cls: 'brew-profile-wrapper' });
		const expandBtn = chartWrapper.createEl('button', { text: '⛶', cls: 'brew-profile-expand-btn' });
		expandBtn.setAttribute('aria-label', '확대');
		expandBtn.addEventListener('click', () => {
			const pts = ctx.recorder.getPoints();
			const bean = ctx.flowState.selection.bean ?? '';
			new BrewProfileModal(ctx.plugin.app, bean, pts).open();
		});
		const chartContainer = chartWrapper.createDiv({ cls: 'brew-profile-container' });
		const staticChart = new BrewProfileChart(chartContainer);
		staticChart.renderStatic(ctx.recorder.getPoints());
	}

	if (ctx.brewingStarted) {
		const controls = container.createDiv({ cls: 'brewing-controls' });
		const stopBtn = controls.createEl('button', { text: '완료', cls: 'brewing-ctrl-btn brew-flow-stop-btn' });
		stopBtn.addEventListener('click', async () => {
			if (chart) chart.stopLive();
			if (scaleConnected) {
				ctx.recorder.stop();
				await ctx.timerController.freeze();
				const totalSeconds = ctx.timerController.getElapsedSeconds();
				const yieldGrams = parseFloat(ctx.getWeightText()) || undefined;
				ctx.flowState.finishBrewing(totalSeconds || undefined, yieldGrams);
			} else {
				ctx.flowState.finishBrewing(undefined, undefined);
			}
			ctx.setBrewingStarted(false);
			ctx.expandStep('saving');
			ctx.updateAccordion();
		});
	} else if (!hasProfile) {
		const controls = container.createDiv({ cls: 'brewing-controls' });
		const startBtn = controls.createEl('button', { text: '브루잉 시작', cls: 'brewing-ctrl-btn brew-flow-start-btn' });
		startBtn.addEventListener('click', async () => {
			ctx.setBrewingStarted(true);
			if (scaleConnected) {
				ctx.recorder.start();
				await ctx.timerController.handleTimerClick();
			}
			ctx.updateAccordion();
		});
	}
}

function renderSaving(container: HTMLElement, ctx: StepRenderContext): void {
	container.addClass('brew-flow-saving');
	const sel = ctx.flowState.selection;

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
	noteEl.placeholder = '';

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
	const doneBtn = btnRow.createEl('button', { text: '저장', cls: 'brewing-ctrl-btn brew-flow-save-btn' });

	doneBtn.addEventListener('click', async () => {
		doneBtn.disabled = true;
		doneBtn.textContent = '저장 중...';
		try {
			const note = noteEl.value.trim() || undefined;
			const points = ctx.recorder.getPoints();
			let profilePath: string | undefined;
			if (points.length > 0) {
				const timestamp = new Date().toISOString();
				profilePath = await ctx.profileStorage.save(timestamp, points);
			}
			const record = ctx.flowState.buildRecord(note, profilePath);
			await ctx.plugin.recordService.add(record);
			new Notice('저장 완료');
			ctx.resetFlow();
		} catch (err) {
			console.error('Brew record save failed:', err);
			new Notice('저장 실패');
			doneBtn.disabled = false;
			doneBtn.textContent = '저장';
		}
	});
}
