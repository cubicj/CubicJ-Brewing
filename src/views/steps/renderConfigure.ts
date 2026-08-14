import type { BrewFlowSelection, BrewRecord, GrinderConfig } from '../../brew/types';
import { t } from '../../i18n/index';
import type { StepRenderContext } from '../StepRenderers';
import {
	buildConfigureSetupKey,
	findNewestApplicableRecord,
	getDefaultConfigureSelection,
	getDefaultDialValues,
	shouldInitializeConfigure,
} from './configure/ConfigureInitialization';
import { getLooseMatchingRecords, getStrictMatchingRecords } from './configure/ConfigureRecords';
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
	let equipmentQueryToken = 0;
	let isRenderAlive = true;
	ctx.registerCleanup(() => {
		isRenderAlive = false;
		equipmentQueryToken += 1;
	});

	const onNavigate = (newIndex: number) => {
		if (!isRenderAlive) return;
		if (newIndex < 0 || newIndex >= records.length) return;
		const record = records[newIndex];
		if (!record) return;
		recordIndex = newIndex;
		cardControls.updateCard(record);
		cardControls.updateNav(newIndex, records.length);
		applyRecordSelection(record);
	};
	const cardControls = renderLastRecordCard(container, onNavigate, () => ({
		index: recordIndex,
		total: records.length,
	}));
	cardControls.updateCard(undefined);
	cardControls.updateNav(0, 0);

	const form = container.createDiv({ cls: 'brew-flow-form' });

	const getSelectedEquipmentKey = () =>
		[sel.grinder ?? '', sel.filter ?? '', sel.dripper ?? '', sel.basket ?? ''].join('|');
	const refreshFilteredRecords = (nextRecords: BrewRecord[]) => {
		if (!isRenderAlive) return;
		records = nextRecords.filter((record) => findNewestApplicableRecord([record], ctx.equipment));
		recordIndex = 0;
		const record = findNewestApplicableRecord(records, ctx.equipment);
		if (record) recordIndex = records.indexOf(record);
		cardControls.updateCard(record);
		cardControls.updateNav(record ? recordIndex : 0, record ? records.length : 0);
	};
	const fetchFreshStrictRecords = async () => {
		if (!isRenderAlive) return undefined;
		const capturedEquipmentKey = getSelectedEquipmentKey();
		const token = ++equipmentQueryToken;
		const nextRecords = await getStrictMatchingRecords(ctx.plugin.recordService, sel);
		if (!isRenderAlive || token !== equipmentQueryToken || capturedEquipmentKey !== getSelectedEquipmentKey()) {
			return undefined;
		}
		refreshFilteredRecords(nextRecords);
		return records;
	};

	let persistTimer: number | null = null;
	const persistEquipment = () => {
		if (persistTimer != null) window.clearTimeout(persistTimer);
		persistTimer = window.setTimeout(() => {
			persistTimer = null;
			void ctx.plugin.saveEquipment();
		}, 500);
	};
	ctx.registerCleanup(() => {
		if (persistTimer != null) {
			window.clearTimeout(persistTimer);
			persistTimer = null;
			void ctx.plugin.saveEquipment();
		}
	});

	const handleEquipmentChange = () => {
		void queryAndApplyDials().catch(() => undefined);
	};
	const handleGrinderChange = (grinder: GrinderConfig) => {
		dialControls.rebuildGrinderSteppers(grinder);
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
		persistEquipment,
	);

	const getSelectedGrinder = () => ctx.equipment.grinders.find((grinder) => grinder.name === sel.grinder);
	const applyDefaultDials = () => {
		dialControls.applyDefaults(getDefaultDialValues(sel.method!, getSelectedGrinder()));
	};
	const applyDefaultsToEquipment = () => {
		if (!isRenderAlive) return;
		const defaults = getDefaultConfigureSelection(sel.method!, ctx.equipment);
		ctx.flowState.updateVariables(defaults);
		if (defaults.filter && equipRefs.filterSelect) equipRefs.filterSelect.value = defaults.filter;
		if (defaults.dripper && equipRefs.dripperSelect) equipRefs.dripperSelect.value = defaults.dripper;
		if (defaults.basket && equipRefs.basketSelect) equipRefs.basketSelect.value = defaults.basket;
		if (defaults.grinder) {
			const grinder = ctx.equipment.grinders.find((item) => item.name === defaults.grinder);
			if (grinder) {
				if (equipRefs.grinderSelect) equipRefs.grinderSelect.value = grinder.name;
				dialControls.rebuildGrinderSteppers(grinder);
			}
		}
		applyDefaultDials();
	};
	const applyRecordSelection = (record: BrewRecord) => {
		if (!isRenderAlive) return;
		applyRecordToEquipment(record, sel, equipRefs);
		if (record.grinder) {
			const grinder = ctx.equipment.grinders.find((item) => item.name === record.grinder);
			if (grinder) {
				sel.grinder = grinder.name;
				if (equipRefs.grinderSelect) equipRefs.grinderSelect.value = grinder.name;
				dialControls.rebuildGrinderSteppers(grinder);
			}
		}
		if (record.method === 'espresso') sel.accessories = record.accessories;
		dialControls.applyRecord(record);
	};
	const queryAndApplyDials = async () => {
		if (!isRenderAlive) return;
		ctx.flowState.nextConfigureInitToken();
		records = [];
		recordIndex = 0;
		cardControls.updateCard(undefined);
		cardControls.updateNav(0, 0);
		const nextRecords = await fetchFreshStrictRecords();
		if (!isRenderAlive || !nextRecords) return;
		const record = findNewestApplicableRecord(nextRecords, ctx.equipment);
		if (record) {
			recordIndex = nextRecords.indexOf(record);
			applyRecordSelection(record);
			cardControls.updateCard(record);
			cardControls.updateNav(recordIndex, nextRecords.length);
			return;
		}
		if (!isRenderAlive) return;
		applyDefaultDials();
		cardControls.updateCard(undefined);
		cardControls.updateNav(0, 0);
	};

	renderRecipeSelect(container, ctx.plugin, ctx.flowState);

	const completeBtn = container.createEl('button', { text: t('brew.settingsDone'), cls: 'brew-flow-start-btn' });
	completeBtn.addEventListener('click', () => {
		const dialValues = dialControls.readValues();
		const vars: Partial<BrewFlowSelection> = {
			grindSize: dialValues.grindSize,
			dose: dialValues.dose,
			grinder: sel.grinder,
			rpm: dialValues.rpm,
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
		const capturedSetupKey = buildConfigureSetupKey(sel);
		const token = ctx.flowState.nextConfigureInitToken();
		const isCurrentConfigureInit = () =>
			isRenderAlive &&
			capturedSetupKey === buildConfigureSetupKey(sel) &&
			token === ctx.flowState.getConfigureInitToken() &&
			shouldInitializeConfigure(capturedSetupKey, ctx.flowState.getInitializedConfigureSetupKey(), ctx.flowState.step);
		if (
			!shouldInitializeConfigure(capturedSetupKey, ctx.flowState.getInitializedConfigureSetupKey(), ctx.flowState.step)
		) {
			await fetchFreshStrictRecords();
			return;
		}

		const looseRecords = await getLooseMatchingRecords(ctx.plugin.recordService, sel);
		if (!isCurrentConfigureInit()) return;

		const applicableLooseRecords = looseRecords.filter((item) => findNewestApplicableRecord([item], ctx.equipment));
		const record = findNewestApplicableRecord(applicableLooseRecords, ctx.equipment);
		if (record) {
			records = applicableLooseRecords;
			recordIndex = applicableLooseRecords.indexOf(record);
			applyRecordSelection(record);
			cardControls.updateCard(record);
			cardControls.updateNav(recordIndex, applicableLooseRecords.length);
		} else {
			applyDefaultsToEquipment();
			cardControls.updateCard(undefined);
			cardControls.updateNav(0, 0);
		}

		if (!isCurrentConfigureInit()) return;
		if (capturedSetupKey) ctx.flowState.markConfigureInitialized(capturedSetupKey);
		await fetchFreshStrictRecords();
	};
	void initFromRecords().catch(() => undefined);
}
