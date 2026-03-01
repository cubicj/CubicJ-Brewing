import type { App, MarkdownPostProcessorContext } from 'obsidian';
import type { BrewRecordService } from '../services/BrewRecordService';
import type { BrewProfileStorage } from '../services/BrewProfileStorage';
import type { BrewRecord } from '../brew/types';
import { BrewProfileModal } from './BrewProfileModal';

export class BrewCodeBlock {
	private containers: WeakRef<HTMLElement>[] = [];

	constructor(
		private app: App,
		private recordService: BrewRecordService,
		private profileStorage: BrewProfileStorage,
	) {}

	register(registerFn: (lang: string, handler: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void) => void): void {
		registerFn('brews', (_source, el, ctx) => {
			this.containers.push(new WeakRef(el));
			this.renderAsync(el, ctx.sourcePath);
		});
	}

	refreshAll(): void {
		this.containers = this.containers.filter(ref => {
			const el = ref.deref();
			if (!el || !el.isConnected) return false;
			const path = el.dataset.sourcePath;
			if (path) this.renderAsync(el, path);
			return true;
		});
	}

	private async renderAsync(el: HTMLElement, sourcePath: string): Promise<void> {
		el.dataset.sourcePath = sourcePath;
		const beanName = this.resolveBeanName(sourcePath);
		if (!beanName) {
			el.empty();
			el.createDiv({ text: 'type: bean 노트에서만 사용 가능', cls: 'brew-records-empty' });
			return;
		}

		const records = await this.recordService.getByBean(beanName);
		this.render(el, records, beanName);
	}

	private resolveBeanName(sourcePath: string): string | null {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!file || !('extension' in file)) return null;
		const cache = this.app.metadataCache.getFileCache(file as any);
		if (cache?.frontmatter?.type !== 'bean') return null;
		return cache.frontmatter.name ?? file.name.replace(/\.md$/, '');
	}

	private render(el: HTMLElement, records: BrewRecord[], beanName: string): void {
		el.empty();
		el.addClass('brew-records');
		el.createEl('h3', { text: '브루잉 기록', cls: 'brew-records-header' });

		if (records.length === 0) {
			el.createDiv({ text: '아직 브루잉 기록이 없어요', cls: 'brew-records-empty' });
			return;
		}

		const table = el.createEl('table', { cls: 'brew-record-table' });
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		for (const col of ['날짜', '로스팅', '분쇄', 'dose', 'time', 'yield', '메모', '그래프']) {
			headerRow.createEl('th', { text: col });
		}

		const tbody = table.createEl('tbody');
		for (const record of records) {
			const tr = tbody.createEl('tr');
			tr.createEl('td', { text: this.formatDate(record.timestamp) });
			tr.createEl('td', { text: record.roastDays !== null ? `${record.roastDays}일` : '-' });
			tr.createEl('td', { text: String(record.grindSize) });
			tr.createEl('td', { text: `${record.dose}g` });
			tr.createEl('td', { text: record.time ? this.formatTime(record.time) : '-' });
			tr.createEl('td', { text: record.yield ? `${record.yield}g` : '-' });
			tr.createEl('td', { text: record.note ?? '', cls: 'brew-record-note' });

			const actionTd = tr.createEl('td');
			if (record.profilePath) {
				const btn = actionTd.createEl('button', { text: '📊', cls: 'brew-record-chart-btn' });
				btn.addEventListener('click', () => {
					const title = `${beanName} — ${this.formatDate(record.timestamp)}`;
					new BrewProfileModal(this.app, title, record.profilePath!, this.profileStorage).open();
				});
			}
		}
	}

	private formatDate(iso: string): string {
		const d = new Date(iso);
		const month = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		const hour = String(d.getHours()).padStart(2, '0');
		const min = String(d.getMinutes()).padStart(2, '0');
		return `${d.getFullYear()}-${month}-${day} ${hour}:${min}`;
	}

	private formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${String(s).padStart(2, '0')}`;
	}
}
