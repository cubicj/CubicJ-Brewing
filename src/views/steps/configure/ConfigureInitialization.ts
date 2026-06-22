import type {
	BrewFlowSelection,
	BrewFlowStep,
	BrewMethod,
	BrewRecord,
	EquipmentSettings,
	GrinderConfig,
} from '../../../brew/types';

export interface ConfigureDialDefaults {
	grindSize: number;
	dose: number;
	waterTemp?: number;
	accessories?: string[];
}

export function buildConfigureSetupKey(sel: BrewFlowSelection): string | undefined {
	if (!sel.method || !sel.temp || !sel.bean) return undefined;
	return [sel.method, sel.temp, sel.drink ?? '', sel.bean.name].join('|');
}

export function shouldInitializeConfigure(
	setupKey: string | undefined,
	initializedSetupKey: string | undefined,
	currentStep: BrewFlowStep,
): boolean {
	if (!setupKey) return false;
	if (currentStep !== 'configure') return false;
	return setupKey !== initializedSetupKey;
}

export function getDefaultConfigureSelection(
	method: BrewMethod,
	equipment: EquipmentSettings,
): Partial<BrewFlowSelection> {
	const grinder = equipment.grinders[0]?.name;
	if (method === 'espresso') {
		return {
			grinder,
			basket: equipment.baskets[0],
			accessories: undefined,
		};
	}
	return {
		grinder,
		filter: equipment.filters[0],
		dripper: equipment.drippers[0],
	};
}

export function getDefaultDialValues(method: BrewMethod, grinder: GrinderConfig | undefined): ConfigureDialDefaults {
	const defaults: ConfigureDialDefaults = {
		grindSize: grinder?.min ?? 0,
		dose: 0,
		accessories: undefined,
	};
	if (method === 'filter') {
		defaults.waterTemp = 93;
	}
	return defaults;
}

export function findNewestApplicableRecord(
	matchingRecords: BrewRecord[],
	equipment: EquipmentSettings,
): BrewRecord | undefined {
	return [...matchingRecords]
		.sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
		.find((record) => isApplicableRecord(record, equipment));
}

export function isApplicableRecord(record: BrewRecord, equipment: EquipmentSettings): boolean {
	const grinder = record.grinder ? equipment.grinders.find((item) => item.name === record.grinder) : undefined;
	if (record.grinder && !grinder) return false;
	if (grinder && (record.grindSize < grinder.min || record.grindSize > grinder.max)) return false;
	if (record.dose == null) return false;

	if (record.method === 'filter') {
		if (record.filter && !equipment.filters.includes(record.filter)) return false;
		if (record.dripper && !equipment.drippers.includes(record.dripper)) return false;
		return record.waterTemp != null;
	}

	if (!record.basket || !equipment.baskets.includes(record.basket)) return false;
	return true;
}
