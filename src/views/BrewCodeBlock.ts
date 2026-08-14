import { type App, TFile, type MarkdownPostProcessorContext } from 'obsidian';
import type { BrewRecordService } from '../services/BrewRecordService';
import type { BrewProfileStorage } from '../services/BrewProfileStorage';
import type { EquipmentSettings } from '../brew/types';
import { t } from '../i18n/index';
import type { BeanWeightService } from '../services/BeanWeightService';
import { renderBrewRecordTable } from './BrewRecordTable';
import { CodeBlockRefreshRegistry } from './CodeBlockRefreshRegistry';

export class BrewCodeBlock {
	private registry = new CodeBlockRefreshRegistry();

	constructor(
		private app: App,
		private recordService: BrewRecordService,
		private profileStorage: BrewProfileStorage,
		private getEquipment: () => EquipmentSettings,
		private vaultData?: BeanWeightService,
	) {}

	register(
		registerFn: (
			lang: string,
			handler: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void,
		) => void,
	): void {
		registerFn('brews', (_source, el, ctx) => {
			this.registry.track(el);
			void this.renderAsync(el, ctx.sourcePath);
		});
	}

	refreshAll(): void {
		this.registry.refreshAll((el) => {
			const path = el.dataset.sourcePath;
			if (path) void this.renderAsync(el, path);
		});
	}

	private async renderAsync(el: HTMLElement, sourcePath: string): Promise<void> {
		const renderToken = this.registry.beginRender(el);
		el.dataset.sourcePath = sourcePath;
		let beanName = this.resolveBeanName(sourcePath);
		if (!beanName) {
			await new Promise<void>((resolve) => {
				const timer = window.setTimeout(() => {
					this.app.metadataCache.offref(ref);
					resolve();
				}, 3000);
				const ref = this.app.metadataCache.on('resolved', () => {
					window.clearTimeout(timer);
					this.app.metadataCache.offref(ref);
					resolve();
				});
			});
			if (!this.registry.isCurrent(el, renderToken)) return;
			beanName = this.resolveBeanName(sourcePath);
		}
		if (!beanName) {
			el.empty();
			el.createDiv({ text: t('record.beanOnly'), cls: 'brew-records-empty' });
			return;
		}

		const byBeanResult = await this.recordService.getByBean(beanName);
		if (!this.registry.isCurrent(el, renderToken)) return;
		const records = byBeanResult.ok ? byBeanResult.data : [];
		renderBrewRecordTable(el, records, beanName, {
			app: this.app,
			recordService: this.recordService,
			profileStorage: this.profileStorage,
			getEquipment: this.getEquipment,
			vaultData: this.vaultData,
		});
	}

	private resolveBeanName(sourcePath: string): string | null {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return null;
		const cache = this.app.metadataCache.getFileCache(file);
		if (cache?.frontmatter?.type !== 'bean') return null;
		const name: unknown = cache.frontmatter.name;
		return typeof name === 'string' ? name : file.name.replace(/\.md$/, '');
	}
}
