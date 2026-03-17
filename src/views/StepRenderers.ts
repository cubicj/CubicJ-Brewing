import type CubicJBrewingPlugin from '../main';
import type { BrewFlowState } from '../brew/BrewFlowState';
import type {
	BrewMethod,
	BrewTemp,
	EspressoDrink,
	BrewFlowSelection,
	BrewRecord,
	GrinderConfig,
	EquipmentSettings,
} from '../brew/types';
import type { TimerController } from './TimerController';
import { formatTimer } from './TimerController';
import type { BrewProfileRecorder } from './BrewProfileRecorder';
import type { BrewProfileStorage } from '../services/BrewProfileStorage';
import { estimateYield } from '../brew/yieldEstimator';
import { BrewProfileChart } from './BrewProfileChart';
import { BrewProfileModal } from './BrewProfileModal';
import { createStepper } from './Stepper';
import { Notice } from 'obsidian';
import { getDrinkLabel, getMethodLabel, getTempLabel, calcRoastDays } from '../brew/constants';
import { t } from '../i18n/index';
import { createToggleGroup, createSelectField, attachScaleAutoBtn, createAccessoryChecklist } from './FormHelpers';

export type FlowStep = 'method' | 'bean' | 'configure' | 'brewing' | 'saving';

export const STEP_CONFIG: Array<{ step: FlowStep; label: () => string }> = [
	{ step: 'method', label: () => t('brew.step.method') },
	{ step: 'bean', label: () => t('brew.step.bean') },
	{ step: 'configure', label: () => t('brew.step.variables') },
	{ step: 'brewing', label: () => t('brew.step.brewing') },
	{ step: 'saving', label: () => t('brew.step.memo') },
];

export const STEP_ORDER: FlowStep[] = STEP_CONFIG.map((c) => c.step);

export interface AccordionActions {
	update: () => void;
	expand: (step: FlowStep) => void;
	animateContentChange: (step: FlowStep, fn: () => void) => void;
	updateSummaries: () => void;
}

export interface StepRenderContext {
	flowState: BrewFlowState;
	plugin: CubicJBrewingPlugin;
	renderContent: () => void;
	accordion: AccordionActions;
	timerController: TimerController;
	getWeightText: () => string;
	resetFlow: () => void;
	recorder: BrewProfileRecorder;
	profileStorage: BrewProfileStorage;
	equipment: EquipmentSettings;
	brewingStarted: boolean;
}

let activeSavingRo: ResizeObserver | null = null;

export function cleanupSavingRo(): void {
	if (activeSavingRo) {
		activeSavingRo.disconnect();
		activeSavingRo = null;
	}
}

export function renderStep(step: FlowStep, container: HTMLElement, ctx: StepRenderContext): void {
	switch (step) {
		case 'method':
			renderMethod(container, ctx);
			break;
		case 'bean':
			renderBean(container, ctx);
			break;
		case 'configure':
			renderConfigure(container, ctx);
			break;
		case 'brewing':
			renderBrewing(container, ctx);
			break;
		case 'saving':
			renderSaving(container, ctx);
			break;
	}
}

export function getStepSummary(step: FlowStep, sel: BrewFlowSelection): string {
	switch (step) {
		case 'method': {
			if (!sel.method) return '';
			const parts = [getMethodLabel(sel.method), getTempLabel(sel.temp!)];
			if (sel.drink) parts.push(getDrinkLabel(sel.drink));
			return parts.join(' · ');
		}
		case 'bean': {
			if (!sel.bean) return '';
			const parts = [sel.bean.name];
			const days = calcRoastDays(sel.bean.roastDate);
			if (days != null && days >= 0) parts.push(t('bean.roastDays', { n: days }));
			return parts.join(' · ');
		}
		case 'configure': {
			if (sel.grindSize == null) return '';
			const fmt = (v: number) => parseFloat(v.toFixed(2));
			const parts: string[] = [
				`${t('summary.grindSize')} ${fmt(sel.grindSize!)}`,
				`${t('summary.dose')} ${fmt(sel.dose!)}g`,
			];
			if (sel.method === 'filter' && sel.waterTemp) parts.push(`${sel.waterTemp}°C`);
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

	createToggleGroup(
		container,
		[
			{ value: 'filter' as BrewMethod, label: getMethodLabel('filter') },
			{ value: 'espresso' as BrewMethod, label: getMethodLabel('espresso') },
		],
		selectedMethod,
		(val) => {
			selectedMethod = val;
			const show = selectedMethod === 'espresso';
			if (!show) selectedDrink = null;
			ctx.accordion.animateContentChange('method', () => {
				drinkRow.style.display = show ? '' : 'none';
			});
			syncSelection();
			tryAdvance();
		},
	);

	container.createEl('h4', { text: t('form.temperature') });
	createToggleGroup(
		container,
		[
			{ value: 'hot' as BrewTemp, label: getTempLabel('hot') },
			{ value: 'iced' as BrewTemp, label: getTempLabel('iced') },
		],
		selectedTemp,
		(val) => {
			selectedTemp = val;
			syncSelection();
			tryAdvance();
		},
	);

	const drinkRow = container.createDiv({ cls: 'brew-flow-drink-row' });
	drinkRow.style.display = selectedMethod === 'espresso' ? '' : 'none';
	drinkRow.createEl('h4', { text: t('form.drink') });
	createToggleGroup(
		drinkRow,
		[
			{ value: 'shot' as EspressoDrink, label: getDrinkLabel('shot') },
			{ value: 'americano' as EspressoDrink, label: getDrinkLabel('americano') },
			{ value: 'latte' as EspressoDrink, label: getDrinkLabel('latte') },
		],
		selectedDrink,
		(val) => {
			selectedDrink = val;
			syncSelection();
			tryAdvance();
		},
	);

	const tryAdvance = async () => {
		try {
			const complete = !!selectedMethod && !!selectedTemp && (selectedMethod !== 'espresso' || !!selectedDrink);
			if (complete) {
				ctx.flowState.selectMethod(selectedMethod!, selectedTemp!, selectedDrink ?? undefined);
				const bean = ctx.flowState.selection.bean;
				if (bean) {
					const lastResult = await ctx.plugin.recordService.getLastRecord(bean.name, selectedMethod!, selectedTemp!);
					const lastRecord = lastResult.ok ? lastResult.data : undefined;
					ctx.flowState.selectBean(bean, lastRecord);
				}
				ctx.renderContent();
			} else if (ctx.flowState.step !== 'method') {
				ctx.flowState.goToStep('method');
				ctx.accordion.update();
			}
		} catch (e) {
			console.error('[CubicJ Brewing] tryAdvance failed:', e);
			new Notice(t('brew.unexpectedError'));
		}
	};
}

async function renderBean(container: HTMLElement, ctx: StepRenderContext): Promise<void> {
	container.addClass('brew-flow-bean');

	const beans = [...ctx.plugin.vaultData.getActiveBeans()].sort((a, b) => a.name.localeCompare(b.name));

	if (beans.length === 0) {
		container.createDiv({ cls: 'brew-flow-empty', text: t('bean.emptyState') });
		return;
	}

	const selectedBean = ctx.flowState.selection.bean;

	for (const bean of beans) {
		const isSelected = selectedBean?.name === bean.name;
		const item = container.createDiv({ cls: `brew-flow-bean-item${isSelected ? ' is-selected' : ''}` });
		item.createDiv({ text: bean.name });

		const days = ctx.plugin.vaultData.getDaysSinceRoast(bean);
		if (days !== null || bean.weight != null) {
			const parts: string[] = [];
			if (days !== null) parts.push(`${t('modal.roasting')} ${t('bean.roastDays', { n: days })}`);
			if (bean.weight != null) parts.push(t('bean.remaining', { weight: bean.weight }));
			item.createDiv({ cls: 'brew-flow-bean-meta', text: parts.join(' · ') });
		}

		item.addEventListener('click', async () => {
			try {
				if (isSelected) {
					ctx.flowState.deselectBean();
					ctx.accordion.update();
				} else {
					const lastResult = await ctx.plugin.recordService.getLastRecord(
						bean.name,
						ctx.flowState.selection.method!,
						ctx.flowState.selection.temp!,
					);
					const lastRecord = lastResult.ok ? lastResult.data : undefined;
					ctx.flowState.selectBean(bean, lastRecord);
					ctx.renderContent();
				}
			} catch (err) {
				console.error('[StepRenderers] bean select failed:', err);
			}
		});
	}
}

function grinderToStepperConfig(g: GrinderConfig) {
	const decimals = Math.max(0, -Math.floor(Math.log10(g.step)));
	return {
		step: g.step,
		min: g.min,
		max: g.max,
		format: (v: number) => v.toFixed(decimals),
	};
}

function renderConfigure(container: HTMLElement, ctx: StepRenderContext): void {
	container.addClass('brew-flow-configure');
	const sel = ctx.flowState.selection;
	const isFilter = sel.method === 'filter';
	const isEspresso = sel.method === 'espresso';
	const last = sel.lastRecord;

	const cardWrapper = container.createDiv();

	const updateCard = (record: BrewRecord | undefined) => {
		cardWrapper.empty();
		const card = cardWrapper.createDiv({ cls: 'brew-flow-last-record' });
		card.createDiv({ cls: 'brew-flow-last-record-title', text: t('brew.lastRecord') });
		if (!record) {
			card.createDiv({ cls: 'brew-flow-last-record-meta', text: '-' });
			return;
		}
		const parts: string[] = [];
		if (record.roastDays != null) parts.push(`${t('modal.roasting')} ${t('bean.roastDays', { n: record.roastDays })}`);
		parts.push(`${t('summary.grindSize')} ${record.grindSize}`, `${t('summary.dose')} ${record.dose}g`);
		if (record.method === 'filter') parts.push(`${t('summary.waterTemp')} ${record.waterTemp}°C`);
		if (record.method === 'espresso') parts.push(`${t('summary.basket')} ${record.basket}`);
		card.createDiv({ cls: 'brew-flow-last-record-meta', text: parts.join(' · ') });
		if (record.note) {
			card.createDiv({ cls: 'brew-flow-last-record-note', text: record.note });
		}
	};

	updateCard(last);

	const form = container.createDiv({ cls: 'brew-flow-form' });

	let filterSelect: HTMLSelectElement | null = null;
	let basketSelect: HTMLSelectElement | null = null;
	let dripperSelect: HTMLSelectElement | null = null;
	let waterTempStepper: ReturnType<typeof createStepper> | null = null;
	const syncSummary = () => ctx.accordion.updateSummaries();

	const queryAndApplyDials = async () => {
		const equip: { filter?: string; grinder?: string; dripper?: string } = {};
		if (sel.filter) equip.filter = sel.filter;
		if (sel.grinder) equip.grinder = sel.grinder;
		if (sel.dripper) equip.dripper = sel.dripper;
		const lastResult = await ctx.plugin.recordService.getLastRecord(sel.bean!.name, sel.method!, sel.temp!, equip);
		const record = lastResult.ok ? lastResult.data : undefined;
		sel.lastRecord = record;
		updateCard(record);
		if (record) applyDials(record);
	};

	if (isFilter) {
		const initFilter =
			sel.filter ??
			(last?.method === 'filter' && last.filter && ctx.equipment.filters.includes(last.filter)
				? last.filter
				: ctx.equipment.filters[0]);
		sel.filter = initFilter;
		filterSelect = createSelectField(form, t('equipment.filter'), ctx.equipment.filters, initFilter, (v) => {
			sel.filter = v;
			queryAndApplyDials();
		});

		const initDripper =
			sel.dripper ??
			(last?.method === 'filter' && last.dripper && ctx.equipment.drippers.includes(last.dripper)
				? last.dripper
				: ctx.equipment.drippers[0]);
		sel.dripper = initDripper;
		if (ctx.equipment.drippers.length > 0) {
			dripperSelect = createSelectField(form, t('equipment.dripper'), ctx.equipment.drippers, initDripper, (v) => {
				sel.dripper = v;
				queryAndApplyDials();
			});
		}
	}

	if (isEspresso) {
		basketSelect = createSelectField(
			form,
			t('equipment.basket'),
			ctx.equipment.baskets,
			sel.basket ?? ctx.equipment.baskets[0],
			(v) => {
				sel.basket = v;
				syncSummary();
			},
		);
	}

	let selectedGrinder: GrinderConfig | undefined;
	let grindStepperConfig = { step: 0.1, min: 0, max: 50, format: (v: number) => v.toFixed(1) };

	if (ctx.equipment.grinders.length > 0) {
		const initGrinderName =
			sel.grinder ??
			(last?.grinder && ctx.equipment.grinders.find((g) => g.name === last.grinder) ? last.grinder : undefined);
		if (initGrinderName) {
			selectedGrinder = ctx.equipment.grinders.find((g) => g.name === initGrinderName);
		}
		if (!selectedGrinder) {
			selectedGrinder = ctx.equipment.grinders[0];
		}
		sel.grinder = selectedGrinder.name;
		grindStepperConfig = grinderToStepperConfig(selectedGrinder);

		if (ctx.equipment.grinders.length > 1) {
			const grinderNames = ctx.equipment.grinders.map((g) => g.name);
			createSelectField(form, t('equipment.grinder'), grinderNames, selectedGrinder.name, (v) => {
				const g = ctx.equipment.grinders.find((gr) => gr.name === v)!;
				sel.grinder = g.name;
				grindStepperConfig = grinderToStepperConfig(g);
				grindStepper.destroy();
				grindStepper = createStepper(form, {
					label: t('form.grindSize'),
					initial: 0,
					...grindStepperConfig,
					pxPerStep: 12,
					onChange: grindOnChange,
				});
				form.insertBefore(grindStepper.el, doseStepper.el);
				queryAndApplyDials();
			});
		}
	}

	const grindOnChange = (v: number) => {
		sel.grindSize = v;
		syncSummary();
	};
	let grindStepper = createStepper(form, {
		label: t('form.grindSize'),
		initial: sel.grindSize ?? 0,
		...grindStepperConfig,
		pxPerStep: 12,
		onChange: grindOnChange,
	});
	const doseStepper = createStepper(form, {
		label: t('form.dose'),
		initial: sel.dose ?? 0,
		min: 0,
		max: 100,
		step: 0.1,
		format: (v) => `${v.toFixed(1)}g`,
		pxPerStep: 12,
		onChange: (v) => {
			sel.dose = v;
			syncSummary();
		},
	});

	attachScaleAutoBtn(doseStepper, ctx.getWeightText);

	const applyDials = (record: BrewRecord) => {
		sel.grindSize = record.grindSize;
		sel.dose = record.dose;
		if (record.method === 'filter') {
			sel.waterTemp = record.waterTemp;
		}
		grindStepper.setValue(record.grindSize, true);
		doseStepper.setValue(record.dose, true);
		if (record.method === 'filter') {
			waterTempStepper?.setValue(record.waterTemp, true);
		}
		syncSummary();
	};

	if (isFilter) {
		waterTempStepper = createStepper(form, {
			label: t('form.waterTemp'),
			initial: sel.waterTemp ?? 93,
			min: 0,
			max: 100,
			step: 1,
			format: (v) => `${v}°C`,
			pxPerStep: 12,
			onChange: (v) => {
				sel.waterTemp = v;
				syncSummary();
			},
		});
	}

	if (isEspresso && ctx.equipment.accessories.length > 0) {
		createAccessoryChecklist(form, ctx.equipment.accessories, sel.accessories ?? [], (list) => {
			sel.accessories = list.length > 0 ? list : undefined;
		});
	}

	const recipes = ctx.plugin.vaultData.getAllRecipes();
	if (recipes.length > 0) {
		const recipeGroup = container.createDiv({ cls: 'brew-flow-recipe-select' });
		recipeGroup.createEl('label', { text: t('brew.recipe') });
		const recipeSelect = recipeGroup.createEl('select');
		recipeSelect.createEl('option', { text: t('brew.noRecipe'), value: '' });
		for (const r of recipes) {
			recipeSelect.createEl('option', { text: r.name, value: r.path });
		}
		recipeSelect.addEventListener('change', () => {
			const recipe = recipes.find((r) => r.path === recipeSelect.value);
			if (recipe) ctx.flowState.selectRecipe(recipe);
		});
	}

	const completeBtn = container.createEl('button', { text: t('brew.settingsDone'), cls: 'brew-flow-start-btn' });
	completeBtn.addEventListener('click', () => {
		const vars: Partial<BrewFlowSelection> = {
			grindSize: grindStepper.getValue(),
			dose: doseStepper.getValue(),
			grinder: sel.grinder,
		};
		if (isFilter) {
			vars.waterTemp = waterTempStepper!.getValue();
			vars.filter = filterSelect!.value;
			vars.dripper = dripperSelect?.value;
		}
		if (isEspresso) {
			vars.basket = basketSelect!.value;
			vars.accessories = sel.accessories;
		}
		ctx.flowState.updateVariables(vars);
		ctx.flowState.startBrewing();
		ctx.renderContent();
	});
}

function renderBrewing(container: HTMLElement, ctx: StepRenderContext): void {
	container.addClass('brew-flow-active-brew');
	const isEspresso = ctx.flowState.selection.method === 'espresso';
	const scaleConnected = ctx.plugin.acaiaService?.state === 'connected';

	if (isEspresso) {
		container.createDiv({ cls: 'brew-flow-espresso-msg', text: t('brew.espressoMsg') });
		const controls = container.createDiv({ cls: 'brewing-controls' });
		const doneBtn = controls.createEl('button', {
			text: t('brew.extractionDone'),
			cls: 'brewing-ctrl-btn brew-flow-stop-btn',
		});
		doneBtn.addEventListener('click', () => {
			ctx.flowState.finishBrewing(undefined, undefined);
			ctx.brewingStarted = false;
			ctx.accordion.expand('saving');
			ctx.accordion.update();
		});
		return;
	}

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
		expandBtn.setAttribute('aria-label', t('brew.expand'));
		expandBtn.addEventListener('click', () => {
			const pts = ctx.recorder.getPoints();
			const bean = ctx.flowState.selection.bean?.name ?? '';
			new BrewProfileModal(ctx.plugin.app, bean, { type: 'expand', points: pts }).open();
		});
		const chartContainer = chartWrapper.createDiv({ cls: 'brew-profile-container' });
		const staticChart = new BrewProfileChart(chartContainer);
		staticChart.renderStatic(ctx.recorder.getPoints());
	}

	if (ctx.brewingStarted) {
		const controls = container.createDiv({ cls: 'brewing-controls' });
		const stopBtn = controls.createEl('button', { text: t('brew.done'), cls: 'brewing-ctrl-btn brew-flow-stop-btn' });
		stopBtn.addEventListener('click', async () => {
			try {
				if (chart) chart.stopLive();
				if (scaleConnected) {
					ctx.recorder.stop();
					await ctx.timerController.freeze();
					const totalSeconds = ctx.timerController.getElapsedSeconds();
					const yieldGrams =
						(ctx.flowState.selection.method === 'filter' ? estimateYield(ctx.recorder.getPoints()) : undefined) ??
						(parseFloat(ctx.getWeightText()) || undefined);
					ctx.flowState.finishBrewing(totalSeconds || undefined, yieldGrams);
				} else {
					ctx.flowState.finishBrewing(undefined, undefined);
				}
				ctx.brewingStarted = false;
				ctx.accordion.expand('saving');
				ctx.accordion.update();
			} catch (err) {
				console.error('[StepRenderers] brew stop failed:', err);
			}
		});
	} else if (!hasProfile) {
		const controls = container.createDiv({ cls: 'brewing-controls' });
		const startBtn = controls.createEl('button', {
			text: t('brew.startBrewing'),
			cls: 'brewing-ctrl-btn brew-flow-start-btn',
		});
		startBtn.addEventListener('click', async () => {
			try {
				ctx.brewingStarted = true;
				if (scaleConnected) {
					ctx.recorder.start();
					await ctx.timerController.handleTimerClick();
				}
				ctx.accordion.update();
			} catch (err) {
				console.error('[StepRenderers] brew start failed:', err);
			}
		});
	}
}

function renderSaving(container: HTMLElement, ctx: StepRenderContext): void {
	container.addClass('brew-flow-saving');
	const sel = ctx.flowState.selection;

	if (!sel.time && sel.method === 'espresso') {
		const manualForm = container.createDiv({ cls: 'brew-flow-form' });
		createStepper(manualForm, {
			label: t('modal.time'),
			initial: 0,
			min: 0,
			max: 120,
			step: 1,
			format: (v) => t('modal.seconds', { n: v }),
			pxPerStep: 6,
			onChange: (v) => {
				ctx.flowState.updateVariables({ time: v || undefined });
			},
		});
		createStepper(manualForm, {
			label: t('modal.extractionYield'),
			initial: 0,
			min: 0,
			max: 200,
			step: 0.1,
			format: (v) => `${v.toFixed(1)}g`,
			pxPerStep: 12,
			onChange: (v) => {
				ctx.flowState.updateVariables({ yield: v || undefined });
			},
		});
	}

	const needsWater = sel.method === 'filter' || (sel.method === 'espresso' && sel.drink === 'americano');
	const needsMilk = sel.method === 'espresso' && sel.drink === 'latte';
	if (needsWater || needsMilk) {
		const weightForm = container.createDiv({ cls: 'brew-flow-form' });
		const label = needsMilk ? t('form.milk') : t('form.addition');
		const weightStepper = createStepper(weightForm, {
			label,
			initial: 0,
			min: 0,
			max: 1000,
			step: 0.1,
			format: (v) => `${v.toFixed(1)}g`,
			pxPerStep: 12,
			onChange: (v) => {
				if (needsMilk) sel.milkWeight = v;
				else sel.waterWeight = v;
			},
		});
		attachScaleAutoBtn(weightStepper, ctx.getWeightText);
	}

	container.createEl('h4', { text: t('form.memo'), cls: 'brew-flow-section-label' });
	const noteEl = container.createEl('textarea', { cls: 'brew-flow-note', attr: { spellcheck: 'false' } });
	noteEl.placeholder = '';
	if (sel.note) noteEl.value = sel.note;
	noteEl.addEventListener('input', () => {
		sel.note = noteEl.value;
	});

	cleanupSavingRo();
	let roReady = false;
	activeSavingRo = new ResizeObserver(() => {
		if (!roReady) {
			roReady = true;
			return;
		}
		const body = noteEl.closest('.brew-accordion-body') as HTMLElement | null;
		if (body?.classList.contains('is-open') && body.style.maxHeight !== '0px') {
			body.style.transition = 'none';
			body.style.maxHeight = body.scrollHeight + 'px';
			void body.offsetHeight;
			body.style.transition = '';
		}
	});
	activeSavingRo.observe(noteEl);

	const btnRow = container.createDiv({ cls: 'brewing-controls' });
	const doneBtn = btnRow.createEl('button', { text: t('form.save'), cls: 'brewing-ctrl-btn brew-flow-save-btn' });

	doneBtn.addEventListener('click', async () => {
		doneBtn.disabled = true;
		doneBtn.textContent = t('brew.saving');
		try {
			const note = noteEl.value.trim() || undefined;
			const points = ctx.recorder.getPoints();
			let profilePath: string | undefined;
			if (points.length > 0) {
				const timestamp = new Date().toISOString();
				const saveResult = await ctx.profileStorage.save(timestamp, points);
				if (!saveResult.ok) throw new Error(saveResult.error.message);
				profilePath = saveResult.data;
			}
			const record = ctx.flowState.buildRecord(note, profilePath);
			const addResult = await ctx.plugin.recordService.add(record);
			if (!addResult.ok) throw new Error(addResult.error.message);
			ctx.plugin.pluginLogger?.log('FLOW', `record saved — ${record.method} ${record.bean}`);
			const bean = ctx.flowState.selection.bean;
			if (bean?.weight != null) {
				const newWeight = Math.max(0, Math.round((bean.weight - record.dose) * 10) / 10);
				await ctx.plugin.vaultData.setWeight(bean.path, newWeight);
				bean.weight = newWeight;
			}
			new Notice(t('brew.saved'));
			ctx.resetFlow();
		} catch (err) {
			ctx.plugin.pluginLogger?.log('FLOW', `record save failed: ${err}`);
			new Notice(t('brew.saveFailed'));
			doneBtn.disabled = false;
			doneBtn.textContent = t('form.save');
		}
	});
}
