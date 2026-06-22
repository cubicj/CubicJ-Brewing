import type { BrewFlowSelection, BrewRecord, EquipmentSettings, GrinderConfig } from '../../../brew/types';
import { t } from '../../../i18n/index';
import { createSelectField } from '../../FormHelpers';

export interface EquipmentSelectRefs {
	filterSelect: HTMLSelectElement | null;
	dripperSelect: HTMLSelectElement | null;
	basketSelect: HTMLSelectElement | null;
	grinderSelect: HTMLSelectElement | null;
}

export interface EquipmentFieldControls {
	refs: EquipmentSelectRefs;
	selectedGrinder: GrinderConfig | undefined;
}

export function renderEquipmentFields(
	form: HTMLElement,
	sel: BrewFlowSelection,
	equipment: EquipmentSettings,
	onEquipmentChange: () => void,
	onGrinderChange: (grinder: GrinderConfig) => void,
): EquipmentFieldControls {
	const refs: EquipmentSelectRefs = {
		filterSelect: null,
		dripperSelect: null,
		basketSelect: null,
		grinderSelect: null,
	};

	if (sel.method === 'filter') {
		sel.filter = sel.filter ?? equipment.filters[0];
		refs.filterSelect = createSelectField(form, t('equipment.filter'), equipment.filters, sel.filter!, (v) => {
			sel.filter = v;
			onEquipmentChange();
		});

		sel.dripper = sel.dripper ?? equipment.drippers[0];
		if (equipment.drippers.length > 0) {
			refs.dripperSelect = createSelectField(form, t('equipment.dripper'), equipment.drippers, sel.dripper!, (v) => {
				sel.dripper = v;
				onEquipmentChange();
			});
		}
	}

	if (sel.method === 'espresso') {
		sel.basket = sel.basket ?? equipment.baskets[0];
		refs.basketSelect = createSelectField(form, t('equipment.basket'), equipment.baskets, sel.basket!, (v) => {
			sel.basket = v;
			onEquipmentChange();
		});
	}

	let selectedGrinder: GrinderConfig | undefined;
	if (equipment.grinders.length > 0) {
		const initGrinderName = sel.grinder ?? equipment.grinders[0]?.name;
		selectedGrinder = equipment.grinders.find((g) => g.name === initGrinderName) ?? equipment.grinders[0];
		sel.grinder = selectedGrinder.name;

		if (equipment.grinders.length > 1) {
			const grinderNames = equipment.grinders.map((g) => g.name);
			refs.grinderSelect = createSelectField(form, t('equipment.grinder'), grinderNames, selectedGrinder.name, (v) => {
				const grinder = equipment.grinders.find((g) => g.name === v)!;
				sel.grinder = grinder.name;
				onGrinderChange(grinder);
				onEquipmentChange();
			});
		}
	}

	return { refs, selectedGrinder };
}

export function applyRecordToEquipment(record: BrewRecord, sel: BrewFlowSelection, refs: EquipmentSelectRefs): void {
	if (record.method === 'filter') {
		if (record.filter && refs.filterSelect) {
			sel.filter = record.filter;
			refs.filterSelect.value = record.filter;
		}
		if (record.dripper && refs.dripperSelect) {
			sel.dripper = record.dripper;
			refs.dripperSelect.value = record.dripper;
		}
	}
	if (record.method === 'espresso' && record.basket && refs.basketSelect) {
		sel.basket = record.basket;
		refs.basketSelect.value = record.basket;
	}
}
