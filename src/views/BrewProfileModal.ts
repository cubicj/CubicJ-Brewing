import { Modal, type App } from 'obsidian';
import { BrewProfileChart } from './BrewProfileChart';
import type { BrewProfileStorage } from '../services/BrewProfileStorage';
import type { BrewRecordService } from '../services/BrewRecordService';
import type { BrewProfilePoint, BrewRecord, EquipmentSettings } from '../brew/types';
import { renderEditForm } from './BrewRecordForm';

export type ModalMode =
	| { type: 'detail'; record: BrewRecord; recordService: BrewRecordService; profileStorage: BrewProfileStorage; equipment: EquipmentSettings }
	| { type: 'expand'; points: BrewProfilePoint[] };

export class BrewProfileModal extends Modal {
	private subtitle: string;
	private mode: ModalMode;
	private record?: BrewRecord;
	private resolvePoints: () => Promise<BrewProfilePoint[]>;
	private wheelHandler: ((e: WheelEvent) => void) | null = null;

	constructor(app: App, subtitle: string, mode: ModalMode) {
		super(app);
		this.subtitle = subtitle;
		this.mode = mode;
		if (mode.type === 'expand') {
			this.resolvePoints = async () => mode.points;
		} else {
			this.record = mode.record;
			this.resolvePoints = mode.record.profilePath
				? () => (mode as { type: 'detail'; profileStorage: BrewProfileStorage; record: BrewRecord }).profileStorage.load(mode.record.profilePath!)
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
		if (this.mode.type === 'detail') {
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
		if (!this.record || this.mode.type !== 'detail') return;
		const record = this.record;
		const { recordService, profileStorage } = this.mode;
		const modal = new ConfirmModal(this.app, '선택한 브루잉 기록을 삭제합니다. 삭제된 기록은 복구할 수 없습니다.', async () => {
			if (record.profilePath && profileStorage) {
				await profileStorage.delete(record.profilePath);
			}
			await recordService.remove(record.id);
			this.close();
		});
		modal.open();
	}

	private enterEditMode(): void {
		if (!this.record || this.mode.type !== 'detail') return;
		this.removeWheelHandler();
		this.contentEl.empty();
		this.modalEl.addClass('brew-profile-editing');
		this.titleEl.setText('추출 수정');
		this.contentEl.createDiv({ text: this.subtitle, cls: 'brew-profile-subtitle' });
		renderEditForm(this.contentEl, this.record, {
			app: this.app,
			equipment: this.mode.equipment,
			recordService: this.mode.recordService,
			profileStorage: this.mode.profileStorage,
			onSaved: (updated) => { this.record = updated; this.renderReadMode(); },
			onDeleted: () => this.close(),
			onCancel: () => this.renderReadMode(),
		});
	}

	private removeWheelHandler(): void {
		if (this.wheelHandler) {
			this.modalEl.removeEventListener('wheel', this.wheelHandler);
			this.wheelHandler = null;
		}
	}

	private renderDetails(record: BrewRecord): void {
		const eq = this.mode.type === 'detail' ? this.mode.equipment : undefined;
		const grinderConfig = eq?.grinders.find(g => g.name === record.grinder);

		const fmtGrind = (v: number) => {
			if (grinderConfig && grinderConfig.step < 0.1) return v.toFixed(2);
			if (grinderConfig && grinderConfig.step < 1) return v.toFixed(1);
			return String(v);
		};

		const equipRow: [string, string][] = [];
		if (record.grinder) equipRow.push(['그라인더', record.grinder]);
		if (record.method === 'filter') {
			if (record.dripper) equipRow.push(['드리퍼', record.dripper]);
			equipRow.push(['필터', record.filter]);
		} else {
			equipRow.push(['바스켓', record.basket]);
			if (record.accessories && record.accessories.length > 0) {
				equipRow.push(['악세서리', record.accessories.join(', ')]);
			}
		}

		const dataRow: [string, string][] = [
			['로스팅', record.roastDays !== null ? `${record.roastDays}일차` : '-'],
			['분쇄도', fmtGrind(record.grindSize)],
			['도징량', `${record.dose}g`],
		];
		if (record.method === 'filter' && record.waterTemp) dataRow.push(['물 온도', `${record.waterTemp}°C`]);
		if (record.method === 'espresso') {
			dataRow.push(['음료', record.drink === 'shot' ? '샷' : record.drink === 'americano' ? '아메리카노' : '라떼']);
		}

		const renderGrid = (items: [string, string][]) => {
			const grid = this.contentEl.createDiv({ cls: 'brew-detail-grid' });
			for (const [label, value] of items) {
				const cell = grid.createDiv({ cls: 'brew-detail-cell' });
				cell.createDiv({ cls: 'brew-detail-label', text: label });
				cell.createDiv({ cls: 'brew-detail-value', text: value });
			}
		};

		renderGrid(dataRow);
		if (equipRow.length > 0) renderGrid(equipRow);
	}
}

export class ConfirmModal extends Modal {
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
