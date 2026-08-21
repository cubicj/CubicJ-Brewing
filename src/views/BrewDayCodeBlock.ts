import { Keymap, TFile, type App, type MarkdownPostProcessorContext } from 'obsidian';
import type { EquipmentSettings } from '../brew/types';
import { t } from '../i18n/index';
import type { BrewProfileStorage } from '../services/BrewProfileStorage';
import type { BrewRecordService } from '../services/BrewRecordService';
import { groupRecordsByBeanForDay, parseDailyNoteDateFromPath } from './brewDayRecords';
import type { BeanWeightService } from '../services/BeanWeightService';
import { renderBrewRecordTable } from './BrewRecordTable';
import { CodeBlockRefreshRegistry } from './CodeBlockRefreshRegistry';

export class BrewDayCodeBlock {
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
		registerFn('brew-day', (_source, el, ctx) => {
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
		el.empty();
		el.addClass('brew-day-records');

		const date = parseDailyNoteDateFromPath(sourcePath);
		if (!date) {
			el.createDiv({ text: t('record.dayInvalidFileName'), cls: 'brew-records-empty' });
			return;
		}

		const result = await this.recordService.getAll();
		if (!this.registry.isCurrent(el, renderToken)) return;
		const records = result.ok ? result.data : [];
		const groups = groupRecordsByBeanForDay(records, date);

		if (groups.length === 0) {
			el.createDiv({ text: t('record.dayEmpty'), cls: 'brew-records-empty' });
			return;
		}

		const beans = this.vaultData?.getAllBeans() ?? [];
		for (const group of groups) {
			const beanPath = beans.find((bean) => bean.name === group.bean)?.path;
			const section = el.createDiv({ cls: 'brew-day-record-group' });
			renderBrewRecordTable(section, group.records, group.bean, {
				app: this.app,
				recordService: this.recordService,
				profileStorage: this.profileStorage,
				getEquipment: this.getEquipment,
				vaultData: this.vaultData,
				headerText: group.bean,
				onHeaderClick: beanPath === undefined ? undefined : (evt) => this.openBeanNote(beanPath, evt),
			});
		}
	}

	private openBeanNote(path: string, evt: MouseEvent): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		void this.app.workspace.getLeaf(Keymap.isModEvent(evt)).openFile(file);
	}
}
