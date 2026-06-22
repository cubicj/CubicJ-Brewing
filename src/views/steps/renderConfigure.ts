import type { BrewFlowSelection, BrewRecord, GrinderConfig } from '../../brew/types';
import { t } from '../../i18n/index';
import type { StepRenderContext } from '../StepRenderers';
import { getLooseLastRecord, getStrictMatchingRecords } from './configure/ConfigureRecords';
import { renderConfigureDials } from './configure/ConfigureDials';
import { applyRecordToEquipment, renderEquipmentFields } from './configure/EquipmentFields';
import { renderLastRecordCard } from './configure/LastRecordCard';
import { renderRecipeSelect } from './configure/RecipeField';

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
		if (record) dialControls.applyRecord(record);
	};
	const cardControls = renderLastRecordCard(container, onNavigate, () => ({
		index: recordIndex,
		total: records.length,
	}));
	cardControls.updateCard(undefined);
	cardControls.updateNav(0, 0);

	const form = container.createDiv({ cls: 'brew-flow-form' });

	const fetchFilteredRecords = async () => {
		records = await getStrictMatchingRecords(ctx.plugin.recordService, sel);
		recordIndex = 0;
		const record = records[0];
		cardControls.updateCard(record);
		cardControls.updateNav(0, records.length);
	};
	const queryAndApplyDials = async () => {
		await fetchFilteredRecords();
		if (records[0]) dialControls.applyRecord(records[0]);
	};

	const handleEquipmentChange = () => queryAndApplyDials();
	const handleGrinderChange = (grinder: GrinderConfig) => {
		dialControls.rebuildGrindStepper(grinder);
	};

	const equipmentControls = renderEquipmentFields(form, sel, ctx.equipment, handleEquipmentChange, handleGrinderChange);
	const equipRefs = equipmentControls.refs;
	const dialControls = renderConfigureDials(
		form,
		sel,
		ctx.equipment,
		equipmentControls.selectedGrinder,
		ctx.getWeightText,
		syncSummary,
	);

	renderRecipeSelect(container, ctx.plugin, ctx.flowState);

	const completeBtn = container.createEl('button', { text: t('brew.settingsDone'), cls: 'brew-flow-start-btn' });
	completeBtn.addEventListener('click', () => {
		const dialValues = dialControls.readValues();
		const vars: Partial<BrewFlowSelection> = {
			grindSize: dialValues.grindSize,
			dose: dialValues.dose,
			grinder: sel.grinder,
		};
		if (isFilter) {
			vars.waterTemp = dialValues.waterTemp;
			vars.filter = equipRefs.filterSelect!.value;
			vars.dripper = equipRefs.dripperSelect?.value;
		}
		if (isEspresso) {
			vars.basket = equipRefs.basketSelect!.value;
			vars.accessories = dialValues.accessories;
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
			}
			dialControls.applyRecord(lastRecord);
			cardControls.updateCard(lastRecord);
			cardControls.updateNav(0, 1);
		}

		await fetchFilteredRecords();
	};
	initFromRecords().catch(() => {});
}
