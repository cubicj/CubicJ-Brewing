import { Modal, type App } from 'obsidian';
import { BrewProfileChart } from './BrewProfileChart';
import type { BrewProfileStorage } from '../services/BrewProfileStorage';
import type { BrewRecordService } from '../services/BrewRecordService';
import type { BrewProfilePoint, BrewRecord, BrewMethod, BrewTemp, EspressoDrink } from '../brew/types';
import { createStepper } from './Stepper';

const FILTERS = ['하이플럭스', 'V60 기본'];
const BASKETS = ['DH 18g', 'IMS SF 20g', 'IMS 20g', 'Torch 18g'];
const DRINKS: { value: EspressoDrink; label: string }[] = [
	{ value: 'shot', label: '샷' },
	{ value: 'americano', label: '아메리카노' },
	{ value: 'latte', label: '라떼' },
];

export class BrewProfileModal extends Modal {
	private subtitle: string;
	private record?: BrewRecord;
	private profileStorage?: BrewProfileStorage;
	private recordService?: BrewRecordService;
	private resolvePoints: () => Promise<BrewProfilePoint[]>;
	private wheelHandler: ((e: WheelEvent) => void) | null = null;

	constructor(app: App, subtitle: string, record: BrewRecord, profileStorage: BrewProfileStorage, recordService: BrewRecordService);
	constructor(app: App, subtitle: string, points: BrewProfilePoint[]);
	constructor(
		app: App,
		subtitle: string,
		recordOrPoints: BrewRecord | BrewProfilePoint[],
		profileStorage?: BrewProfileStorage,
		recordService?: BrewRecordService,
	) {
		super(app);
		this.subtitle = subtitle;
		if (Array.isArray(recordOrPoints)) {
			this.resolvePoints = async () => recordOrPoints;
		} else {
			this.record = recordOrPoints;
			this.profileStorage = profileStorage;
			this.recordService = recordService;
			this.resolvePoints = recordOrPoints.profilePath
				? () => profileStorage!.load(recordOrPoints.profilePath!)
				: async () => [];
		}
	}

	async onOpen(): Promise<void> {
		this.renderReadMode();
	}

	onClose(): void {
		this.removeWheelHandler();
	}

	private async renderReadMode(): Promise<void> {
		this.removeWheelHandler();
		this.contentEl.empty();
		this.modalEl.addClass('brew-profile-modal');
		this.modalEl.removeClass('brew-profile-editing');
		this.titleEl.setText('추출 상세');
		this.contentEl.createDiv({ text: this.subtitle, cls: 'brew-profile-subtitle' });

		if (this.record) {
			this.renderDetails(this.record);
		}

		const points = await this.resolvePoints();
		if (points.length > 0) {
			const chartContainer = this.contentEl.createDiv({ cls: 'brew-profile-container' });
			const modalHeight = Math.min(500, Math.round(window.innerHeight * 0.5));
			const chart = new BrewProfileChart(chartContainer, modalHeight, 8, true);
			chart.renderStatic(points);

			this.wheelHandler = (e: WheelEvent) => {
				const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
				if (!dx) return;
				e.preventDefault();
				e.stopPropagation();
				chartContainer.scrollLeft += dx;
			};
			this.modalEl.addEventListener('wheel', this.wheelHandler, { capture: true, passive: false } as AddEventListenerOptions);
		}

		const footer = this.contentEl.createDiv({ cls: 'brew-profile-footer' });
		if (this.record && this.recordService) {
			const deleteBtn = footer.createEl('button', { text: '삭제', cls: 'mod-warning' });
			deleteBtn.addEventListener('click', () => this.confirmDelete());
			const rightGroup = footer.createDiv({ cls: 'brew-profile-footer-right' });
			const editBtn = rightGroup.createEl('button', { text: '수정' });
			editBtn.addEventListener('click', () => this.enterEditMode());
			const okBtn = rightGroup.createEl('button', { text: '확인', cls: 'mod-cta' });
			okBtn.addEventListener('click', () => this.close());
		} else {
			const okBtn = footer.createEl('button', { text: '확인', cls: 'mod-cta' });
			okBtn.addEventListener('click', () => this.close());
		}
	}

	private confirmDelete(): void {
		if (!this.record || !this.recordService) return;
		const record = this.record;
		const modal = new ConfirmModal(this.app, '선택한 브루잉 기록을 삭제합니다. 삭제된 기록은 복구할 수 없습니다.', async () => {
			if (record.profilePath && this.profileStorage) {
				await this.profileStorage.delete(record.profilePath);
			}
			await this.recordService!.remove(record.id);
			this.close();
		});
		modal.open();
	}

	private enterEditMode(): void {
		if (!this.record) return;
		this.removeWheelHandler();
		this.contentEl.empty();
		this.modalEl.addClass('brew-profile-editing');
		this.titleEl.setText('추출 수정');
		this.contentEl.createDiv({ text: this.subtitle, cls: 'brew-profile-subtitle' });
		this.renderForm(this.record);
	}

	private renderForm(record: BrewRecord): void {
		const form = this.contentEl.createDiv({ cls: 'brew-edit-form' });

		let currentMethod: BrewMethod = record.method;

		const methodRow = form.createDiv({ cls: 'brew-edit-row' });
		methodRow.createEl('label', { text: '방식' });
		const methodSelect = methodRow.createEl('select');
		for (const m of [{ v: 'filter' as const, l: '필터' }, { v: 'espresso' as const, l: '에스프레소' }]) {
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
		for (const f of FILTERS) {
			const opt = filterSelect.createEl('option', { text: f, value: f });
			if (record.method === 'filter' && record.filter === f) opt.selected = true;
		}

		const espressoGroup = form.createDiv({ cls: 'brew-edit-espresso-fields' });

		const drinkRow = espressoGroup.createDiv({ cls: 'brew-edit-row' });
		drinkRow.createEl('label', { text: '음료' });
		const drinkSelect = drinkRow.createEl('select');
		for (const d of DRINKS) {
			const opt = drinkSelect.createEl('option', { text: d.label, value: d.value });
			if (record.method === 'espresso' && record.drink === d.value) opt.selected = true;
		}

		const basketRow = espressoGroup.createDiv({ cls: 'brew-edit-row' });
		basketRow.createEl('label', { text: '바스켓' });
		const basketSelect = basketRow.createEl('select');
		for (const b of BASKETS) {
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

		const footer = this.contentEl.createDiv({ cls: 'brew-profile-footer' });
		const rightGroup = footer.createDiv({ cls: 'brew-profile-footer-right' });
		const saveBtn = rightGroup.createEl('button', { text: '저장', cls: 'mod-cta' });
		saveBtn.addEventListener('click', async () => {
			await this.saveEdit(
				record,
				currentMethod,
				tempSelect.value as BrewTemp,
				grindStepper.getValue(),
				doseStepper.getValue(),
				waterTempStepper.getValue(),
				filterSelect.value,
				drinkSelect.value as EspressoDrink,
				basketSelect.value,
				noteInput.value.trim() || undefined,
			);
		});
		const cancelBtn = rightGroup.createEl('button', { text: '취소' });
		cancelBtn.addEventListener('click', () => this.renderReadMode());
	}

	private async saveEdit(
		original: BrewRecord,
		method: BrewMethod,
		temp: BrewTemp,
		grindSize: number,
		dose: number,
		waterTemp: number,
		filter: string,
		drink: EspressoDrink,
		basket: string,
		note: string | undefined,
	): Promise<void> {
		if (!this.recordService) return;

		const base = {
			temp,
			grindSize,
			dose,
			note,
		};

		let changes: Partial<BrewRecord>;
		if (method === 'filter') {
			changes = { ...base, method: 'filter' as const, waterTemp, filter };
		} else {
			changes = { ...base, method: 'espresso' as const, drink, basket };
		}

		if (method !== original.method) {
			if (method === 'filter') {
				changes = { ...changes, drink: undefined, basket: undefined } as any;
			} else {
				changes = { ...changes, waterTemp: undefined, filter: undefined } as any;
			}
		}

		await this.recordService.update(original.id, changes);
		this.record = { ...original, ...changes } as BrewRecord;
		this.renderReadMode();
	}

	private removeWheelHandler(): void {
		if (this.wheelHandler) {
			this.modalEl.removeEventListener('wheel', this.wheelHandler);
			this.wheelHandler = null;
		}
	}

	private renderDetails(record: BrewRecord): void {
		const grid = this.contentEl.createDiv({ cls: 'brew-detail-grid' });

		const items: [string, string][] = [
			['로스팅', record.roastDays !== null ? `${record.roastDays}일차` : '-'],
			['분쇄도', String(record.grindSize)],
			['원두', `${record.dose}g`],
		];

		if (record.method === 'filter') {
			items.push(['물 온도', `${record.waterTemp}°C`]);
			items.push(['필터', record.filter]);
		} else {
			items.push(['음료', record.drink === 'shot' ? '샷' : record.drink === 'americano' ? '아메리카노' : '라떼']);
			items.push(['바스켓', record.basket]);
		}

		for (const [label, value] of items) {
			const cell = grid.createDiv({ cls: 'brew-detail-cell' });
			cell.createDiv({ cls: 'brew-detail-label', text: label });
			cell.createDiv({ cls: 'brew-detail-value', text: value });
		}
	}
}

class ConfirmModal extends Modal {
	private message: string;
	private onConfirm: () => void;

	constructor(app: App, message: string, onConfirm: () => void) {
		super(app);
		this.message = message;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		this.titleEl.setText('확인');
		this.contentEl.createDiv({ text: this.message, cls: 'brew-confirm-message' });
		const footer = this.contentEl.createDiv({ cls: 'brew-confirm-footer' });
		const confirmBtn = footer.createEl('button', { text: '삭제', cls: 'mod-warning' });
		confirmBtn.addEventListener('click', () => {
			this.onConfirm();
			this.close();
		});
		const cancelBtn = footer.createEl('button', { text: '취소' });
		cancelBtn.addEventListener('click', () => this.close());
	}
}
