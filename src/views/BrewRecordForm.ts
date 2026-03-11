import type { App } from 'obsidian';
import type { BrewRecord, BrewMethod, BrewTemp, EspressoDrink, EquipmentSettings } from '../brew/types';
import type { BrewRecordService } from '../services/BrewRecordService';
import type { BrewProfileStorage } from '../services/BrewProfileStorage';
import { DRINK_LABELS, METHOD_LABELS } from '../brew/constants';
import { createStepper } from './Stepper';
import { createAccessoryChecklist } from './FormHelpers';
import { ConfirmModal } from './BrewProfileModal';

export interface BrewRecordFormDeps {
	app: App;
	equipment: EquipmentSettings;
	recordService: BrewRecordService;
	profileStorage: BrewProfileStorage;
	onSaved: (updated: BrewRecord) => void;
	onDeleted: () => void;
	onCancel: () => void;
}

export function renderEditForm(container: HTMLElement, record: BrewRecord, deps: BrewRecordFormDeps): void {
	const form = container.createDiv({ cls: 'brew-edit-form' });

	let currentMethod: BrewMethod = record.method;

	const methodRow = form.createDiv({ cls: 'brew-edit-row' });
	methodRow.createEl('label', { text: '방식' });
	const methodSelect = methodRow.createEl('select');
	for (const m of [
		{ v: 'filter' as const, l: METHOD_LABELS.filter },
		{ v: 'espresso' as const, l: METHOD_LABELS.espresso },
	]) {
		const opt = methodSelect.createEl('option', { text: m.l, value: m.v });
		if (m.v === record.method) opt.selected = true;
	}

	const tempRow = form.createDiv({ cls: 'brew-edit-row' });
	tempRow.createEl('label', { text: '온도' });
	const tempSelect = tempRow.createEl('select');
	for (const t of [
		{ v: 'hot' as const, l: 'Hot' },
		{ v: 'iced' as const, l: 'Ice' },
	]) {
		const opt = tempSelect.createEl('option', { text: t.l, value: t.v });
		if (t.v === record.temp) opt.selected = true;
	}

	let grinderSelect: HTMLSelectElement | null = null;
	if (deps.equipment.grinders.length > 0) {
		const grinderRow = form.createDiv({ cls: 'brew-edit-row' });
		grinderRow.createEl('label', { text: '그라인더' });
		grinderSelect = grinderRow.createEl('select');
		grinderSelect.createEl('option', { text: '없음', value: '' });
		for (const g of deps.equipment.grinders) {
			const opt = grinderSelect.createEl('option', { text: g.name, value: g.name });
			if (record.grinder === g.name) opt.selected = true;
		}
	}

	const grindStepper = createStepper(form, {
		label: '분쇄도',
		initial: record.grindSize,
		min: 0,
		max: 50,
		step: 0.1,
		pxPerStep: 10,
		format: (v) => v.toFixed(1),
	});

	const doseStepper = createStepper(form, {
		label: '도징량(g)',
		initial: record.dose,
		min: 0,
		max: 100,
		step: 0.1,
		pxPerStep: 10,
		format: (v) => `${v.toFixed(1)}g`,
	});

	const filterGroup = form.createDiv({ cls: 'brew-edit-filter-fields' });

	const waterTempStepper = createStepper(filterGroup, {
		label: '물 온도(°C)',
		initial: record.method === 'filter' ? record.waterTemp : 93,
		min: 0,
		max: 100,
		step: 1,
		pxPerStep: 5,
		format: (v) => `${v}°C`,
	});

	const filterRow = filterGroup.createDiv({ cls: 'brew-edit-row' });
	filterRow.createEl('label', { text: '필터' });
	const filterSelect = filterRow.createEl('select');
	for (const f of deps.equipment.filters) {
		const opt = filterSelect.createEl('option', { text: f, value: f });
		if (record.method === 'filter' && record.filter === f) opt.selected = true;
	}

	let dripperSelect: HTMLSelectElement | null = null;
	if (deps.equipment.drippers.length > 0) {
		const dripperRow = filterGroup.createDiv({ cls: 'brew-edit-row' });
		dripperRow.createEl('label', { text: '드리퍼' });
		dripperSelect = dripperRow.createEl('select');
		dripperSelect.createEl('option', { text: '없음', value: '' });
		for (const d of deps.equipment.drippers) {
			const opt = dripperSelect.createEl('option', { text: d, value: d });
			if (record.method === 'filter' && record.dripper === d) opt.selected = true;
		}
	}

	const espressoGroup = form.createDiv({ cls: 'brew-edit-espresso-fields' });

	const drinkRow = espressoGroup.createDiv({ cls: 'brew-edit-row' });
	drinkRow.createEl('label', { text: '음료' });
	const drinkSelect = drinkRow.createEl('select');
	const drinks: { value: EspressoDrink; label: string }[] = [
		{ value: 'shot', label: DRINK_LABELS.shot },
		{ value: 'americano', label: DRINK_LABELS.americano },
		{ value: 'latte', label: DRINK_LABELS.latte },
	];
	for (const d of drinks) {
		const opt = drinkSelect.createEl('option', { text: d.label, value: d.value });
		if (record.method === 'espresso' && record.drink === d.value) opt.selected = true;
	}

	const basketRow = espressoGroup.createDiv({ cls: 'brew-edit-row' });
	basketRow.createEl('label', { text: '바스켓' });
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
		label: '가수',
		initial: record.waterWeight ?? 0,
		min: 0,
		max: 1000,
		step: 0.1,
		pxPerStep: 10,
		format: (v) => `${v.toFixed(1)}g`,
	});
	const milkWeightStepper = createStepper(form, {
		label: '우유',
		initial: record.milkWeight ?? 0,
		min: 0,
		max: 1000,
		step: 0.1,
		pxPerStep: 10,
		format: (v) => `${v.toFixed(1)}g`,
	});

	const noteRow = form.createDiv({ cls: 'brew-edit-row brew-edit-note' });
	noteRow.createEl('label', { text: '메모' });
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
	const deleteBtn = footer.createEl('button', { text: '삭제', cls: 'mod-warning' });
	deleteBtn.addEventListener('click', () => {
		const modal = new ConfirmModal(
			deps.app,
			'선택한 브루잉 기록을 삭제합니다. 삭제된 기록은 복구할 수 없습니다.',
			async () => {
				try {
					await deps.recordService.removeWithProfile(record.id, record.profilePath, deps.profileStorage);
					deps.onDeleted();
				} catch (err) {
					console.error('[BrewRecordForm] delete failed:', err);
				}
			},
		);
		modal.open();
	});

	const rightGroup = footer.createDiv({ cls: 'brew-profile-footer-right' });
	const saveBtn = rightGroup.createEl('button', { text: '저장', cls: 'mod-cta' });
	saveBtn.addEventListener('click', async () => {
		try {
			const method = currentMethod;
			const temp = tempSelect.value as BrewTemp;
			const ww = waterWeightStepper.getValue();
			const mw = milkWeightStepper.getValue();
			const base = {
				temp,
				grindSize: grindStepper.getValue(),
				dose: doseStepper.getValue(),
				grinder: grinderSelect?.value || undefined,
				note: noteInput.value.trim() || undefined,
				waterWeight: ww > 0 ? ww : undefined,
				milkWeight: mw > 0 ? mw : undefined,
			};

			let changes: Partial<BrewRecord>;
			if (method === 'filter') {
				changes = {
					...base,
					method: 'filter' as const,
					waterTemp: waterTempStepper.getValue(),
					filter: filterSelect.value,
					dripper: dripperSelect?.value || undefined,
				};
			} else {
				const accList = [...accChecked];
				changes = {
					...base,
					method: 'espresso' as const,
					drink: drinkSelect.value as EspressoDrink,
					basket: basketSelect.value,
					accessories: accList.length > 0 ? accList : undefined,
				};
			}

			await deps.recordService.update(record.id, changes);
			let updated: BrewRecord;
			if (method !== record.method) {
				const shared = {
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
				if (method === 'espresso') {
					updated = {
						...shared,
						method: 'espresso',
						drink: drinkSelect.value as EspressoDrink,
						basket: basketSelect.value,
						accessories: [...accChecked].length > 0 ? [...accChecked] : undefined,
					};
				} else {
					updated = {
						...shared,
						method: 'filter',
						waterTemp: waterTempStepper.getValue(),
						filter: filterSelect.value,
						dripper: dripperSelect?.value || undefined,
					};
				}
			} else {
				updated = { ...record, ...changes } as BrewRecord;
			}
			deps.onSaved(updated);
		} catch (err) {
			console.error('[BrewRecordForm] save failed:', err);
		}
	});
	const cancelBtn = rightGroup.createEl('button', { text: '취소' });
	cancelBtn.addEventListener('click', () => deps.onCancel());
}
