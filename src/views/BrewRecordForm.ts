import type { App } from 'obsidian';
import type { BrewRecord, BrewMethod, BrewTemp, EspressoDrink } from '../brew/types';
import type { BrewRecordService } from '../services/BrewRecordService';
import type { BrewProfileStorage } from '../services/BrewProfileStorage';
import { DRINK_LABELS, METHOD_LABELS } from '../brew/constants';
import { createStepper } from './Stepper';
import { ConfirmModal } from './BrewProfileModal';

export interface BrewRecordFormDeps {
	app: App;
	filters: string[];
	baskets: string[];
	recordService: BrewRecordService;
	profileStorage: BrewProfileStorage;
	onSaved: (updated: BrewRecord) => void;
	onDeleted: () => void;
	onCancel: () => void;
}

export function renderEditForm(
	container: HTMLElement,
	record: BrewRecord,
	deps: BrewRecordFormDeps,
): void {
	const form = container.createDiv({ cls: 'brew-edit-form' });

	let currentMethod: BrewMethod = record.method;

	const methodRow = form.createDiv({ cls: 'brew-edit-row' });
	methodRow.createEl('label', { text: '방식' });
	const methodSelect = methodRow.createEl('select');
	for (const m of [{ v: 'filter' as const, l: METHOD_LABELS.filter }, { v: 'espresso' as const, l: METHOD_LABELS.espresso }]) {
		const opt = methodSelect.createEl('option', { text: m.l, value: m.v });
		if (m.v === record.method) opt.selected = true;
	}

	const tempRow = form.createDiv({ cls: 'brew-edit-row' });
	tempRow.createEl('label', { text: '온도' });
	const tempSelect = tempRow.createEl('select');
	for (const t of [{ v: 'hot' as const, l: 'Hot' }, { v: 'iced' as const, l: 'Ice' }]) {
		const opt = tempSelect.createEl('option', { text: t.l, value: t.v });
		if (t.v === record.temp) opt.selected = true;
	}

	const grindStepper = createStepper(form, {
		label: '분쇄도', initial: record.grindSize,
		min: 0, max: 50, step: 0.1, pxPerStep: 10,
		format: v => v.toFixed(1),
	});

	const doseStepper = createStepper(form, {
		label: '원두(g)', initial: record.dose,
		min: 0, max: 100, step: 0.1, pxPerStep: 10,
		format: v => `${v.toFixed(1)}g`,
	});

	const filterGroup = form.createDiv({ cls: 'brew-edit-filter-fields' });

	const waterTempStepper = createStepper(filterGroup, {
		label: '물 온도(°C)', initial: record.method === 'filter' ? record.waterTemp : 93,
		min: 0, max: 100, step: 1, pxPerStep: 5,
		format: v => `${v}°C`,
	});

	const filterRow = filterGroup.createDiv({ cls: 'brew-edit-row' });
	filterRow.createEl('label', { text: '필터' });
	const filterSelect = filterRow.createEl('select');
	for (const f of deps.filters) {
		const opt = filterSelect.createEl('option', { text: f, value: f });
		if (record.method === 'filter' && record.filter === f) opt.selected = true;
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
	for (const b of deps.baskets) {
		const opt = basketSelect.createEl('option', { text: b, value: b });
		if (record.method === 'espresso' && record.basket === b) opt.selected = true;
	}

	const noteRow = form.createDiv({ cls: 'brew-edit-row brew-edit-note' });
	noteRow.createEl('label', { text: '메모' });
	const noteInput = noteRow.createEl('textarea');
	noteInput.value = record.note ?? '';

	const syncMethodVisibility = () => {
		const isFilter = currentMethod === 'filter';
		filterGroup.style.display = isFilter ? '' : 'none';
		espressoGroup.style.display = isFilter ? 'none' : '';
	};
	methodSelect.addEventListener('change', () => {
		currentMethod = methodSelect.value as BrewMethod;
		syncMethodVisibility();
	});
	syncMethodVisibility();

	const footer = container.createDiv({ cls: 'brew-profile-footer' });
	const deleteBtn = footer.createEl('button', { text: '삭제', cls: 'mod-warning' });
	deleteBtn.addEventListener('click', () => {
		const modal = new ConfirmModal(deps.app, '선택한 브루잉 기록을 삭제합니다. 삭제된 기록은 복구할 수 없습니다.', async () => {
			if (record.profilePath && deps.profileStorage) {
				await deps.profileStorage.delete(record.profilePath);
			}
			await deps.recordService.remove(record.id);
			deps.onDeleted();
		});
		modal.open();
	});

	const rightGroup = footer.createDiv({ cls: 'brew-profile-footer-right' });
	const saveBtn = rightGroup.createEl('button', { text: '저장', cls: 'mod-cta' });
	saveBtn.addEventListener('click', async () => {
		const method = currentMethod;
		const temp = tempSelect.value as BrewTemp;
		const base = {
			temp,
			grindSize: grindStepper.getValue(),
			dose: doseStepper.getValue(),
			note: noteInput.value.trim() || undefined,
		};

		let changes: Partial<BrewRecord>;
		if (method === 'filter') {
			changes = { ...base, method: 'filter' as const, waterTemp: waterTempStepper.getValue(), filter: filterSelect.value };
		} else {
			changes = { ...base, method: 'espresso' as const, drink: drinkSelect.value as EspressoDrink, basket: basketSelect.value };
		}

		if (method !== record.method) {
			if (method === 'filter') {
				changes = { ...changes, drink: undefined, basket: undefined } as any;
			} else {
				changes = { ...changes, waterTemp: undefined, filter: undefined } as any;
			}
		}

		await deps.recordService.update(record.id, changes);
		const updated = { ...record, ...changes } as BrewRecord;
		deps.onSaved(updated);
	});
	const cancelBtn = rightGroup.createEl('button', { text: '취소' });
	cancelBtn.addEventListener('click', () => deps.onCancel());
}
