import { Modal, type App } from 'obsidian';
import { BrewProfileChart } from './BrewProfileChart';
import type { BrewProfileStorage } from '../services/BrewProfileStorage';
import type { BrewProfilePoint } from '../brew/types';

export class BrewProfileModal extends Modal {
	private subtitle: string;
	private resolvePoints: () => Promise<BrewProfilePoint[]>;

	constructor(app: App, subtitle: string, profilePath: string, profileStorage: BrewProfileStorage);
	constructor(app: App, subtitle: string, points: BrewProfilePoint[]);
	constructor(
		app: App,
		subtitle: string,
		pathOrPoints: string | BrewProfilePoint[],
		profileStorage?: BrewProfileStorage,
	) {
		super(app);
		this.subtitle = subtitle;
		if (Array.isArray(pathOrPoints)) {
			this.resolvePoints = async () => pathOrPoints;
		} else {
			this.resolvePoints = () => profileStorage!.load(pathOrPoints);
		}
	}

	async onOpen(): Promise<void> {
		this.modalEl.addClass('brew-profile-modal');
		this.titleEl.setText('추출 그래프');
		this.contentEl.createDiv({ text: this.subtitle, cls: 'brew-profile-subtitle' });

		const points = await this.resolvePoints();
		if (points.length === 0) {
			this.contentEl.createDiv({ text: '프로파일 데이터 없음', cls: 'brew-profile-empty' });
			return;
		}

		const chartContainer = this.contentEl.createDiv({ cls: 'brew-profile-container' });
		const chart = new BrewProfileChart(chartContainer, Math.round(window.innerHeight * 0.6));
		chart.renderStatic(points);

		const footer = this.contentEl.createDiv({ cls: 'brew-profile-footer' });
		const okBtn = footer.createEl('button', { text: '확인', cls: 'mod-cta' });
		okBtn.addEventListener('click', () => this.close());
	}
}
