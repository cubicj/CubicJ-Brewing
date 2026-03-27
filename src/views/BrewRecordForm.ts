import { Notice, type App } from 'obsidian';
import type { BrewRecord, BrewMethod, BrewTemp, EspressoDrink, EquipmentSettings } from '../brew/types';
import type { BrewRecordService } from '../services/BrewRecordService';
import type { BrewProfileStorage } from '../services/BrewProfileStorage';
import { getDrinkLabel, getMethodLabel, getTempLabel } from '../brew/constants';
import { t } from '../i18n/index';
import { createStepper } from './Stepper';
import { createAccessoryChecklist } from './FormHelpers';
import { ConfirmModal, type BeanWeightService } from './BrewProfileModal';

export interface BrewRecordFormDeps {
	app: App;
	equipment: EquipmentSettings;
	recordService: BrewRecordService;
	profileStorage: BrewProfileStorage;
	vaultData?: BeanWeightService;
	onSaved: (updated: BrewRecord) => void;
	onDeleted: () => void;
	onCancel: () => void;
}

export function renderEditForm(container: HTMLElement, record: BrewRecord, deps: BrewRecordFormDeps): void {
	const form = container.createDiv({ cls: 'brew-edit-form' });

	let currentMethod: BrewMethod = record.method;

	const methodRow = form.createDiv({ cls: 'brew-edit-row' });
	methodRow.createEl('label', { text: t('form.method') });
	const methodSelect = methodRow.createEl('select');
	for (const m of [
		{ v: 'filter' as const, l: getMethodLabel('filter') },
		{ v: 'espresso' as const, l: getMethodLabel('espresso') },
	]) {
		const opt = methodSelect.createEl('option', { text: m.l, value: m.v });
		if (m.v === record.method) opt.selected = true;
	}

	const tempRow = form.createDiv({ cls: 'brew-edit-row' });
	tempRow.createEl('label', { text: t('form.temperature') });
	const tempSelect = tempRow.createEl('select');
	for (const item of [
		{ v: 'hot' as const, l: getTempLabel('hot') },
		{ v: 'iced' as const, l: getTempLabel('iced') },
	]) {
		const opt = tempSelect.createEl('option', { text: item.l, value: item.v });
		if (item.v === record.temp) opt.selected = true;
	}

	let grinderSelect: HTMLSelectElement | null = null;
	if (deps.equipment.grinders.length > 0) {
		const grinderRow = form.createDiv({ cls: 'brew-edit-row' });
		grinderRow.createEl('label', { text: t('form.grinder') });
		grinderSelect = grinderRow.createEl('select');
		grinderSelect.createEl('option', { text: '-', value: '' });
		for (const g of deps.equipment.grinders) {
			const opt = grinderSelect.createEl('option', { text: g.name, value: g.name });
			if (record.grinder === g.name) opt.selected = true;
		}
	}

	const grindStepper = createStepper(form, {
		label: t('form.grindSize'),
		initial: record.grindSize,
		min: 0,
		max: 50,
		step: 0.1,
		pxPerStep: 10,
		format: (v) => v.toFixed(1),
	});

	const doseStepper = createStepper(form, {
		label: t('form.dose'),
		initial: record.dose,
		min: 0,
		max: 100,
		step: 0.1,
		pxPerStep: 10,
		format: (v) => `${v.toFixed(1)}g`,
	});

	const filterGroup = form.createDiv({ cls: 'brew-edit-filter-fields' });

	const waterTempStepper = createStepper(filterGroup, {
		label: t('form.waterTemp'),
		initial: record.method === 'filter' ? record.waterTemp : 93,
		min: 0,
		max: 100,
		step: 1,
		pxPerStep: 5,
		format: (v) => `${v}°C`,
	});

	const filterRow = filterGroup.createDiv({ cls: 'brew-edit-row' });
	filterRow.createEl('label', { text: t('form.filter') });
	const filterSelect = filterRow.createEl('select');
	filterSelect.createEl('option', { text: '-', value: '' });
	for (const f of deps.equipment.filters) {
		const opt = filterSelect.createEl('option', { text: f, value: f });
		if (record.method === 'filter' && record.filter === f) opt.selected = true;
	}

	let dripperSelect: HTMLSelectElement | null = null;
	if (deps.equipment.drippers.length > 0) {
		const dripperRow = filterGroup.createDiv({ cls: 'brew-edit-row' });
		dripperRow.createEl('label', { text: t('form.dripper') });
		dripperSelect = dripperRow.createEl('select');
		dripperSelect.createEl('option', { text: '-', value: '' });
		for (const d of deps.equipment.drippers) {
			const opt = dripperSelect.createEl('option', { text: d, value: d });
			if (record.method === 'filter' && record.dripper === d) opt.selected = true;
		}
	}

	const espressoGroup = form.createDiv({ cls: 'brew-edit-espresso-fields' });

	const drinkRow = espressoGroup.createDiv({ cls: 'brew-edit-row' });
	drinkRow.createEl('label', { text: t('form.drink') });
	const drinkSelect = drinkRow.createEl('select');
	const drinks: { value: EspressoDrink; label: string }[] = [
		{ value: 'shot', label: getDrinkLabel('shot') },
		{ value: 'americano', label: getDrinkLabel('americano') },
		{ value: 'latte', label: getDrinkLabel('latte') },
	];
	for (const d of drinks) {
		const opt = drinkSelect.createEl('option', { text: d.label, value: d.value });
		if (record.method === 'espresso' && record.drink === d.value) opt.selected = true;
	}

	const basketRow = espressoGroup.createDiv({ cls: 'brew-edit-row' });
	basketRow.createEl('label', { text: t('form.basket') });
	const basketSelect = basketRow.createEl('select');
	for (const b of deps.equipment.baskets) {
		const opt = basketSelect.createEl('option', { text: b, value: b });
		if (record.method === 'espresso' && record.basket === b) opt.selected = true;
	}

	const accChecked =
		deps.equipment.accessories.length > 0
			? createAccessoryChecklist(
					espressoGroup,
					deps.equipment.accessories,
					record.method === 'espresso' ? (record.accessories ?? []) : [],
				)
			: new Set<string>();

	const waterWeightStepper = createStepper(form, {
		label: t('form.addition'),
		initial: record.waterWeight ?? 0,
		min: 0,
		max: 1000,
		step: 0.1,
		pxPerStep: 10,
		format: (v) => `${v.toFixed(1)}g`,
	});
	const milkWeightStepper = createStepper(form, {
		label: t('form.milk'),
		initial: record.milkWeight ?? 0,
		min: 0,
		max: 1000,
		step: 0.1,
		pxPerStep: 10,
		format: (v) => `${v.toFixed(1)}g`,
	});

	const noteRow = form.createDiv({ cls: 'brew-edit-row brew-edit-note' });
	noteRow.createEl('label', { text: t('form.memo') });
	const noteInput = noteRow.createEl('textarea', { attr: { spellcheck: 'false' } });
	noteInput.value = record.note ?? '';

	const syncWeightVisibility = () => {
		const isFilter = currentMethod === 'filter';
		const drink = drinkSelect.value as EspressoDrink;
		const showWater = isFilter || (!isFilter && drink === 'americano');
		const showMilk = !isFilter && drink === 'latte';
		waterWeightStepper.el.style.display = showWater ? '' : 'none';
		milkWeightStepper.el.style.display = showMilk ? '' : 'none';
	};

	const syncMethodVisibility = () => {
		const isFilter = currentMethod === 'filter';
		filterGroup.style.display = isFilter ? '' : 'none';
		espressoGroup.style.display = isFilter ? 'none' : '';
		syncWeightVisibility();
	};
	methodSelect.addEventListener('change', () => {
		currentMethod = methodSelect.value as BrewMethod;
		syncMethodVisibility();
	});
	drinkSelect.addEventListener('change', () => syncWeightVisibility());
	syncMethodVisibility();

	const footer = container.createDiv({ cls: 'brew-profile-footer' });
	const deleteBtn = footer.createEl('button', { text: t('form.delete'), cls: 'mod-warning' });
	deleteBtn.addEventListener('click', () => {
		const bean = deps.vaultData?.getAllBeans().find((b) => b.name === record.bean);
		const canRestore = bean != null && bean.weight != null && record.dose > 0;
		const checkbox = canRestore
			? { label: t('form.restoreWeight', { dose: record.dose, bean: record.bean }), checked: true }
			: undefined;
		const modal = new ConfirmModal(
			deps.app,
			t('form.deleteConfirm'),
			async (restoreWeight) => {
				const delResult = await deps.recordService.removeWithProfile(
					record.id,
					record.profilePath,
					deps.profileStorage,
				);
				if (delResult.ok) {
					if (restoreWeight && canRestore) {
						const newWeight = Math.round((bean.weight! + record.dose) * 10) / 10;
						await deps.vaultData!.setWeight(bean.path, newWeight);
					}
					deps.onDeleted();
				} else {
					console.error(`[BrewRecordForm] delete failed: [${delResult.error.code}] ${delResult.error.message}`);
					new Notice(t('error.recordDelete'));
				}
			},
			checkbox,
		);
		modal.open();
	});

	const rightGroup = footer.createDiv({ cls: 'brew-profile-footer-right' });
	const saveBtn = rightGroup.createEl('button', { text: t('form.save'), cls: 'mod-cta' });
	saveBtn.addEventListener('click', async () => {
		try {
			const method = currentMethod;
			const temp = tempSelect.value as BrewTemp;
			const ww = waterWeightStepper.getValue();
			const mw = milkWeightStepper.getValue();
			const base = {
				id: record.id,
				timestamp: record.timestamp,
				bean: record.bean,
				roastDate: record.roastDate,
				roastDays: record.roastDays,
				temp,
				grindSize: grindStepper.getValue(),
				grinder: grinderSelect?.value || undefined,
				dose: doseStepper.getValue(),
				time: record.time,
				yield: record.yield,
				recipe: record.recipe,
				note: noteInput.value.trim() || undefined,
				profilePath: record.profilePath,
				waterWeight: ww > 0 ? ww : undefined,
				milkWeight: mw > 0 ? mw : undefined,
			};

			let updated: BrewRecord;
			if (method === 'filter') {
				updated = {
					...base,
					method: 'filter' as const,
					waterTemp: waterTempStepper.getValue(),
					filter: filterSelect.value || undefined,
					dripper: dripperSelect?.value || undefined,
				};
			} else {
				const accList = [...accChecked];
				updated = {
					...base,
					method: 'espresso' as const,
					drink: drinkSelect.value as EspressoDrink,
					basket: basketSelect.value,
					accessories: accList.length > 0 ? accList : undefined,
				};
			}

			const updateResult = await deps.recordService.update(record.id, updated);
			if (!updateResult.ok) throw new Error(updateResult.error.message);
			deps.onSaved(updated);
		} catch (err) {
			console.error('[BrewRecordForm] save failed:', err);
			new Notice(t('brew.saveFailed'));
		}
	});
	const cancelBtn = rightGroup.createEl('button', { text: t('form.cancel') });
	cancelBtn.addEventListener('click', () => deps.onCancel());
}
