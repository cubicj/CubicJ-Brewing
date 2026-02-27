import { App, PluginSettingTab, Setting } from 'obsidian';
import type CubicJBrewingPlugin from './main';

export interface BrewingSettings {
	drinkers: string[];
	filters: string[];
	baskets: string[];
	defaultDrinker: string;
}

export const DEFAULT_SETTINGS: BrewingSettings = {
	drinkers: ['나', '엄마', '아빠'],
	filters: ['하이플럭스', 'V60 기본'],
	baskets: ['DH 18g', 'IMS SF 20g', 'IMS 20g', 'Torch 18g'],
	defaultDrinker: '나',
};

export class BrewingSettingTab extends PluginSettingTab {
	plugin: CubicJBrewingPlugin;

	constructor(app: App, plugin: CubicJBrewingPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'CubicJ Brewing' });

		new Setting(containerEl)
			.setName('마시는 사람')
			.setDesc('쉼표로 구분')
			.addText(text => text
				.setValue(this.plugin.settings.drinkers.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.drinkers = value.split(',').map(s => s.trim()).filter(Boolean);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('필터 종류')
			.setDesc('쉼표로 구분')
			.addText(text => text
				.setValue(this.plugin.settings.filters.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.filters = value.split(',').map(s => s.trim()).filter(Boolean);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('바스켓 종류')
			.setDesc('쉼표로 구분')
			.addText(text => text
				.setValue(this.plugin.settings.baskets.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.baskets = value.split(',').map(s => s.trim()).filter(Boolean);
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('기본 마시는 사람')
			.addDropdown(dd => {
				this.plugin.settings.drinkers.forEach(d => dd.addOption(d, d));
				dd.setValue(this.plugin.settings.defaultDrinker);
				dd.onChange(async (value) => {
					this.plugin.settings.defaultDrinker = value;
					await this.plugin.saveSettings();
				});
			});
	}
}
