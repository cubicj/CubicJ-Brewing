import { Modal, type App } from 'obsidian';
import { BrewProfileChart } from './BrewProfileChart';
import type { BrewProfileStorage } from '../services/BrewProfileStorage';
import type { BrewRecordService } from '../services/BrewRecordService';
import type { BrewProfilePoint, BrewRecord, EquipmentSettings } from '../brew/types';
import { getDrinkLabel, getMethodLabel } from '../brew/constants';
import { t } from '../i18n/index';
import { renderEditForm } from './BrewRecordForm';
import { formatBrewDate } from '../utils/format';

export type ModalMode =
	| {
			type: 'detail';
			record: BrewRecord;
			recordService: BrewRecordService;
			profileStorage: BrewProfileStorage;
			equipment: EquipmentSettings;
	  }
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
				? () =>
						(mode as { type: 'detail'; profileStorage: BrewProfileStorage; record: BrewRecord }).profileStorage.load(
							mode.record.profilePath!,
						)
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
		this.titleEl.setText(t('modal.brewDetail'));
		if (this.record) {
			const sub = this.contentEl.createDiv({ cls: 'brew-profile-subtitle' });
			const { date, time } = formatBrewDate(this.record.timestamp);
			const dateStr = `20${date} | ${time}`;
			sub.createEl('span', { cls: 'brew-profile-subtitle-label', text: t('modal.dateTime') });
			sub.createEl('span', { text: dateStr });
			sub.createEl('span', { cls: 'brew-profile-subtitle-sep', text: ' · ' });
			sub.createEl('span', { cls: 'brew-profile-subtitle-label', text: t('modal.bean') });
			sub.createEl('span', { text: this.record.bean });
		} else {
			this.contentEl.createDiv({ text: this.subtitle, cls: 'brew-profile-subtitle' });
		}

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
			this.modalEl.addEventListener('wheel', this.wheelHandler, {
				capture: true,
				passive: false,
			} as AddEventListenerOptions);
		} else if (this.record) {
			const espressoStats: string[] = [];
			if (this.record.time) espressoStats.push(t('modal.seconds', { n: this.record.time }));
			if (this.record.yield) espressoStats.push(t('modal.grams', { n: this.record.yield }));
			if (espressoStats.length > 0) {
				const statsEl = this.contentEl.createDiv({ cls: 'brew-espresso-stats' });
				if (this.record.time) {
					const cell = statsEl.createDiv({ cls: 'brew-espresso-stat' });
					cell.createDiv({ cls: 'brew-espresso-stat-label', text: t('modal.extractionTime') });
					cell.createDiv({ cls: 'brew-espresso-stat-value', text: t('modal.seconds', { n: this.record.time }) });
				}
				if (this.record.yield) {
					const cell = statsEl.createDiv({ cls: 'brew-espresso-stat' });
					cell.createDiv({ cls: 'brew-espresso-stat-label', text: t('modal.extractionYield') });
					cell.createDiv({ cls: 'brew-espresso-stat-value', text: t('modal.grams', { n: this.record.yield }) });
				}
				if (this.record.dose && this.record.yield) {
					const ratio = (this.record.yield / this.record.dose).toFixed(1);
					const cell = statsEl.createDiv({ cls: 'brew-espresso-stat' });
					cell.createDiv({ cls: 'brew-espresso-stat-label', text: t('modal.yield') });
					cell.createDiv({ cls: 'brew-espresso-stat-value', text: `1 : ${ratio}` });
				}
			}
		}

		const footer = this.contentEl.createDiv({ cls: 'brew-profile-footer' });
		if (this.mode.type === 'detail') {
			const deleteBtn = footer.createEl('button', { text: t('form.delete'), cls: 'mod-warning' });
			deleteBtn.addEventListener('click', () => this.confirmDelete());
			const rightGroup = footer.createDiv({ cls: 'brew-profile-footer-right' });
			const editBtn = rightGroup.createEl('button', { text: t('common.edit') });
			editBtn.addEventListener('click', () => this.enterEditMode());
			const okBtn = rightGroup.createEl('button', { text: t('common.confirm'), cls: 'mod-cta' });
			okBtn.addEventListener('click', () => this.close());
		} else {
			const okBtn = footer.createEl('button', { text: t('common.confirm'), cls: 'mod-cta' });
			okBtn.addEventListener('click', () => this.close());
		}
	}

	private confirmDelete(): void {
		if (!this.record || this.mode.type !== 'detail') return;
		const record = this.record;
		const { recordService, profileStorage } = this.mode;
		const modal = new ConfirmModal(this.app, t('form.deleteConfirm'), async () => {
			try {
				await recordService.removeWithProfile(record.id, record.profilePath, profileStorage);
				this.close();
			} catch (err) {
				console.error('[BrewProfileModal] delete failed:', err);
			}
		});
		modal.open();
	}

	private enterEditMode(): void {
		if (!this.record || this.mode.type !== 'detail') return;
		this.removeWheelHandler();
		this.contentEl.empty();
		this.modalEl.addClass('brew-profile-editing');
		this.titleEl.setText(t('modal.editBrew'));
		this.contentEl.createDiv({ text: this.subtitle, cls: 'brew-profile-subtitle' });
		renderEditForm(this.contentEl, this.record, {
			app: this.app,
			equipment: this.mode.equipment,
			recordService: this.mode.recordService,
			profileStorage: this.mode.profileStorage,
			onSaved: (updated) => {
				this.record = updated;
				this.renderReadMode();
			},
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
		const grinderConfig = eq?.grinders.find((g) => g.name === record.grinder);

		const fmtGrind = (v: number) => {
			if (grinderConfig && grinderConfig.step < 0.1) return v.toFixed(2);
			if (grinderConfig && grinderConfig.step < 1) return v.toFixed(1);
			return String(v);
		};

		const equipRow: [string, string][] = [];
		if (record.grinder) {
			equipRow.push([t('equipment.grinder'), record.grinder]);
			equipRow.push([t('form.grindSize'), fmtGrind(record.grindSize)]);
		}
		if (record.method === 'filter') {
			if (record.dripper) equipRow.push([t('equipment.dripper'), record.dripper]);
			equipRow.push([t('equipment.filter'), record.filter]);
		} else {
			equipRow.push([t('equipment.basket'), record.basket]);
			if (record.accessories && record.accessories.length > 0) {
				equipRow.push([t('equipment.accessory'), record.accessories.join(', ')]);
			}
		}

		const temp = record.temp === 'iced' ? 'Ice' : 'Hot';
		const dataRow: [string, string][] = [];
		if (record.method === 'espresso') {
			dataRow.push([t('form.method'), getMethodLabel(record.method)]);
			dataRow.push([t('form.drink'), `${getDrinkLabel(record.drink)}(${temp})`]);
		} else {
			dataRow.push([t('form.method'), `${getMethodLabel(record.method)}(${temp})`]);
		}
		dataRow.push([t('modal.roasting'), record.roastDays !== null ? t('bean.roastDays', { n: record.roastDays }) : '-']);
		if (!record.grinder) dataRow.push([t('form.grindSize'), fmtGrind(record.grindSize)]);
		dataRow.push([t('form.dose'), t('modal.grams', { n: record.dose })]);
		if (record.method === 'filter' && record.waterTemp) dataRow.push([t('form.waterTemp'), `${record.waterTemp}°C`]);
		if (record.waterWeight != null) dataRow.push([t('form.addition'), `${record.waterWeight}g`]);
		if (record.milkWeight != null) dataRow.push([t('form.milk'), `${record.milkWeight}g`]);

		const layout = this.contentEl.createDiv({ cls: 'brew-detail-layout' });

		const left = layout.createDiv({ cls: 'brew-detail-left' });
		const cols = Math.max(dataRow.length, equipRow.length);
		const grid = left.createDiv({ cls: 'brew-detail-grid' });
		grid.style.setProperty('--cols', String(cols));
		for (const items of [dataRow, equipRow]) {
			for (const [label, value] of items) {
				const cell = grid.createDiv({ cls: 'brew-detail-cell' });
				cell.createDiv({ cls: 'brew-detail-label', text: label });
				cell.createDiv({ cls: 'brew-detail-value', text: value });
			}
		}

		const right = layout.createDiv({ cls: 'brew-detail-right' });
		right.createDiv({ cls: 'brew-detail-label', text: t('form.memo') });
		right.createDiv({ cls: 'brew-detail-note', text: record.note || '-' });
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
		this.titleEl.setText(t('common.confirm'));
		this.contentEl.createDiv({ text: this.message, cls: 'cubicj-confirm-message' });
		const footer = this.contentEl.createDiv({ cls: 'cubicj-confirm-footer' });
		const confirmBtn = footer.createEl('button', { text: t('form.delete'), cls: 'mod-warning' });
		confirmBtn.addEventListener('click', () => {
			this.onConfirm();
			this.close();
		});
		const cancelBtn = footer.createEl('button', { text: t('common.cancel') });
		cancelBtn.addEventListener('click', () => this.close());
	}
}
