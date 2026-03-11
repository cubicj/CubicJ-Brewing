import { AbstractInputSuggest, App, PluginSettingTab, Setting, type TFolder } from 'obsidian';
import type CubicJBrewingPlugin from '../main';

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

		containerEl.createEl('h2', { text: '원두 노트' });

		new Setting(containerEl)
			.setName('원두 폴더')
			.setDesc('새 원두 노트가 생성될 폴더 경로. 비워두면 볼트 루트에 생성.')
			.addText((text) => {
				text.setPlaceholder('예: Beans').setValue(this.plugin.getBeanFolder());
				new FolderSuggest(this.app, text.inputEl, async (folder) => {
					await this.plugin.saveBeanFolder(folder.path);
				});
				text.onChange(async (value) => {
					await this.plugin.saveBeanFolder(value.trim());
				});
			});

		containerEl.createEl('h2', { text: '디버그' });

		const logConfig = this.plugin.getLogConfig();

		new Setting(containerEl)
			.setName('디버그 로그')
			.setDesc('plugin-debug.log 파일 기록. 변경 후 플러그인 리로드 필요.')
			.addToggle((toggle) =>
				toggle.setValue(logConfig.enabled).onChange(async (value) => {
					logConfig.enabled = value;
					await this.plugin.saveLogConfig(logConfig);
				}),
			);

		new Setting(containerEl)
			.setName('로그 카테고리 필터')
			.setDesc('비워두면 전체 기록. 쉼표 구분 (예: BLE,VIEW).')
			.addText((text) =>
				text
					.setPlaceholder('예: BLE,VIEW')
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
			.setName('BLE 패킷 로그')
			.setDesc('ble-debug.log에 원시 패킷 기록 (고용량). 변경 후 플러그인 리로드 필요.')
			.addToggle((toggle) =>
				toggle.setValue(logConfig.packetLog).onChange(async (value) => {
					logConfig.packetLog = value;
					await this.plugin.saveLogConfig(logConfig);
				}),
			);
	}
}
