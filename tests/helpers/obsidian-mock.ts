/* eslint-disable @typescript-eslint/no-explicit-any */
export class Notice {
	constructor(_message: string, _timeout?: number) {}
}
export const Platform = { isDesktop: true, isMobile: false };
export class Modal {
	app: any;
	contentEl: any = {};
	modalEl: any = {};
	constructor(app: any) {
		this.app = app;
	}
	open() {}
	close() {}
	onOpen() {}
	onClose() {}
}
export class Plugin {}
export class PluginSettingTab {
	app: any;
	containerEl: any = {};
	constructor(app: any, _plugin: any) {
		this.app = app;
	}
	display() {}
}
export class Setting {
	constructor(_el: any) {}
	setName() {
		return this;
	}
	setDesc() {
		return this;
	}
	addButton() {
		return this;
	}
	addDropdown() {
		return this;
	}
	addText() {
		return this;
	}
	addToggle() {
		return this;
	}
}
export class AbstractInputSuggest<T> {
	constructor(_app: any, _inputEl: any) {}
	getSuggestions(_query: string): T[] {
		return [];
	}
	setValue(_value: string) {}
	close() {}
}
export function setIcon(_el: any, _icon: string) {}
export function requestUrl(_options: any): Promise<any> {
	return Promise.reject(new Error('requestUrl not mocked'));
}
