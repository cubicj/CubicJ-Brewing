import type { App } from 'obsidian';
import type { BeanInfo } from '../../brew/types';
import { t } from '../../i18n/index';
import type { VaultDataService } from '../../services/VaultDataService';
import { renderActiveBeanRow, renderFinishedBeanRow } from '../BeanRowRenderer';
import { openWeightPopover, type WeightPopoverHandle } from '../BeanWeightPopover';
import { createNewBean, getSortedBeans } from '../beanHelpers';

export interface BeanManagePanelDeps {
	app: App;
	vaultData: VaultDataService;
	close: () => void;
	openLink: (path: string) => void;
	getHubNotePath: () => string;
	getScaleWeight: () => number | null;
	refreshCodeBlocks: () => void;
}

export class BeanManagePanel {
	private weightPopoverHandle: WeightPopoverHandle | null = null;

	constructor(private deps: BeanManagePanelDeps) {}

	render(container: HTMLElement): void {
		this.closeWeightPopover();
		container.empty();
		const headerEl = container.createDiv({ cls: 'cb-bean-header' });

		const hubPath = this.deps.getHubNotePath();
		if (hubPath && this.deps.app.vault.getFileByPath(hubPath)) {
			const hubBtn = headerEl.createEl('button', { text: t('bean.openHub'), cls: 'cb-bean-btn cb-bean-hub-btn' });
			hubBtn.addEventListener('click', () => {
				this.deps.close();
				this.deps.openLink(hubPath);
			});
		}

		const newBtn = headerEl.createEl('button', { text: t('bean.new'), cls: 'cb-bean-btn cb-bean-new-btn' });
		newBtn.addEventListener('click', () => void this.handleCreateNewBean());

		const { active, finished } = getSortedBeans(this.deps.vaultData);
		const onChange = () => {
			this.render(container);
			this.deps.refreshCodeBlocks();
		};
		const rowDeps = {
			vaultData: this.deps.vaultData,
			onNameClick: (bean: BeanInfo) => {
				this.deps.close();
				this.deps.openLink(bean.path);
			},
			onStatusChange: onChange,
			onWeightClick: (anchor: HTMLElement, bean: BeanInfo) => {
				this.closeWeightPopover();
				this.weightPopoverHandle = openWeightPopover(
					anchor,
					bean,
					this.deps.vaultData,
					onChange,
					this.deps.getScaleWeight,
					{ inModal: true },
				);
			},
		};

		if (active.length > 0) {
			const card = container.createDiv({ cls: 'dm-card' });
			card.createDiv({ cls: 'dm-card-title', text: t('bean.activeBeans') });
			for (const bean of active) renderActiveBeanRow(card, bean, rowDeps);
		}

		if (finished.length > 0) {
			const card = container.createDiv({ cls: 'dm-card' });
			card.createDiv({ cls: 'dm-card-title', text: t('bean.pastBeans') });
			for (const bean of finished) renderFinishedBeanRow(card, bean, rowDeps);
		}

		if (active.length === 0 && finished.length === 0) {
			container.createDiv({ cls: 'dm-empty', text: t('bean.emptyState') });
		}
	}

	dispose(): void {
		this.closeWeightPopover();
	}

	private closeWeightPopover(): void {
		this.weightPopoverHandle?.close();
		this.weightPopoverHandle = null;
	}

	private async handleCreateNewBean(): Promise<void> {
		const created = await createNewBean(this.deps.app, this.deps.vaultData);
		if (created) this.deps.close();
	}
}
