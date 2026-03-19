import type { BrewFlowSelection, BrewRecord, GrinderConfig, EspressoDrink } from '../../brew/types';
import { t } from '../../i18n/index';
import { createStepper } from '../Stepper';
import { createSelectField, attachScaleAutoBtn, createAccessoryChecklist } from '../FormHelpers';
import type { StepRenderContext } from '../StepRenderers';

function grinderToStepperConfig(g: GrinderConfig) {
	const decimals = Math.max(0, -Math.floor(Math.log10(g.step)));
	return {
		step: g.step,
		min: g.min,
		max: g.max,
		format: (v: number) => v.toFixed(decimals),
	};
}

function resolveEquipmentDefault(
	current: string | undefined,
	last: BrewRecord | undefined,
	method: string,
	items: string[],
	lastKey: 'filter' | 'dripper' | 'basket',
): string | undefined {
	if (current) return current;
	if (
		last?.method === method &&
		last[lastKey as keyof typeof last] &&
		items.includes(last[lastKey as keyof typeof last] as string)
	)
		return last[lastKey as keyof typeof last] as string;
	return items[0];
}

function renderLastRecordCard(
	container: HTMLElement,
	initial: BrewRecord | undefined,
): (record: BrewRecord | undefined) => void {
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

	updateCard(initial);
	return updateCard;
}

interface EquipmentSelectRefs {
	filterSelect: HTMLSelectElement | null;
	dripperSelect: HTMLSelectElement | null;
	basketSelect: HTMLSelectElement | null;
}

function renderEquipmentSelects(
	form: HTMLElement,
	sel: BrewFlowSelection,
	ctx: StepRenderContext,
	queryAndApplyDials: () => void,
): EquipmentSelectRefs {
	const refs: EquipmentSelectRefs = { filterSelect: null, dripperSelect: null, basketSelect: null };
	const last = sel.lastRecord;

	if (sel.method === 'filter') {
		sel.filter = resolveEquipmentDefault(sel.filter, last, 'filter', ctx.equipment.filters, 'filter');
		refs.filterSelect = createSelectField(form, t('equipment.filter'), ctx.equipment.filters, sel.filter!, (v) => {
			sel.filter = v;
			queryAndApplyDials();
		});

		sel.dripper = resolveEquipmentDefault(sel.dripper, last, 'filter', ctx.equipment.drippers, 'dripper');
		if (ctx.equipment.drippers.length > 0) {
			refs.dripperSelect = createSelectField(
				form,
				t('equipment.dripper'),
				ctx.equipment.drippers,
				sel.dripper!,
				(v) => {
					sel.dripper = v;
					queryAndApplyDials();
				},
			);
		}
	}

	if (sel.method === 'espresso') {
		sel.basket = resolveEquipmentDefault(sel.basket, last, 'espresso', ctx.equipment.baskets, 'basket');
		refs.basketSelect = createSelectField(form, t('equipment.basket'), ctx.equipment.baskets, sel.basket!, (v) => {
			sel.basket = v;
			queryAndApplyDials();
		});
	}

	return refs;
}

function renderRecipeSelect(container: HTMLElement, ctx: StepRenderContext): void {
	const recipes = ctx.plugin.vaultData.getAllRecipes();
	if (recipes.length === 0) return;

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

export function renderConfigure(container: HTMLElement, ctx: StepRenderContext): void {
	container.addClass('brew-flow-configure');
	const sel = ctx.flowState.selection;
	const isFilter = sel.method === 'filter';
	const isEspresso = sel.method === 'espresso';
	const syncSummary = () => ctx.accordion.updateSummaries();

	const updateCard = renderLastRecordCard(container, sel.lastRecord);

	const form = container.createDiv({ cls: 'brew-flow-form' });

	let grindStepperConfig = { step: 0.1, min: 0, max: 50, format: (v: number) => v.toFixed(1) };
	let selectedGrinder: GrinderConfig | undefined;

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

	const queryAndApplyDials = async () => {
		const equip: { filter?: string; grinder?: string; dripper?: string; basket?: string; drink?: EspressoDrink } = {};
		if (sel.drink) equip.drink = sel.drink;
		if (sel.filter) equip.filter = sel.filter;
		if (sel.grinder) equip.grinder = sel.grinder;
		if (sel.dripper) equip.dripper = sel.dripper;
		if (sel.basket) equip.basket = sel.basket;
		const lastResult = await ctx.plugin.recordService.getLastRecord(sel.bean!.name, sel.method!, sel.temp!, equip);
		const record = lastResult.ok ? lastResult.data : undefined;
		sel.lastRecord = record;
		updateCard(record);
		if (record) applyDials(record);
	};

	const equipRefs = renderEquipmentSelects(form, sel, ctx, queryAndApplyDials);
	let waterTempStepper: ReturnType<typeof createStepper> | null = null;

	if (ctx.equipment.grinders.length > 0) {
		const last = sel.lastRecord;
		const initGrinderName =
			sel.grinder ??
			(last?.grinder && ctx.equipment.grinders.find((g) => g.name === last.grinder) ? last.grinder : undefined);
		selectedGrinder = ctx.equipment.grinders.find((g) => g.name === initGrinderName) ?? ctx.equipment.grinders[0];
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

	renderRecipeSelect(container, ctx);

	const completeBtn = container.createEl('button', { text: t('brew.settingsDone'), cls: 'brew-flow-start-btn' });
	completeBtn.addEventListener('click', () => {
		const vars: Partial<BrewFlowSelection> = {
			grindSize: grindStepper.getValue(),
			dose: doseStepper.getValue(),
			grinder: sel.grinder,
		};
		if (isFilter) {
			vars.waterTemp = waterTempStepper!.getValue();
			vars.filter = equipRefs.filterSelect!.value;
			vars.dripper = equipRefs.dripperSelect?.value;
		}
		if (isEspresso) {
			vars.basket = equipRefs.basketSelect!.value;
			vars.accessories = sel.accessories;
		}
		ctx.flowState.updateVariables(vars);
		ctx.flowState.startBrewing();
		ctx.renderContent();
	});
}
