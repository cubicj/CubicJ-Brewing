import { Modal, type App } from 'obsidian';
import { t } from '../i18n/index';

export interface ConfirmCheckbox {
	label: string;
	checked: boolean;
}

export class ConfirmModal extends Modal {
	private message: string;
	private onConfirm: (checked: boolean) => void;
	private checkbox?: ConfirmCheckbox;

	constructor(app: App, message: string, onConfirm: (checked: boolean) => void, checkbox?: ConfirmCheckbox) {
		super(app);
		this.message = message;
		this.onConfirm = onConfirm;
		this.checkbox = checkbox;
	}

	onOpen(): void {
		this.titleEl.setText(t('common.confirm'));
		this.contentEl.createDiv({ text: this.message, cls: 'cubicj-confirm-message' });

		let cb: HTMLInputElement | undefined;
		if (this.checkbox) {
			const row = this.contentEl.createDiv({ cls: 'cubicj-confirm-checkbox' });
			cb = row.createEl('input', { type: 'checkbox' });
			cb.checked = this.checkbox.checked;
			row.createEl('label', { text: this.checkbox.label });
			cb.id = 'confirm-restore';
			row.querySelector('label')!.setAttribute('for', 'confirm-restore');
		}

		const footer = this.contentEl.createDiv({ cls: 'cubicj-confirm-footer' });
		const confirmBtn = footer.createEl('button', { text: t('form.delete'), cls: 'mod-warning' });
		confirmBtn.addEventListener('click', () => {
			this.onConfirm(cb?.checked ?? false);
			this.close();
		});
		const cancelBtn = footer.createEl('button', { text: t('common.cancel') });
		cancelBtn.addEventListener('click', () => this.close());
	}
}
