import { Modal, Scope, type App } from 'obsidian';
import type { AcaiaService } from '../acaia/AcaiaService';
import type { DiscoveredScale } from '../acaia/NobleTransport';
import type { ScaleConfig } from '../brew/types';
import { findRegisteredScale } from '../services/scaleRegistry';
import { resolveModelName } from '../acaia/types';
import { t } from '../i18n/index';

export class ScalePickerModal extends Modal {
	private picked = false;
	private listEl!: HTMLElement;
	private statusEl!: HTMLElement;
	private foundCount = 0;

	constructor(
		app: App,
		private service: AcaiaService,
		private registeredScales: ScaleConfig[],
	) {
		super(app);
		this.scope = new Scope(app.scope);
		this.scope.register([], 'Escape', () => {
			this.close();
			return false;
		});
	}

	onOpen(): void {
		this.titleEl.setText(t('scalePicker.title'));
		this.contentEl.addClass('cubicj-scale-picker');
		this.statusEl = this.contentEl.createDiv({ cls: 'scale-picker-status', text: t('scalePicker.searching') });
		this.listEl = this.contentEl.createDiv({ cls: 'scale-picker-list' });
		this.listEl.createDiv({ cls: 'dm-empty scale-picker-empty', text: t('scalePicker.empty') });
		void this.service.startPickerScan((scale) => this.addScale(scale)).then((started) => {
			if (!started) this.statusEl.setText(t('scalePicker.scanFailed'));
		});
	}

	onClose(): void {
		if (!this.picked) this.service.cancelPickerScan();
		this.contentEl.empty();
	}

	private addScale(scale: DiscoveredScale): void {
		if (this.foundCount === 0) this.listEl.empty();
		this.foundCount++;
		const registered = findRegisteredScale(this.registeredScales, scale.address);
		const row = this.listEl.createEl('button', { cls: 'scale-picker-row' });
		row.createSpan({ cls: 'scale-picker-name', text: registered?.name ?? resolveModelName(scale.localName) });
		row.createSpan({ cls: 'scale-picker-address', text: scale.address });
		if (registered) row.createSpan({ cls: 'scale-picker-badge', text: t('scalePicker.registered') });
		row.addEventListener('click', () => {
			this.picked = true;
			void this.service.connectToScale(scale);
			this.close();
		});
	}
}
