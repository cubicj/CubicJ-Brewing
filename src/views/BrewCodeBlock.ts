import { type App, type TFile, type MarkdownPostProcessorContext } from 'obsidian';
import type { BrewRecordService } from '../services/BrewRecordService';
import type { BrewProfileStorage } from '../services/BrewProfileStorage';
import type { EquipmentSettings } from '../brew/types';
import { t } from '../i18n/index';
import type { BeanWeightService } from '../services/BeanWeightService';
import { renderBrewRecordTable } from './BrewRecordTable';

export class BrewCodeBlock {
	private containers: WeakRef<HTMLElement>[] = [];

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
			this.containers.push(new WeakRef(el));
			this.renderAsync(el, ctx.sourcePath);
		});
	}

	refreshAll(): void {
		this.containers = this.containers.filter((ref) => {
			const el = ref.deref();
			if (!el) return false;
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
				const timer = setTimeout(() => {
					this.app.metadataCache.offref(ref);
					resolve();
				}, 3000);
				const ref = this.app.metadataCache.on('resolved', () => {
					clearTimeout(timer);
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

		const byBeanResult = await this.recordService.getByBean(beanName);
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
		if (!file || !('extension' in file)) return null;
		const cache = this.app.metadataCache.getFileCache(file as TFile);
		if (cache?.frontmatter?.type !== 'bean') return null;
		return cache.frontmatter.name ?? file.name.replace(/\.md$/, '');
	}
}
