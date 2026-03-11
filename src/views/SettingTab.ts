import { AbstractInputSuggest, App, Notice, PluginSettingTab, Setting, type TFolder } from 'obsidian';
import type CubicJBrewingPlugin from '../main';
import { t, getAvailableLocales } from '../i18n/index';

class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private onPick: (folder: TFolder) => void;

	constructor(app: App, inputEl: HTMLInputElement, onPick: (folder: TFolder) => void) {
		super(app, inputEl);
		this.onPick = onPick;
	}

	getSuggestions(query: string): TFolder[] {
		const lowerQuery = query.toLowerCase();
		const folders: TFolder[] = [];
		const seen = new Set<string>();
		this.app.vault.getAllLoadedFiles().forEach((f) => {
			if (!('children' in f)) return;
			if (seen.has(f.path)) return;
			seen.add(f.path);
			if (f.path === '/') return;
			if (f.path.toLowerCase().contains(lowerQuery)) {
				folders.push(f as TFolder);
			}
		});
		return folders.slice(0, 20);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}

	selectSuggestion(folder: TFolder): void {
		this.setValue(folder.path);
		this.onPick(folder);
		this.close();
	}
}

export class BrewingSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: CubicJBrewingPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName(t('settings.openView'))
			.setDesc(t('settings.openViewDesc'))
			.addButton((btn) =>
				btn.setButtonText(t('settings.open')).onClick(() => {
					(this.app as any).commands.executeCommandById('cubicj-brewing:open-view');
				}),
			);

		new Setting(containerEl)
			.setName(t('settings.language'))
			.setDesc(t('settings.languageDesc'))
			.addDropdown((dd) => {
				for (const loc of getAvailableLocales()) {
					dd.addOption(loc.code, loc.name);
				}
				dd.setValue(this.plugin.getLocale());
				dd.onChange(async (value) => {
					await this.plugin.saveLocale(value);
					new Notice(t('settings.restartRequired'));
				});
			});

		containerEl.createEl('h2', { text: t('settings.beanFolder') });

		new Setting(containerEl)
			.setName(t('settings.beanFolder'))
			.setDesc(t('settings.beanFolderDesc'))
			.addText((text) => {
				text.setPlaceholder('Beans').setValue(this.plugin.getBeanFolder());
				new FolderSuggest(this.app, text.inputEl, async (folder) => {
					await this.plugin.saveBeanFolder(folder.path);
				});
				text.onChange(async (value) => {
					await this.plugin.saveBeanFolder(value.trim());
				});
			});

		containerEl.createEl('h2', { text: t('settings.debugLog') });

		const logConfig = this.plugin.getLogConfig();

		new Setting(containerEl)
			.setName(t('settings.debugLog'))
			.setDesc(t('settings.debugLogDesc'))
			.addToggle((toggle) =>
				toggle.setValue(logConfig.enabled).onChange(async (value) => {
					logConfig.enabled = value;
					await this.plugin.saveLogConfig(logConfig);
				}),
			);

		new Setting(containerEl)
			.setName(t('settings.logCategories'))
			.setDesc(t('settings.logCategoriesDesc'))
			.addText((text) =>
				text
					.setPlaceholder('BLE,VIEW')
					.setValue(logConfig.categories.join(','))
					.onChange(async (value) => {
						logConfig.categories = value
							.split(',')
							.map((s) => s.trim())
							.filter(Boolean);
						await this.plugin.saveLogConfig(logConfig);
					}),
			);

		new Setting(containerEl)
			.setName(t('settings.packetLog'))
			.setDesc(t('settings.packetLogDesc'))
			.addToggle((toggle) =>
				toggle.setValue(logConfig.packetLog).onChange(async (value) => {
					logConfig.packetLog = value;
					await this.plugin.saveLogConfig(logConfig);
				}),
			);
	}
}
