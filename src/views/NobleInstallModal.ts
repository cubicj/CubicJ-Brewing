import { Modal, Notice, type App } from 'obsidian';
import { t, type LocaleKeys } from '../i18n/index';
import {
	NobleInstallError,
	type NobleInstallErrorCode,
	type NobleInstallPhase,
	type NobleInstaller,
} from '../acaia/NobleInstaller';

export interface NobleInstallModalOptions {
	variant: 'install' | 'update' | 'reinstall';
	installed?: string;
	installer: NobleInstaller;
	wikiUrl: string;
	onDone: (installed: boolean) => void;
}

const PHASE_KEYS: Record<NobleInstallPhase, LocaleKeys> = {
	downloading: 'noble.phase.downloading',
	verifying: 'noble.phase.verifying',
	extracting: 'noble.phase.extracting',
};

const ERROR_KEYS: Record<NobleInstallErrorCode, LocaleKeys> = {
	locked: 'noble.error.locked',
	network: 'noble.error.network',
	http: 'noble.error.http',
	checksum: 'noble.error.checksum',
	extract: 'noble.error.extract',
	write: 'noble.error.write',
};

export class NobleInstallModal extends Modal {
	private finished = false;
	private busy = false;
	private statusEl!: HTMLElement;
	private errorEl!: HTMLElement;
	private installBtn!: HTMLButtonElement;

	constructor(
		app: App,
		private readonly options: NobleInstallModalOptions,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		const isUpdate = this.options.variant === 'update';
		const isReinstall = this.options.variant === 'reinstall';
		this.titleEl.setText(
			t(isUpdate ? 'noble.updateTitle' : isReinstall ? 'noble.reinstallTitle' : 'noble.installTitle'),
		);
		contentEl.createDiv({
			cls: 'cubicj-noble-message',
			text: isUpdate
				? t('noble.updateMessage', { installed: this.options.installed ?? '?' })
				: t(isReinstall ? 'noble.reinstallMessage' : 'noble.installMessage'),
		});
		this.statusEl = contentEl.createDiv({ cls: 'cubicj-noble-status' });
		this.errorEl = contentEl.createDiv({ cls: 'cubicj-noble-error' });
		const footer = contentEl.createDiv({ cls: 'cubicj-noble-footer' });
		this.installBtn = footer.createEl('button', {
			text: t(this.options.variant === 'install' ? 'noble.install' : 'noble.reinstall'),
			cls: 'mod-cta',
		});
		this.installBtn.addEventListener('click', () => void this.runInstall());
		const cancelBtn = footer.createEl('button', { text: t('common.cancel') });
		cancelBtn.addEventListener('click', () => this.close());
	}

	onClose(): void {
		if (!this.finished) {
			this.finished = true;
			this.options.onDone(false);
		}
	}

	private async runInstall(): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		this.installBtn.disabled = true;
		this.errorEl.empty();
		try {
			await this.options.installer.install((phase) => {
				if (!this.finished) this.statusEl.textContent = t(PHASE_KEYS[phase]);
			});
			if (this.finished) return;
			this.finished = true;
			new Notice(t('noble.done'));
			this.options.onDone(true);
			this.close();
		} catch (err) {
			if (this.finished) return;
			this.statusEl.textContent = '';
			const key = err instanceof NobleInstallError ? ERROR_KEYS[err.code] : 'noble.error.extract';
			this.errorEl.textContent = t(key);
			this.errorEl.append(' ');
			this.errorEl.createEl('a', {
				text: t('noble.manualHint'),
				attr: { href: this.options.wikiUrl },
			});
			this.busy = false;
			this.installBtn.disabled = false;
		}
	}
}
