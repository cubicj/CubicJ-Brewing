import { Modal, Notice, setIcon } from 'obsidian';
import type CubicJBrewingPlugin from '../main';
import type { GrinderConfig, EquipmentSettings } from '../brew/types';
import { BEAN_NOTE_EXTRA } from '../brew/constants';
import { t } from '../i18n/index';
import { renderActiveBeanRow, renderFinishedBeanRow } from './BeanRowRenderer';

type TabId = 'bean' | 'recipe' | 'equip';

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
			{ id: 'bean', label: t('dataManage.beans'), render: (el) => this.renderBeanTab(el) },
			{ id: 'recipe', label: t('dataManage.recipes'), render: (el) => this.renderRecipeTab(el) },
			{ id: 'equip', label: t('dataManage.equipment'), render: (el) => this.renderEquipTab(el) },
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
		const idx = this.tabs.findIndex((t) => t.id === this.activeTab);
		this.tabIndicatorEl.style.transition = animate ? 'transform 0.25s ease' : 'none';
		this.tabIndicatorEl.style.width = `${100 / this.tabs.length}%`;
		this.tabIndicatorEl.style.transform = `translateX(${idx * 100}%)`;
	}

	private renderActiveTab(): void {
		this.tabContentEl.empty();
		const tab = this.tabs.find((t) => t.id === this.activeTab);
		tab?.render(this.tabContentEl);
	}

	private renderBeanTab(container: HTMLElement): void {
		const headerEl = container.createDiv({ cls: 'cb-bean-header' });
		const newBtn = headerEl.createEl('button', { text: t('bean.new'), cls: 'cb-bean-btn cb-bean-new-btn' });
		newBtn.addEventListener('click', () => this.createNewBean());

		const beans = this.plugin.vaultData.getAllBeans();
		const active = [...beans.filter((b) => b.status === 'active')].sort((a, b) => a.name.localeCompare(b.name));
		const finished = [...beans.filter((b) => b.status === 'finished')].sort((a, b) => a.name.localeCompare(b.name));

		const deps = {
			vaultData: this.plugin.vaultData,
			onNameClick: (bean: { path: string }) => {
				this.close();
				this.plugin.app.workspace.openLinkText(bean.path, '');
			},
			onStatusChange: () => this.renderActiveTab(),
		};

		if (active.length > 0) {
			const card = container.createDiv({ cls: 'dm-card' });
			card.createDiv({ cls: 'dm-card-title', text: t('bean.activeBeans') });
			for (const bean of active) renderActiveBeanRow(card, bean, deps);
		}

		if (finished.length > 0) {
			const card = container.createDiv({ cls: 'dm-card' });
			card.createDiv({ cls: 'dm-card-title', text: t('bean.pastBeans') });
			for (const bean of finished) renderFinishedBeanRow(card, bean, deps);
		}

		if (beans.length === 0) {
			container.createDiv({ cls: 'dm-empty', text: t('bean.emptyState') });
		}
	}

	private async createNewBean(): Promise<void> {
		try {
			const result = await this.plugin.vaultData.createBeanNote(BEAN_NOTE_EXTRA);
			if (!result.ok) throw new Error(result.error.message);
			this.close();
			await this.app.workspace.openLinkText(result.data, '');
		} catch (err) {
			console.error('[DataManageModal] createNewBean failed:', err);
			new Notice(t('error.beanCreate'));
		}
	}

	private renderRecipeTab(container: HTMLElement): void {
		container.createDiv({ cls: 'dm-empty', text: t('dataManage.comingSoon') });
	}

	private renderEquipTab(container: HTMLElement): void {
		const eq = this.plugin.equipment;

		this.renderEquipSection(container, t('equip.shared'), [
			{ label: t('equipment.grinder'), items: eq.grinders, key: 'grinders' },
		]);
		this.renderEquipSection(container, t('equip.filterBrewing'), [
			{ label: t('equipment.dripper'), items: eq.drippers, key: 'drippers' },
			{ label: t('equipment.filter'), items: eq.filters, key: 'filters' },
		]);
		this.renderEquipSection(container, t('method.espresso'), [
			{ label: t('equipment.basket'), items: eq.baskets, key: 'baskets' },
			{ label: t('equipment.accessory'), items: eq.accessories, key: 'accessories' },
		]);
	}

	private renderEquipSection(
		container: HTMLElement,
		categoryLabel: string,
		lists: Array<{ label: string; items: string[] | GrinderConfig[]; key: keyof EquipmentSettings }>,
	): void {
		const section = container.createDiv({ cls: 'dm-equip-section' });
		section.createDiv({ cls: 'dm-equip-category', text: categoryLabel });
		for (const list of lists) {
			if (list.key === 'grinders') {
				this.renderGrinderList(section, list.label);
			} else {
				this.renderStringList(section, list.label, list.key as Exclude<keyof EquipmentSettings, 'grinders'>);
			}
		}
	}

	private renderStringList(
		container: HTMLElement,
		label: string,
		key: Exclude<keyof EquipmentSettings, 'grinders'>,
	): void {
		const section = container.createDiv({ cls: 'dm-equip-list' });
		const header = section.createDiv({ cls: 'dm-equip-list-header' });
		header.createSpan({ text: label });
		const addBtn = header.createEl('button', { cls: 'clickable-icon dm-equip-add-btn' });
		setIcon(addBtn, 'plus');

		const listEl = section.createDiv({ cls: 'dm-equip-items' });
		const items = this.plugin.equipment[key] as string[];

		const renderItems = () => {
			listEl.empty();
			if (items.length === 0) {
				listEl.createDiv({ cls: 'dm-empty', text: t('dataManage.addPrompt', { label }) });
				return;
			}
			for (let i = 0; i < items.length; i++) {
				const row = listEl.createDiv({ cls: 'dm-equip-row' });
				row.createSpan({ text: items[i] });
				const delBtn = row.createEl('button', { text: '\u2715', cls: 'dm-btn dm-equip-del-btn' });
				delBtn.addEventListener('click', async () => {
					try {
						items.splice(i, 1);
						await this.plugin.saveEquipment();
						renderItems();
					} catch (err) {
						console.error('[DataManageModal] equipment delete failed:', err);
						new Notice(t('error.equipSave'));
					}
				});
			}
		};
		renderItems();

		addBtn.addEventListener('click', () => {
			const formEl = section.createDiv({ cls: 'dm-equip-grinder-form' });
			const input = formEl.createEl('input', {
				type: 'text',
				cls: 'dm-equip-input',
				placeholder: label,
				attr: { spellcheck: 'false' },
			});

			const btnRow = formEl.createDiv({ cls: 'dm-equip-grinder-actions' });
			const saveBtn = btnRow.createEl('button', { text: t('bean.add'), cls: 'dm-btn dm-btn-accent' });
			const cancelBtn = btnRow.createEl('button', { text: t('common.cancel'), cls: 'dm-btn dm-btn-muted' });

			input.focus();

			saveBtn.addEventListener('click', async () => {
				const val = input.value.trim();
				if (!val || items.includes(val)) return;
				try {
					items.push(val);
					await this.plugin.saveEquipment();
					formEl.remove();
					renderItems();
				} catch (err) {
					console.error('[DataManageModal] equipment add failed:', err);
					new Notice(t('error.equipSave'));
				}
			});
			cancelBtn.addEventListener('click', () => formEl.remove());
			input.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') saveBtn.click();
				if (e.key === 'Escape') formEl.remove();
			});
		});
	}

	private renderGrinderList(container: HTMLElement, label: string): void {
		const section = container.createDiv({ cls: 'dm-equip-list' });
		const header = section.createDiv({ cls: 'dm-equip-list-header' });
		header.createSpan({ text: label });
		const addBtn = header.createEl('button', { cls: 'clickable-icon dm-equip-add-btn' });
		setIcon(addBtn, 'plus');

		const listEl = section.createDiv({ cls: 'dm-equip-items' });
		const grinders = this.plugin.equipment.grinders;

		const renderItems = () => {
			listEl.empty();
			if (grinders.length === 0) {
				listEl.createDiv({ cls: 'dm-empty', text: t('dataManage.addPrompt', { label }) });
				return;
			}
			for (let i = 0; i < grinders.length; i++) {
				const g = grinders[i];
				const row = listEl.createDiv({ cls: 'dm-equip-row' });
				row.createSpan({ cls: 'dm-equip-grinder-name', text: g.name });
				row.createSpan({
					cls: 'dm-equip-grinder-meta',
					text: `${t('equip.grindRange')}: ${g.min}~${g.max}, ${t('equip.stepSize')}: ${g.step}`,
				});
				const delBtn = row.createEl('button', { text: '\u2715', cls: 'dm-btn dm-equip-del-btn' });
				delBtn.addEventListener('click', async () => {
					try {
						grinders.splice(i, 1);
						await this.plugin.saveEquipment();
						renderItems();
					} catch (err) {
						console.error('[DataManageModal] grinder delete failed:', err);
						new Notice(t('error.equipSave'));
					}
				});
			}
		};
		renderItems();

		addBtn.addEventListener('click', () => {
			const formEl = section.createDiv({ cls: 'dm-equip-grinder-form' });
			const nameInput = formEl.createEl('input', {
				type: 'text',
				cls: 'dm-equip-input',
				placeholder: t('equip.name'),
				attr: { spellcheck: 'false' },
			});

			const rangeRow = formEl.createDiv({ cls: 'dm-equip-grinder-row' });
			rangeRow.createSpan({ text: t('equip.grindRange') });
			const minInput = rangeRow.createEl('input', {
				type: 'number',
				cls: 'dm-equip-input dm-equip-num',
				placeholder: 'min',
			});
			rangeRow.createSpan({ text: '~' });
			const maxInput = rangeRow.createEl('input', {
				type: 'number',
				cls: 'dm-equip-input dm-equip-num',
				placeholder: 'max',
			});

			const stepRow = formEl.createDiv({ cls: 'dm-equip-grinder-row' });
			stepRow.createSpan({ text: t('equip.stepSize') });
			const stepSelect = stepRow.createEl('select', { cls: 'dm-equip-select' });
			for (const s of [0.01, 0.1, 1]) {
				stepSelect.createEl('option', { text: String(s), value: String(s) });
			}
			stepSelect.value = '0.1';
			minInput.value = '0';
			maxInput.value = '50';

			const btnRow = formEl.createDiv({ cls: 'dm-equip-grinder-actions' });
			const saveBtn = btnRow.createEl('button', { text: t('bean.add'), cls: 'dm-btn dm-btn-accent' });
			const cancelBtn = btnRow.createEl('button', { text: t('common.cancel'), cls: 'dm-btn dm-btn-muted' });

			nameInput.focus();

			saveBtn.addEventListener('click', async () => {
				const name = nameInput.value.trim();
				if (!name) return;
				try {
					grinders.push({
						name,
						step: parseFloat(stepSelect.value),
						min: parseFloat(minInput.value) || 0,
						max: parseFloat(maxInput.value) || 50,
					});
					await this.plugin.saveEquipment();
					formEl.remove();
					renderItems();
				} catch (err) {
					console.error('[DataManageModal] grinder add failed:', err);
					new Notice(t('error.equipSave'));
				}
			});
			cancelBtn.addEventListener('click', () => formEl.remove());
			nameInput.addEventListener('keydown', (e) => {
				if (e.key === 'Enter') saveBtn.click();
				if (e.key === 'Escape') formEl.remove();
			});
		});
	}
}
