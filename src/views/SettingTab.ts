import { AbstractInputSuggest, App, Notice, PluginSettingTab, Setting, TFolder } from 'obsidian';
import type { NobleInstallStatus } from '../acaia/NobleInstaller';
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

		new Setting(containerEl).setName("").setHeading();

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

		new Setting(containerEl)
			.setName(t('settings.github'))
			.setDesc(t('settings.githubDesc'))
			.addButton((btn) =>
				btn.setButtonText(t('settings.open')).onClick(() => {
					window.open('https://github.com/cubicj/CubicJ-Brewing');
				}),
			);

		new Setting(containerEl)
			.setName(t('settings.wiki'))
			.setDesc(t('settings.wikiDesc'))
			.addButton((btn) =>
				btn.setButtonText(t('settings.open')).onClick(() => {
					window.open(
						this.plugin.getLocale() === 'ko'
							? 'https://github.com/cubicj/CubicJ-Brewing/wiki/Home-(Korean)'
							: 'https://github.com/cubicj/CubicJ-Brewing/wiki',
					);
				}),
			);

		const installer = this.plugin.nobleInstaller;
		if (installer) {
			const nobleSetting = new Setting(containerEl)
				.setName(t('settings.noble'))
				.setDesc(t('settings.nobleChecking'));
			const renderStatus = (status: NobleInstallStatus) => {
				const desc =
					status.kind === 'installed'
						? t('settings.nobleInstalled', { version: status.version })
						: status.kind === 'version-mismatch'
							? t('settings.nobleMismatch', { installed: status.installed, expected: status.expected })
							: t('settings.nobleMissing');
				nobleSetting.setDesc(desc);
				nobleSetting.addButton((btn) =>
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
									if (installed) this.display();
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
		}
	}
}
