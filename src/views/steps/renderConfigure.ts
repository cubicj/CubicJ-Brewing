import type { BrewFlowSelection, BrewRecord, GrinderConfig } from '../../brew/types';
import { t } from '../../i18n/index';
import { createStepper } from '../Stepper';
import { attachScaleAutoBtn, createAccessoryChecklist } from '../FormHelpers';
import type { StepRenderContext } from '../StepRenderers';
import { getLooseLastRecord, getStrictMatchingRecords } from './configure/ConfigureRecords';
import { applyRecordToEquipment, renderEquipmentFields } from './configure/EquipmentFields';
import { renderLastRecordCard } from './configure/LastRecordCard';
import { renderRecipeSelect } from './configure/RecipeField';

function grinderToStepperConfig(g: GrinderConfig) {
	const decimals = Math.max(0, -Math.floor(Math.log10(g.step)));
	return {
		step: g.step,
		min: g.min,
		max: g.max,
		format: (v: number) => v.toFixed(decimals),
	};
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

	let waterTempStepper: ReturnType<typeof createStepper> | null = null;

	const equipmentControls = renderEquipmentFields(
		form,
		sel,
		ctx.equipment,
		() => queryAndApplyDials(),
		(grinder) => {
			grindStepperConfig = grinderToStepperConfig(grinder);
			grindStepper.destroy();
			grindStepper = createStepper(form, {
				label: t('form.grindSize'),
				initial: 0,
				...grindStepperConfig,
				pxPerStep: 12,
				onChange: grindOnChange,
			});
			form.insertBefore(grindStepper.el, doseStepper.el);
		},
	);
	const equipRefs = equipmentControls.refs;
	if (equipmentControls.selectedGrinder) {
		grindStepperConfig = grinderToStepperConfig(equipmentControls.selectedGrinder);
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

	renderRecipeSelect(container, ctx.plugin, ctx.flowState);

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
