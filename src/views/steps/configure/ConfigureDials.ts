import type { BrewFlowSelection, BrewRecord, EquipmentSettings, GrinderConfig } from '../../../brew/types';
import { t } from '../../../i18n/index';
import { attachScaleAutoBtn, createAccessoryChecklist } from '../../FormHelpers';
import { createStepper } from '../../Stepper';

export interface ConfigureDialValues {
	grindSize: number;
	dose: number;
	waterTemp?: number;
	accessories?: string[];
}

export interface ConfigureDialControls {
	applyRecord: (record: BrewRecord) => void;
	readValues: () => ConfigureDialValues;
	rebuildGrindStepper: (grinder: GrinderConfig) => void;
}

function grinderToStepperConfig(grinder: GrinderConfig) {
	const decimals = Math.max(0, -Math.floor(Math.log10(grinder.step)));
	return {
		step: grinder.step,
		min: grinder.min,
		max: grinder.max,
		format: (v: number) => v.toFixed(decimals),
	};
}

export function renderConfigureDials(
	form: HTMLElement,
	sel: BrewFlowSelection,
	equipment: EquipmentSettings,
	selectedGrinder: GrinderConfig | undefined,
	getWeightText: () => string,
	syncSummary: () => void,
): ConfigureDialControls {
	const isFilter = sel.method === 'filter';
	const isEspresso = sel.method === 'espresso';
	let grindStepperConfig = selectedGrinder
		? grinderToStepperConfig(selectedGrinder)
		: { step: 0.1, min: 0, max: 50, format: (v: number) => v.toFixed(1) };

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

	attachScaleAutoBtn(doseStepper, getWeightText);

	let waterTempStepper: ReturnType<typeof createStepper> | null = null;
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
		if (!isEspresso || equipment.accessories.length === 0) return;
		if (!accessoryContainer) {
			accessoryContainer = form.createDiv();
		} else {
			accessoryContainer.empty();
		}
		createAccessoryChecklist(accessoryContainer, equipment.accessories, sel.accessories ?? [], (list) => {
			sel.accessories = list.length > 0 ? list : undefined;
		});
	};
	renderAccessories();

	const rebuildGrindStepper = (grinder: GrinderConfig) => {
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
	};

	const applyRecord = (record: BrewRecord) => {
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

	const readValues = (): ConfigureDialValues => ({
		grindSize: grindStepper.getValue(),
		dose: doseStepper.getValue(),
		...(isFilter && { waterTemp: waterTempStepper!.getValue() }),
		...(isEspresso && { accessories: sel.accessories }),
	});

	return { applyRecord, readValues, rebuildGrindStepper };
}
