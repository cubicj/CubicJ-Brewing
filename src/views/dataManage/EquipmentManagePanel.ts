import { Notice, setIcon } from 'obsidian';
import type { EquipmentSettings, GrinderConfig } from '../../brew/types';
import { t } from '../../i18n/index';
import { renderGrinderForm, type GrinderFormOptions } from '../GrinderForm';
import { SortableListController } from './SortableListController';

export interface EquipmentManagePanelDeps {
	equipment: EquipmentSettings;
	saveEquipment: () => Promise<void>;
}

type StringEquipmentKey = Exclude<keyof EquipmentSettings, 'grinders'>;

type EquipmentList =
	| { label: string; items: GrinderConfig[]; key: 'grinders' }
	| { label: string; items: string[]; key: StringEquipmentKey };

export class EquipmentManagePanel {
	private sortableControllers: SortableListController<unknown>[] = [];

	constructor(private deps: EquipmentManagePanelDeps) {}

	render(container: HTMLElement): void {
		this.dispose();
		const { equipment } = this.deps;

		this.renderEquipSection(container, t('equip.shared'), [
			{ label: t('equipment.grinder'), items: equipment.grinders, key: 'grinders' },
		]);
		this.renderEquipSection(container, t('equip.filterBrewing'), [
			{ label: t('equipment.dripper'), items: equipment.drippers, key: 'drippers' },
			{ label: t('equipment.filter'), items: equipment.filters, key: 'filters' },
		]);
		this.renderEquipSection(container, t('method.espresso'), [
			{ label: t('equipment.basket'), items: equipment.baskets, key: 'baskets' },
			{ label: t('equipment.accessory'), items: equipment.accessories, key: 'accessories' },
		]);
	}

	dispose(): void {
		for (const controller of this.sortableControllers) controller.dispose();
		this.sortableControllers = [];
	}

	private renderEquipSection(
		container: HTMLElement,
		categoryLabel: string,
		lists: EquipmentList[],
	): void {
		const section = container.createDiv({ cls: 'dm-equip-section' });
		section.createDiv({ cls: 'dm-equip-category', text: categoryLabel });
		for (const list of lists) {
			if (list.key === 'grinders') {
				this.renderGrinderList(section, list.label);
			} else {
				this.renderStringList(section, list.label, list.key);
			}
		}
	}

	private renderStringList(
		container: HTMLElement,
		label: string,
		key: StringEquipmentKey,
	): void {
		const section = container.createDiv({ cls: 'dm-equip-list' });
		const header = section.createDiv({ cls: 'dm-equip-list-header' });
		header.createSpan({ text: label });
		const addBtn = header.createEl('button', { cls: 'clickable-icon dm-equip-add-btn' });
		setIcon(addBtn, 'plus');

		const listEl = section.createDiv({ cls: 'dm-equip-items' });
		const items = this.deps.equipment[key];

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
				const deleteItem = async () => {
					try {
						items.splice(i, 1);
						await this.deps.saveEquipment();
						renderItems();
					} catch (err) {
						console.error('[DataManageModal] equipment delete failed:', err);
						new Notice(t('error.equipSave'));
					}
				};
				delBtn.addEventListener('click', () => {
					void deleteItem();
				});
			}
		};
		renderItems();
		if (items.length > 1) {
			this.sortableControllers.push(
				new SortableListController({
					listEl,
					items,
					renderItems,
					saveEquipment: this.deps.saveEquipment,
				}),
			);
		}

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

			const saveItem = async () => {
				const value = input.value.trim();
				if (!value || items.includes(value)) return;
				try {
					items.push(value);
					await this.deps.saveEquipment();
					formEl.remove();
					renderItems();
				} catch (err) {
					console.error('[DataManageModal] equipment add failed:', err);
					new Notice(t('error.equipSave'));
				}
			};
			saveBtn.addEventListener('click', () => {
				void saveItem();
			});
			cancelBtn.addEventListener('click', () => formEl.remove());
			input.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') saveBtn.click();
				if (event.key === 'Escape') formEl.remove();
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
		const grinders = this.deps.equipment.grinders;

		const renderItems = () => {
			listEl.empty();
			if (grinders.length === 0) {
				listEl.createDiv({ cls: 'dm-empty', text: t('dataManage.addPrompt', { label }) });
				return;
			}
			for (let i = 0; i < grinders.length; i++) {
				const grinder = grinders[i];
				const row = listEl.createDiv({ cls: 'dm-equip-row' });
				row.createSpan({ cls: 'dm-equip-grinder-name', text: grinder.name });
				const metaParts = [
					`${t('equip.grindRange')}: ${grinder.min}~${grinder.max}`,
					`${t('equip.stepSize')}: ${grinder.step}`,
				];
				if (grinder.rpm) {
					metaParts.push(`RPM: ${grinder.rpm.current} (${grinder.rpm.min}~${grinder.rpm.max})`);
				}
				row.createSpan({ cls: 'dm-equip-grinder-meta', text: metaParts.join(', ') });
				const editBtn = row.createEl('button', { text: '✎', cls: 'dm-btn dm-equip-edit-btn' });
				editBtn.addEventListener('click', () => {
					const formEl = this.openGrinderForm(section, {
						initial: grinder,
						submitLabel: t('form.save'),
						onSubmit: (updated) => {
							const idx = grinders.indexOf(grinder);
							if (idx === -1) {
								formEl.remove();
								renderItems();
								return;
							}
							void this.submitGrinder(() => {
								Object.assign(grinder, updated);
								if (!updated.rpm) delete grinder.rpm;
							}).then((saved) => {
								if (!saved) return;
								formEl.remove();
								renderItems();
							});
						},
					});
				});
				const delBtn = row.createEl('button', { text: '✕', cls: 'dm-btn dm-equip-del-btn' });
				delBtn.addEventListener('click', () => {
					void this.submitGrinder(() => {
						grinders.splice(i, 1);
					}).then((saved) => {
						if (saved) renderItems();
					});
				});
			}
		};
		renderItems();
		if (grinders.length > 1) {
			this.sortableControllers.push(
				new SortableListController({
					listEl,
					items: grinders,
					renderItems,
					saveEquipment: this.deps.saveEquipment,
				}),
			);
		}

		addBtn.addEventListener('click', () => {
			const formEl = this.openGrinderForm(section, {
				submitLabel: t('bean.add'),
				onSubmit: (grinder) => {
					void this.submitGrinder(() => {
						grinders.push(grinder);
					}).then((saved) => {
						if (!saved) return;
						formEl.remove();
						renderItems();
					});
				},
			});
		});
	}

	private async submitGrinder(apply: () => void): Promise<boolean> {
		try {
			apply();
			await this.deps.saveEquipment();
			return true;
		} catch (err) {
			console.error('[DataManageModal] grinder save failed:', err);
			new Notice(t('error.equipSave'));
			return false;
		}
	}

	private openGrinderForm(container: HTMLElement, options: GrinderFormOptions): HTMLElement {
		container.querySelector('.dm-equip-grinder-form')?.remove();
		return renderGrinderForm(container, options);
	}
}
