import type { App, MarkdownPostProcessorContext } from 'obsidian';
import type { EquipmentSettings } from '../brew/types';
import { t } from '../i18n/index';
import type { BrewProfileStorage } from '../services/BrewProfileStorage';
import type { BrewRecordService } from '../services/BrewRecordService';
import { groupRecordsByBeanForDay, parseDailyNoteDateFromPath } from './brewDayRecords';
import type { BeanWeightService } from './BrewProfileModal';
import { renderBrewRecordTable } from './BrewRecordTable';

export class BrewDayCodeBlock {
	private containers: WeakRef<HTMLElement>[] = [];
	private renderTokens = new WeakMap<HTMLElement, number>();
	private nextRenderToken = 0;

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
		registerFn('brew-day', (_source, el, ctx) => {
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
		const renderToken = ++this.nextRenderToken;
		this.renderTokens.set(el, renderToken);
		el.dataset.sourcePath = sourcePath;
		el.empty();
		el.addClass('brew-day-records');

		const date = parseDailyNoteDateFromPath(sourcePath);
		if (!date) {
			el.createDiv({ text: t('record.dayInvalidFileName'), cls: 'brew-records-empty' });
			return;
		}

		const result = await this.recordService.getAll();
		if (this.renderTokens.get(el) !== renderToken) return;
		const records = result.ok ? result.data : [];
		const groups = groupRecordsByBeanForDay(records, date);

		if (groups.length === 0) {
			el.createDiv({ text: t('record.dayEmpty'), cls: 'brew-records-empty' });
			return;
		}

		for (const group of groups) {
			const section = el.createDiv({ cls: 'brew-day-record-group' });
			renderBrewRecordTable(section, group.records, group.bean, {
				app: this.app,
				recordService: this.recordService,
				profileStorage: this.profileStorage,
				getEquipment: this.getEquipment,
				vaultData: this.vaultData,
				headerText: group.bean,
			});
		}
	}
}
