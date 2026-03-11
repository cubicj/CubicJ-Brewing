import { Modal, setIcon } from 'obsidian';
import type CubicJBrewingPlugin from '../main';
import type { GrinderConfig, EquipmentSettings } from '../brew/types';
import { BEAN_NOTE_EXTRA } from '../brew/constants';
import { renderActiveBeanRow, renderFinishedBeanRow } from './BeanRowRenderer';

type TabId = 'bean' | 'recipe' | 'equip';

function hasJongseong(str: string): boolean {
	const last = str.charCodeAt(str.length - 1);
	if (last < 0xac00 || last > 0xd7a3) return false;
	return (last - 0xac00) % 28 !== 0;
}

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
			{ id: 'equip', label: '장비', render: (el) => this.renderEquipTab(el) },
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
		const newBtn = headerEl.createEl('button', { text: '+ 새 원두', cls: 'cb-bean-btn cb-bean-new-btn' });
		newBtn.addEventListener('click', () => this.createNewBean());

		const listEl = container.createDiv({ cls: 'dm-bean-list' });
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
			listEl.createDiv({ cls: 'cb-bean-section-title', text: '현재 보유 원두' });
			for (const bean of active) renderActiveBeanRow(listEl, bean, deps);
		}

		if (finished.length > 0) {
			listEl.createDiv({ cls: 'cb-bean-section-title cb-bean-section-past', text: '과거 원두' });
			for (const bean of finished) renderFinishedBeanRow(listEl, bean, deps);
		}

		if (beans.length === 0) {
			listEl.createDiv({ cls: 'dm-empty', text: 'type: bean frontmatter가 있는 노트가 없어요' });
		}
	}

	private async createNewBean(): Promise<void> {
		try {
			const path = await this.plugin.vaultData.createBeanNote(BEAN_NOTE_EXTRA);
			this.close();
			await this.app.workspace.openLinkText(path, '');
		} catch (err) {
			console.error('[DataManageModal] createNewBean failed:', err);
		}
	}

	private renderRecipeTab(container: HTMLElement): void {
		container.createDiv({ cls: 'dm-empty', text: '준비 중' });
	}

	private renderEquipTab(container: HTMLElement): void {
		const eq = this.plugin.equipment;

		this.renderEquipSection(container, '공용', [{ label: '그라인더', items: eq.grinders, key: 'grinders' }]);
		this.renderEquipSection(container, '필터 브루잉', [
			{ label: '드리퍼', items: eq.drippers, key: 'drippers' },
			{ label: '필터', items: eq.filters, key: 'filters' },
		]);
		this.renderEquipSection(container, '에스프레소', [
			{ label: '바스켓', items: eq.baskets, key: 'baskets' },
			{ label: '악세서리', items: eq.accessories, key: 'accessories' },
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
				listEl.createDiv({ cls: 'dm-empty', text: `${label}${hasJongseong(label) ? '을' : '를'} 추가하세요` });
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
				placeholder: `${label} 이름`,
				attr: { spellcheck: 'false' },
			});

			const btnRow = formEl.createDiv({ cls: 'dm-equip-grinder-actions' });
			const saveBtn = btnRow.createEl('button', { text: '추가', cls: 'dm-btn dm-btn-accent' });
			const cancelBtn = btnRow.createEl('button', { text: '취소', cls: 'dm-btn dm-btn-muted' });

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
				listEl.createDiv({ cls: 'dm-empty', text: `${label}${hasJongseong(label) ? '을' : '를'} 추가하세요` });
				return;
			}
			for (let i = 0; i < grinders.length; i++) {
				const g = grinders[i];
				const row = listEl.createDiv({ cls: 'dm-equip-row' });
				row.createSpan({ cls: 'dm-equip-grinder-name', text: g.name });
				row.createSpan({ cls: 'dm-equip-grinder-meta', text: `분쇄도 범위: ${g.min}~${g.max}, 최소 단위: ${g.step}` });
				const delBtn = row.createEl('button', { text: '\u2715', cls: 'dm-btn dm-equip-del-btn' });
				delBtn.addEventListener('click', async () => {
					try {
						grinders.splice(i, 1);
						await this.plugin.saveEquipment();
						renderItems();
					} catch (err) {
						console.error('[DataManageModal] grinder delete failed:', err);
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
				placeholder: '이름',
				attr: { spellcheck: 'false' },
			});

			const rangeRow = formEl.createDiv({ cls: 'dm-equip-grinder-row' });
			rangeRow.createSpan({ text: '분쇄도 범위' });
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
			stepRow.createSpan({ text: '최소 단위' });
			const stepSelect = stepRow.createEl('select', { cls: 'dm-equip-select' });
			for (const s of [0.01, 0.1, 1]) {
				stepSelect.createEl('option', { text: String(s), value: String(s) });
			}
			stepSelect.value = '0.1';
			minInput.value = '0';
			maxInput.value = '50';

			const btnRow = formEl.createDiv({ cls: 'dm-equip-grinder-actions' });
			const saveBtn = btnRow.createEl('button', { text: '추가', cls: 'dm-btn dm-btn-accent' });
			const cancelBtn = btnRow.createEl('button', { text: '취소', cls: 'dm-btn dm-btn-muted' });

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
