/* eslint-disable @typescript-eslint/no-explicit-any */

function applyPolyfills(el: HTMLElement): HTMLElement {
	if ((el as any).__polyfilled) return el;
	(el as any).__polyfilled = true;

	(el as any).createDiv = function (this: HTMLElement, opts?: any) {
		const div = document.createElement('div');
		applyOpts(div, opts);
		this.appendChild(div);
		return applyPolyfills(div);
	};

	(el as any).createEl = function (this: HTMLElement, tag: string, opts?: any) {
		const child = document.createElement(tag);
		applyOpts(child, opts);
		this.appendChild(child);
		return applyPolyfills(child as HTMLElement);
	};

	(el as any).createSpan = function (this: HTMLElement, opts?: any) {
		const span = document.createElement('span');
		applyOpts(span, opts);
		this.appendChild(span);
		return applyPolyfills(span);
	};

	(el as any).addClass = function (this: HTMLElement, ...classes: string[]) {
		this.classList.add(...classes);
	};

	(el as any).removeClass = function (this: HTMLElement, ...classes: string[]) {
		this.classList.remove(...classes);
	};

	(el as any).hasClass = function (this: HTMLElement, cls: string) {
		return this.classList.contains(cls);
	};

	(el as any).empty = function (this: HTMLElement) {
		while (this.firstChild) this.removeChild(this.firstChild);
	};

	return el;
}

function applyOpts(el: HTMLElement, opts?: any) {
	if (!opts) return;
	if (opts.cls) el.className = opts.cls;
	if (opts.text) el.textContent = opts.text;
	if (opts.type && 'type' in el) (el as any).type = opts.type;
	if (opts.value && 'value' in el) (el as any).value = opts.value;
	if (opts.attr) {
		for (const [k, v] of Object.entries(opts.attr)) {
			el.setAttribute(k, v as string);
		}
	}
}

export function createContainer(): HTMLElement {
	const el = document.createElement('div');
	return applyPolyfills(el);
}

export function installPolyfills(): void {
	if (!(HTMLElement.prototype as any).createDiv) {
		applyPolyfills(HTMLElement.prototype);
	}
}
