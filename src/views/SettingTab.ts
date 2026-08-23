import { AbstractInputSuggest, App, Notice, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import type { NobleInstaller, NobleInstallStatus } from '../acaia/NobleInstaller';
import type CubicJBrewingPlugin from '../main';
import { t, getAvailableLocales } from '../i18n/index';

interface AppWithCommands extends App {
	commands: {
		executeCommandById(id: string): boolean;
	};
}

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
			if (!(f instanceof TFolder)) return;
			if (seen.has(f.path)) return;
			seen.add(f.path);
			if (f.path === '/') return;
			if (f.path.toLowerCase().contains(lowerQuery)) {
				folders.push(f);
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

class FileSuggest extends AbstractInputSuggest<TFile> {
	private onPick: (file: TFile) => void;

	constructor(app: App, inputEl: HTMLInputElement, onPick: (file: TFile) => void) {
		super(app, inputEl);
		this.onPick = onPick;
	}

	getSuggestions(query: string): TFile[] {
		const lowerQuery = query.toLowerCase();
		return this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.basename.toLowerCase().contains(lowerQuery) || f.path.toLowerCase().contains(lowerQuery))
			.slice(0, 20);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.createDiv({ cls: 'suggestion-content', text: file.basename });
		el.createDiv({ cls: 'suggestion-note', text: file.path });
	}

	selectSuggestion(file: TFile): void {
		this.setValue(file.path);
		this.onPick(file);
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

	getSettingDefinitions(): SettingDefinitionItem[] {
		const definitions: SettingDefinitionItem[] = [
			{
				name: t('settings.openView'),
				desc: t('settings.openViewDesc'),
				render: (setting) => this.addOpenViewButton(setting),
			},
			{
				name: t('settings.language'),
				desc: t('settings.languageDesc'),
				control: {
					type: 'dropdown',
					key: 'language',
					options: Object.fromEntries(getAvailableLocales().map((locale) => [locale.code, locale.name])),
				},
			},
			{
				name: t('settings.beanFolder'),
				desc: t('settings.beanFolderDesc'),
				control: {
					type: 'folder',
					key: 'beanFolder',
					placeholder: t('dataManage.beans'),
				},
			},
			{
				name: t('settings.beanHubNote'),
				desc: t('settings.beanHubNoteDesc'),
				control: {
					type: 'file',
					key: 'beanHubNote',
					placeholder: 'Coffee/Beans.md',
					filter: (file) => file.extension === 'md',
				},
			},
			{
				name: t('settings.github'),
				desc: t('settings.githubDesc'),
				render: (setting) => this.addLinkButton(setting, 'https://github.com/cubicj/CubicJ-Brewing'),
			},
			{
				name: t('settings.wiki'),
				desc: t('settings.wikiDesc'),
				render: (setting) => this.addLinkButton(setting, this.getWikiUrl()),
			},
		];

		const installer = this.plugin.nobleInstaller;
		if (installer) {
			definitions.push({
				name: t('settings.noble'),
				desc: t('settings.nobleChecking'),
				render: (setting) => this.renderNobleSetting(setting, installer, () => this.updateDefinitions()),
			});
		}

		return definitions;
	}

	getControlValue(key: string): unknown {
		if (key === 'language') return this.plugin.getLocale();
		if (key === 'beanFolder') return this.plugin.getBeanFolder();
		if (key === 'beanHubNote') return this.plugin.getBeanHubNote();
		return undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === 'language' && typeof value === 'string') {
			await this.plugin.saveLocale(value);
			new Notice(t('settings.restartRequired'));
			return;
		}
		if (key === 'beanFolder' && typeof value === 'string') {
			await this.plugin.saveBeanFolder(value.trim());
			return;
		}
		if (key === 'beanHubNote' && typeof value === 'string') {
			await this.plugin.saveBeanHubNote(this.resolveNotePath(value.trim()));
			return;
		}
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName(t('settings.openView'))
			.setDesc(t('settings.openViewDesc'))
			.then((setting) => this.addOpenViewButton(setting));

		new Setting(containerEl)
			.setName(t('settings.language'))
			.setDesc(t('settings.languageDesc'))
			.addDropdown((dd) => {
				for (const loc of getAvailableLocales()) {
					dd.addOption(loc.code, loc.name);
				}
				dd.setValue(this.plugin.getLocale());
				dd.onChange((value) => this.setControlValue('language', value));
			});

		new Setting(containerEl)
			.setName(t('settings.beanFolder'))
			.setDesc(t('settings.beanFolderDesc'))
			.addText((text) => {
				text.setPlaceholder(t('dataManage.beans')).setValue(this.plugin.getBeanFolder());
				new FolderSuggest(this.app, text.inputEl, (folder) => {
					void this.setControlValue('beanFolder', folder.path).catch((error: unknown) => {
						console.error('[SettingTab] bean folder save failed:', error);
					});
				});
				text.onChange(async (value) => {
					await this.setControlValue('beanFolder', value);
				});
			});

		new Setting(containerEl)
			.setName(t('settings.beanHubNote'))
			.setDesc(t('settings.beanHubNoteDesc'))
			.addText((text) => {
				text.setPlaceholder('Coffee/Beans.md').setValue(this.plugin.getBeanHubNote());
				new FileSuggest(this.app, text.inputEl, (file) => {
					void this.setControlValue('beanHubNote', file.path).catch((error: unknown) => {
						console.error('[SettingTab] bean hub note save failed:', error);
					});
				});
				text.onChange(async (value) => {
					await this.setControlValue('beanHubNote', value);
				});
				text.inputEl.addEventListener('blur', () => {
					const stored = this.plugin.getBeanHubNote();
					if (stored && stored !== text.inputEl.value) text.setValue(stored);
				});
			});

		new Setting(containerEl)
			.setName(t('settings.github'))
			.setDesc(t('settings.githubDesc'))
			.then((setting) => this.addLinkButton(setting, 'https://github.com/cubicj/CubicJ-Brewing'));

		new Setting(containerEl)
			.setName(t('settings.wiki'))
			.setDesc(t('settings.wikiDesc'))
			.then((setting) => this.addLinkButton(setting, this.getWikiUrl()));

		const installer = this.plugin.nobleInstaller;
		if (installer) {
			const nobleSetting = new Setting(containerEl)
				.setName(t('settings.noble'))
				.setDesc(t('settings.nobleChecking'));
			this.renderNobleSetting(nobleSetting, installer, () => this.updateDefinitions());
		}
	}

	private addOpenViewButton(setting: Setting): void {
		setting.addButton((btn) =>
			btn.setButtonText(t('settings.open')).onClick(() => {
				(this.app as AppWithCommands).commands.executeCommandById('cubicj-brewing:open-view');
			}),
		);
	}

	private addLinkButton(setting: Setting, url: string): void {
		setting.addButton((btn) =>
			btn.setButtonText(t('settings.open')).onClick(() => {
				window.open(url);
			}),
		);
	}

	private getWikiUrl(): string {
		return this.plugin.getLocale() === 'ko'
			? 'https://github.com/cubicj/CubicJ-Brewing/wiki/Home-(Korean)'
			: 'https://github.com/cubicj/CubicJ-Brewing/wiki';
	}

	private resolveNotePath(input: string): string {
		if (!input) return '';
		if (this.app.vault.getFileByPath(input)) return input;
		const resolved = this.app.metadataCache.getFirstLinkpathDest(input, '');
		return resolved ? resolved.path : input;
	}

	private updateDefinitions(): void {
		const settingTab = this as unknown as { update?: () => void; display(): void };
		if (settingTab.update) settingTab.update();
		else settingTab.display();
	}

	private renderNobleSetting(setting: Setting, installer: NobleInstaller, rerender: () => void): () => void {
		let active = true;
		const renderStatus = (status: NobleInstallStatus) => {
			if (!active) return;
			const desc =
				status.kind === 'installed'
					? t('settings.nobleInstalled', { version: status.version })
					: status.kind === 'version-mismatch'
						? t('settings.nobleMismatch', { installed: status.installed, expected: status.expected })
						: t('settings.nobleMissing');
			setting.setDesc(desc);
			setting.addButton((btn) =>
				btn
					.setButtonText(status.kind === 'not-installed' ? t('noble.install') : t('noble.reinstall'))
					.onClick(async () => {
						const { NobleInstallModal } = await import('./NobleInstallModal');
						const wikiUrl =
							this.plugin.getLocale() === 'ko'
								? 'https://github.com/cubicj/CubicJ-Brewing/wiki/Installation-(Korean)'
								: 'https://github.com/cubicj/CubicJ-Brewing/wiki/Installation';
						new NobleInstallModal(this.app, {
							variant:
								status.kind === 'not-installed'
									? 'install'
									: status.kind === 'installed'
										? 'reinstall'
										: 'update',
							installed: status.kind === 'version-mismatch' ? status.installed : undefined,
							installer,
							wikiUrl,
							onDone: (installed) => {
								if (installed) rerender();
							},
						}).open();
					}),
			);
		};
		void installer
			.status()
			.then(renderStatus)
			.catch(() => {
				renderStatus({ kind: 'not-installed' });
			});
		return () => {
			active = false;
		};
	}
}
