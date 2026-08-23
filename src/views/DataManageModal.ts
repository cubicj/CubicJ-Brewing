import { Modal } from 'obsidian';
import type CubicJBrewingPlugin from '../main';
import { t } from '../i18n/index';
import { BeanManagePanel } from './dataManage/BeanManagePanel';
import { EquipmentManagePanel } from './dataManage/EquipmentManagePanel';

type TabId = 'bean' | 'recipe' | 'equip';

interface TabDef {
	id: TabId;
	label: string;
	render: (container: HTMLElement) => void;
}

export class DataManageModal extends Modal {
	private activeTab: TabId = 'bean';
	private tabContentEl!: HTMLElement;
	private tabIndicatorEl!: HTMLElement;
	private tabs: TabDef[];
	private beanPanel: BeanManagePanel;
	private equipmentPanel: EquipmentManagePanel;

	constructor(plugin: CubicJBrewingPlugin) {
		super(plugin.app);
		this.beanPanel = new BeanManagePanel({
			app: plugin.app,
			vaultData: plugin.vaultData,
			close: () => this.close(),
			openLink: (path) => void plugin.app.workspace.openLinkText(path, ''),
			getHubNotePath: () => plugin.getBeanHubNote(),
			getScaleWeight: () => plugin.getScaleWeight?.() ?? null,
			refreshCodeBlocks: () => plugin.beanBlock.refreshAll(),
		});
		this.equipmentPanel = new EquipmentManagePanel({
			equipment: plugin.equipment,
			saveEquipment: () => plugin.saveEquipment(),
		});
		this.tabs = [
			{ id: 'bean', label: t('dataManage.beans'), render: (container) => this.beanPanel.render(container) },
			{ id: 'recipe', label: t('dataManage.recipes'), render: (container) => this.renderRecipeTab(container) },
			{ id: 'equip', label: t('dataManage.equipment'), render: (container) => this.equipmentPanel.render(container) },
		];
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('cubicj-data-manage-modal');
		this.modalEl.addClass('cubicj-data-manage-modal-container');

		const tabBar = contentEl.createDiv({ cls: 'dm-tab-bar' });
		for (const tab of this.tabs) {
			const btn = tabBar.createEl('button', {
				text: tab.label,
				cls: `dm-tab-btn${tab.id === this.activeTab ? ' is-active' : ''}`,
			});
			btn.dataset.tab = tab.id;
			btn.addEventListener('click', () => this.switchTab(tab.id));
		}
		this.tabIndicatorEl = tabBar.createDiv({ cls: 'dm-tab-indicator' });
		this.updateIndicator(false);

		this.tabContentEl = contentEl.createDiv({ cls: 'dm-tab-content' });
		this.renderActiveTab();
	}

	onClose(): void {
		this.equipmentPanel.dispose();
		this.contentEl.empty();
	}

	private switchTab(id: TabId): void {
		if (id === this.activeTab) return;
		if (this.activeTab === 'equip') this.equipmentPanel.dispose();
		this.activeTab = id;

		this.contentEl.querySelectorAll<HTMLElement>('.dm-tab-btn').forEach((btn) => {
			btn.classList.toggle('is-active', btn.dataset.tab === id);
		});

		this.updateIndicator(true);
		this.renderActiveTab();
	}

	private updateIndicator(animate: boolean): void {
		const idx = this.tabs.findIndex((tab) => tab.id === this.activeTab);
		this.tabIndicatorEl.style.transition = animate ? 'transform 0.25s ease' : 'none';
		this.tabIndicatorEl.style.width = `${100 / this.tabs.length}%`;
		this.tabIndicatorEl.style.transform = `translateX(${idx * 100}%)`;
	}

	private renderActiveTab(): void {
		this.tabContentEl.empty();
		const tab = this.tabs.find((candidate) => candidate.id === this.activeTab);
		tab?.render(this.tabContentEl);
	}

	private renderRecipeTab(container: HTMLElement): void {
		container.createDiv({ cls: 'dm-empty', text: t('dataManage.comingSoon') });
	}
}
