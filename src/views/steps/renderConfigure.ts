import type { BrewFlowSelection, BrewRecord, GrinderConfig } from '../../brew/types';
import { t } from '../../i18n/index';
import { createStepper } from '../Stepper';
import { createSelectField, attachScaleAutoBtn, createAccessoryChecklist } from '../FormHelpers';
import type { StepRenderContext } from '../StepRenderers';
import { getLooseLastRecord, getStrictMatchingRecords } from './configure/ConfigureRecords';
import { renderLastRecordCard } from './configure/LastRecordCard';

function grinderToStepperConfig(g: GrinderConfig) {
	const decimals = Math.max(0, -Math.floor(Math.log10(g.step)));
	return {
		step: g.step,
		min: g.min,
		max: g.max,
		format: (v: number) => v.toFixed(decimals),
	};
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

	if (sel.method === 'filter') {
		sel.filter = sel.filter ?? ctx.equipment.filters[0];
		refs.filterSelect = createSelectField(form, t('equipment.filter'), ctx.equipment.filters, sel.filter!, (v) => {
			sel.filter = v;
			queryAndApplyDials();
		});

		sel.dripper = sel.dripper ?? ctx.equipment.drippers[0];
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
		sel.basket = sel.basket ?? ctx.equipment.baskets[0];
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

function applyRecordToEquipment(record: BrewRecord, sel: BrewFlowSelection, equipRefs: EquipmentSelectRefs) {
	if (record.method === 'filter') {
		if (record.filter && equipRefs.filterSelect) {
			sel.filter = record.filter;
			equipRefs.filterSelect.value = record.filter;
		}
		if (record.dripper && equipRefs.dripperSelect) {
			sel.dripper = record.dripper;
			equipRefs.dripperSelect.value = record.dripper;
		}
	}
	if (record.method === 'espresso' && record.basket && equipRefs.basketSelect) {
		sel.basket = record.basket;
		equipRefs.basketSelect.value = record.basket;
	}
}

export function renderConfigure(container: HTMLElement, ctx: StepRenderContext): void {
	container.addClass('brew-flow-configure');
	const sel = ctx.flowState.selection;
	const isFilter = sel.method === 'filter';
	const isEspresso = sel.method === 'espresso';
	const syncSummary = () => ctx.accordion.updateSummaries();

	let records: BrewRecord[] = [];
	let recordIndex = 0;

	const onNavigate = (newIndex: number) => {
		if (newIndex < 0 || newIndex >= records.length) return;
		recordIndex = newIndex;
		const record = records[newIndex];
		cardControls.updateCard(record);
		cardControls.updateNav(newIndex, records.length);
		if (record) applyDials(record);
	};
	const cardControls = renderLastRecordCard(container, onNavigate, () => ({
		index: recordIndex,
		total: records.length,
	}));
	cardControls.updateCard(undefined);
	cardControls.updateNav(0, 0);

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
		if (record.method === 'espresso') {
			sel.accessories = record.accessories;
			renderAccessories();
		}
		syncSummary();
	};

	const fetchFilteredRecords = async () => {
		records = await getStrictMatchingRecords(ctx.plugin.recordService, sel);
		recordIndex = 0;
		const record = records[0];
		cardControls.updateCard(record);
		cardControls.updateNav(0, records.length);
	};
	const queryAndApplyDials = async () => {
		await fetchFilteredRecords();
		if (records[0]) applyDials(records[0]);
	};

	const equipRefs = renderEquipmentSelects(form, sel, ctx, () => queryAndApplyDials());
	let waterTempStepper: ReturnType<typeof createStepper> | null = null;

	if (ctx.equipment.grinders.length > 0) {
		const initGrinderName = sel.grinder ?? ctx.equipment.grinders[0]?.name;
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

	let accessoryContainer: HTMLElement | null = null;
	const renderAccessories = () => {
		if (!isEspresso || ctx.equipment.accessories.length === 0) return;
		if (!accessoryContainer) {
			accessoryContainer = form.createDiv();
		} else {
			accessoryContainer.empty();
		}
		createAccessoryChecklist(accessoryContainer, ctx.equipment.accessories, sel.accessories ?? [], (list) => {
			sel.accessories = list.length > 0 ? list : undefined;
		});
	};
	renderAccessories();

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

	const initFromRecords = async () => {
		const lastRecord = await getLooseLastRecord(ctx.plugin.recordService, sel);

		if (lastRecord) {
			applyRecordToEquipment(lastRecord, sel, equipRefs);
			if (lastRecord.grinder) {
				const g = ctx.equipment.grinders.find((gr) => gr.name === lastRecord.grinder);
				if (g) sel.grinder = g.name;
			}
			if (lastRecord.method === 'espresso' && lastRecord.accessories) {
				sel.accessories = lastRecord.accessories;
				renderAccessories();
			}
			applyDials(lastRecord);
			cardControls.updateCard(lastRecord);
			cardControls.updateNav(0, 1);
		}

		await fetchFilteredRecords();
	};
	initFromRecords().catch(() => {});
}
