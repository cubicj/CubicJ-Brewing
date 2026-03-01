import { Modal } from 'obsidian';
import type CubicJBrewingPlugin from '../main';
import type { BeanInfo } from '../brew/types';

type TabId = 'bean' | 'recipe' | 'brew-equip' | 'espresso-equip';

interface TabDef {
	id: TabId;
	label: string;
	render: (container: HTMLElement) => void;
}

export class DataManageModal extends Modal {
	private plugin: CubicJBrewingPlugin;
	private activeTab: TabId = 'bean';
	private tabContentEl!: HTMLElement;
	private tabIndicatorEl!: HTMLElement;
	private tabs: TabDef[];

	constructor(plugin: CubicJBrewingPlugin) {
		super(plugin.app);
		this.plugin = plugin;
		this.tabs = [
			{ id: 'bean', label: '원두', render: (el) => this.renderBeanTab(el) },
			{ id: 'recipe', label: '레시피', render: (el) => this.renderRecipeTab(el) },
			{ id: 'brew-equip', label: '브루잉 장비', render: (el) => this.renderBrewEquipTab(el) },
			{ id: 'espresso-equip', label: '에쏘 장비', render: (el) => this.renderEspressoEquipTab(el) },
		];
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('cubicj-data-manage-modal');

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
		this.contentEl.empty();
	}

	private switchTab(id: TabId): void {
		if (id === this.activeTab) return;
		this.activeTab = id;

		this.contentEl.querySelectorAll('.dm-tab-btn').forEach((btn) => {
			(btn as HTMLElement).classList.toggle('is-active', (btn as HTMLElement).dataset.tab === id);
		});

		this.updateIndicator(true);
		this.renderActiveTab();
	}

	private updateIndicator(animate: boolean): void {
		const idx = this.tabs.findIndex(t => t.id === this.activeTab);
		this.tabIndicatorEl.style.transition = animate ? 'transform 0.25s ease' : 'none';
		this.tabIndicatorEl.style.width = `${100 / this.tabs.length}%`;
		this.tabIndicatorEl.style.transform = `translateX(${idx * 100}%)`;
	}

	private renderActiveTab(): void {
		this.tabContentEl.empty();
		const tab = this.tabs.find(t => t.id === this.activeTab);
		tab?.render(this.tabContentEl);
	}

	private renderBeanTab(container: HTMLElement): void {
		const headerEl = container.createDiv({ cls: 'dm-bean-header' });
		const newBtn = headerEl.createEl('button', { text: '+ 새 원두', cls: 'dm-btn dm-new-bean-btn' });
		newBtn.addEventListener('click', () => this.createNewBean());

		const listEl = container.createDiv({ cls: 'dm-bean-list' });
		const beans = this.plugin.vaultData.getAllBeans();
		const active = [...beans.filter(b => b.status === 'active')].sort((a, b) => a.name.localeCompare(b.name));
		const finished = [...beans.filter(b => b.status === 'finished')].sort((a, b) => a.name.localeCompare(b.name));

		if (active.length > 0) {
			for (const bean of active) this.renderBeanRow(listEl, bean);
		}

		if (finished.length > 0) {
			listEl.createDiv({ cls: 'dm-divider', text: '과거 원두' });
			for (const bean of finished) this.renderBeanRow(listEl, bean);
		}

		if (beans.length === 0) {
			listEl.createDiv({ cls: 'dm-empty', text: 'type: bean frontmatter가 있는 노트가 없어요' });
		}
	}

	private renderBeanRow(listEl: HTMLElement, bean: BeanInfo): void {
		const row = listEl.createDiv({ cls: `dm-row${bean.status === 'finished' ? ' is-finished' : ''}` });

		const info = row.createDiv({ cls: 'dm-row-info' });
		info.createDiv({ cls: 'dm-row-name', text: bean.name });

		const days = this.plugin.vaultData.getDaysSinceRoast(bean);
		const metaParts: string[] = [];
		if (days !== null) metaParts.push(`로스팅 ${days}일차`);
		if (bean.roastDate) metaParts.push(bean.roastDate);
		if (metaParts.length > 0) {
			info.createDiv({ cls: 'dm-row-meta', text: metaParts.join(' · ') });
		}

		row.addEventListener('click', () => {
			this.close();
			this.plugin.app.workspace.openLinkText(bean.path, '');
		});
		row.style.cursor = 'pointer';
	}

	private async createNewBean(): Promise<void> {
		const folder = '3. Resources';
		let name = '새 원두';
		let path = `${folder}/${name}.md`;
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(path)) {
			counter++;
			name = `새 원두 ${counter}`;
			path = `${folder}/${name}.md`;
		}

		const template = [
			'---',
			'type: bean',
			'roaster:',
			'status: active',
			'roast_date:',
			'---',
			'',
		].join('\n');

		await this.app.vault.create(path, template);
		this.close();
		await this.app.workspace.openLinkText(path, '');
	}

	private renderRecipeTab(container: HTMLElement): void {
		container.createDiv({ cls: 'dm-empty', text: '준비 중' });
	}

	private renderBrewEquipTab(container: HTMLElement): void {
		container.createDiv({ cls: 'dm-empty', text: '준비 중' });
	}

	private renderEspressoEquipTab(container: HTMLElement): void {
		container.createDiv({ cls: 'dm-empty', text: '준비 중' });
	}
}
