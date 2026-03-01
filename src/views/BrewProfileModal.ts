import { Modal, type App } from 'obsidian';
import { BrewProfileChart } from './BrewProfileChart';
import type { BrewProfileStorage } from '../services/BrewProfileStorage';
import type { BrewProfilePoint, BrewRecord } from '../brew/types';

export class BrewProfileModal extends Modal {
	private subtitle: string;
	private record?: BrewRecord;
	private resolvePoints: () => Promise<BrewProfilePoint[]>;
	private wheelHandler: ((e: WheelEvent) => void) | null = null;

	constructor(app: App, subtitle: string, record: BrewRecord, profileStorage: BrewProfileStorage);
	constructor(app: App, subtitle: string, points: BrewProfilePoint[]);
	constructor(
		app: App,
		subtitle: string,
		recordOrPoints: BrewRecord | BrewProfilePoint[],
		profileStorage?: BrewProfileStorage,
	) {
		super(app);
		this.subtitle = subtitle;
		if (Array.isArray(recordOrPoints)) {
			this.resolvePoints = async () => recordOrPoints;
		} else {
			this.record = recordOrPoints;
			this.resolvePoints = recordOrPoints.profilePath
				? () => profileStorage!.load(recordOrPoints.profilePath!)
				: async () => [];
		}
	}

	async onOpen(): Promise<void> {
		this.modalEl.addClass('brew-profile-modal');
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
		const okBtn = footer.createEl('button', { text: '확인', cls: 'mod-cta' });
		okBtn.addEventListener('click', () => this.close());
	}

	onClose(): void {
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
			items.push(['수온', `${record.waterTemp}°C`]);
			items.push(['필터', record.filter]);
		} else {
			items.push(['바스켓', record.basket]);
		}

		for (const [label, value] of items) {
			const cell = grid.createDiv({ cls: 'brew-detail-cell' });
			cell.createDiv({ cls: 'brew-detail-label', text: label });
			cell.createDiv({ cls: 'brew-detail-value', text: value });
		}
	}
}
