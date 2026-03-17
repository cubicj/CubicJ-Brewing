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
export function setIcon(_el: any, _icon: string) {}
