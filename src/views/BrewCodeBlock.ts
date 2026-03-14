import { type App, type TFile, type MarkdownPostProcessorContext, setIcon } from 'obsidian';
import type { BrewRecordService } from '../services/BrewRecordService';
import type { BrewProfileStorage } from '../services/BrewProfileStorage';
import type { BrewRecord, EquipmentSettings } from '../brew/types';
import { getDrinkLabel, getMethodLabel } from '../brew/constants';
import { t } from '../i18n/index';
import { BrewProfileModal } from './BrewProfileModal';
import { formatBrewDate } from '../utils/format';

export class BrewCodeBlock {
	private containers: WeakRef<HTMLElement>[] = [];

	constructor(
		private app: App,
		private recordService: BrewRecordService,
		private profileStorage: BrewProfileStorage,
		private getEquipment: () => EquipmentSettings,
	) {}

	register(
		registerFn: (
			lang: string,
			handler: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void,
		) => void,
	): void {
		registerFn('brews', (_source, el, ctx) => {
			this.containers.push(new WeakRef(el));
			this.renderAsync(el, ctx.sourcePath);
		});
	}

	refreshAll(): void {
		this.containers = this.containers.filter((ref) => {
			const el = ref.deref();
			if (!el || !el.isConnected) return false;
			const path = el.dataset.sourcePath;
			if (path) this.renderAsync(el, path);
			return true;
		});
	}

	private async renderAsync(el: HTMLElement, sourcePath: string): Promise<void> {
		el.dataset.sourcePath = sourcePath;
		let beanName = this.resolveBeanName(sourcePath);
		if (!beanName) {
			await new Promise<void>((resolve) => {
				const ref = this.app.metadataCache.on('resolved', () => {
					this.app.metadataCache.offref(ref);
					resolve();
				});
			});
			beanName = this.resolveBeanName(sourcePath);
		}
		if (!beanName) {
			el.empty();
			el.createDiv({ text: t('record.beanOnly'), cls: 'brew-records-empty' });
			return;
		}

		const records = await this.recordService.getByBean(beanName);
		this.render(el, records, beanName);
	}

	private resolveBeanName(sourcePath: string): string | null {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!file || !('extension' in file)) return null;
		const cache = this.app.metadataCache.getFileCache(file as TFile);
		if (cache?.frontmatter?.type !== 'bean') return null;
		return cache.frontmatter.name ?? file.name.replace(/\.md$/, '');
	}

	private render(el: HTMLElement, records: BrewRecord[], beanName: string): void {
		el.empty();
		el.addClass('brew-records');

		el.createEl('h3', { text: t('record.header'), cls: 'brew-records-header' });

		if (records.length === 0) {
			el.createDiv({ text: t('record.empty'), cls: 'brew-records-empty' });
			return;
		}

		const table = el.createEl('table', { cls: 'brew-record-table' });
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		for (const col of [t('record.date'), t('record.method'), t('record.memo'), t('record.detail')]) {
			headerRow.createEl('th', { text: col });
		}

		const tbody = table.createEl('tbody');
		for (const record of records) {
			const tr = tbody.createEl('tr');
			const dateTd = tr.createEl('td', { cls: 'brew-record-date' });
			const { date, time } = formatBrewDate(record.timestamp);
			dateTd.createDiv({ text: date });
			dateTd.createDiv({ text: time });
			const method = record.method === 'espresso' ? getDrinkLabel(record.drink ?? 'shot') : getMethodLabel('filter');
			const temp = record.temp === 'iced' ? 'Ice' : 'Hot';
			tr.createEl('td', { text: `${method}(${temp})` });
			tr.createEl('td', { text: record.note ?? '', cls: 'brew-record-note' });

			const actionTd = tr.createEl('td');
			const btn = actionTd.createEl('button', { cls: 'brew-record-chart-btn' });
			setIcon(btn, 'list');
			btn.addEventListener('click', () => {
				const title = `${beanName} — ${this.formatDate(record.timestamp)}`;
				new BrewProfileModal(this.app, title, {
					type: 'detail',
					record,
					recordService: this.recordService,
					profileStorage: this.profileStorage,
					equipment: this.getEquipment(),
				}).open();
			});
		}
	}

	private formatDate(iso: string): string {
		const { date, time } = formatBrewDate(iso);
		return `${date} · ${time}`;
	}
}
