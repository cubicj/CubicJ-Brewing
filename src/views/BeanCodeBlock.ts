import type { App, MarkdownPostProcessorContext } from 'obsidian';
import type { VaultDataService } from '../services/VaultDataService';
import type { BeanInfo } from '../brew/types';
import { t } from '../i18n/index';
import { renderActiveBeanRow, renderFinishedBeanRow } from './BeanRowRenderer';
import { openWeightPopover } from './BeanWeightPopover';
import { createNewBean, getSortedBeans } from './beanHelpers';
import { CodeBlockRefreshRegistry } from './CodeBlockRefreshRegistry';

export class BeanCodeBlock {
	private registry = new CodeBlockRefreshRegistry();
	private getScaleWeight: (() => number | null) | null = null;

	constructor(
		private app: App,
		private vaultData: VaultDataService,
	) {}

	updateVaultData(vaultData: VaultDataService): void {
		this.vaultData = vaultData;
	}

	setScaleWeightGetter(fn: () => number | null): void {
		this.getScaleWeight = fn;
	}

	register(
		registerFn: (
			lang: string,
			handler: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void,
		) => void,
	): void {
		registerFn('beans', (_source, el, _ctx) => {
			this.registry.track(el);
			this.render(el);
		});
	}

	refreshAll(): void {
		this.registry.refreshAll((el) => this.render(el));
	}

	render(el: HTMLElement): void {
		el.empty();
		el.addClass('cb-bean-hub');

		const header = el.createDiv({ cls: 'cb-bean-header' });
		const newBtn = header.createEl('button', { text: t('bean.new'), cls: 'cb-bean-btn cb-bean-new-btn' });
		newBtn.addEventListener('click', () => void this.createNewBean());

		const { active, finished } = getSortedBeans(this.vaultData);

		const deps = {
			vaultData: this.vaultData,
			onNameClick: (bean: BeanInfo) => void this.app.workspace.openLinkText(bean.path, ''),
			onStatusChange: () => this.refreshAll(),
			onWeightClick: (anchor: HTMLElement, bean: BeanInfo) =>
				openWeightPopover(anchor, bean, this.vaultData, () => this.refreshAll(), this.getScaleWeight),
		};

		if (active.length > 0) {
			el.createDiv({ cls: 'cb-bean-section-title', text: t('bean.activeBeans') });
			for (const bean of active) renderActiveBeanRow(el, bean, deps);
		}

		if (finished.length > 0) {
			el.createDiv({ cls: 'cb-bean-section-title cb-bean-section-past', text: t('bean.pastBeans') });
			for (const bean of finished) renderFinishedBeanRow(el, bean, deps);
		}

		if (active.length === 0 && finished.length === 0) {
			el.createDiv({ cls: 'cb-bean-empty', text: t('bean.emptyState') });
		}
	}

	private createNewBean(): Promise<boolean> {
		return createNewBean(this.app, this.vaultData);
	}
}
