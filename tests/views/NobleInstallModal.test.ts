// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { createContainer, installPolyfills } from '../helpers/obsidian-dom-polyfill';
import { NobleInstallError } from '../../src/acaia/NobleInstaller';

vi.mock('../../src/i18n/index', () => ({
	t: (key: string, vars?: Record<string, string>) =>
		vars?.installed === undefined ? key : `${key}:${vars.installed}`,
	initI18n: vi.fn(),
}));

import { NobleInstallModal } from '../../src/views/NobleInstallModal';

beforeAll(() => installPolyfills());

function makeModal(
	installer: { install: ReturnType<typeof vi.fn> },
	onDone: (installed: boolean) => void,
	options: { variant: 'install' | 'update' | 'reinstall'; installed?: string } = { variant: 'install' },
) {
	const modal = new NobleInstallModal({} as App, {
		...options,
		installer: installer as never,
		wikiUrl: 'https://example.com/wiki',
		onDone,
	});
	const titleEl = createContainer();
	titleEl.setText = (text: string) => {
		titleEl.textContent = text;
	};
	Object.defineProperty(modal, 'contentEl', { value: createContainer() });
	Object.defineProperty(modal, 'modalEl', { value: createContainer() });
	Object.defineProperty(modal, 'titleEl', { value: titleEl });
	return modal;
}

function installButton(modal: NobleInstallModal): HTMLButtonElement {
	return (modal as never as { contentEl: HTMLElement }).contentEl.querySelector('.cubicj-noble-footer .mod-cta')!;
}

describe('NobleInstallModal', () => {
	it('renders reinstall copy and interpolates the installed update version', () => {
		const installer = { install: vi.fn() };
		const reinstallModal = makeModal(installer, vi.fn(), { variant: 'reinstall' });
		reinstallModal.onOpen();
		const reinstallContent = (reinstallModal as never as { contentEl: HTMLElement }).contentEl;
		expect((reinstallModal as never as { titleEl: HTMLElement }).titleEl.textContent).toBe(
			'noble.reinstallTitle',
		);
		expect(reinstallContent.querySelector('.cubicj-noble-message')!.textContent).toBe(
			'noble.reinstallMessage',
		);
		expect(installButton(reinstallModal).textContent).toBe('noble.reinstall');

		const updateModal = makeModal(installer, vi.fn(), { variant: 'update', installed: '2.3.15' });
		updateModal.onOpen();
		const updateContent = (updateModal as never as { contentEl: HTMLElement }).contentEl;
		expect(updateContent.querySelector('.cubicj-noble-message')!.textContent).toBe(
			'noble.updateMessage:2.3.15',
		);
	});

	it('runs the install and reports success', async () => {
		const install = vi.fn(async (onPhase: (p: string) => void) => {
			onPhase('downloading');
			onPhase('verifying');
			onPhase('extracting');
		});
		const done = vi.fn();
		const modal = makeModal({ install }, done);
		modal.onOpen();
		installButton(modal).click();
		await vi.waitFor(() => expect(done).toHaveBeenCalledWith(true));
		expect(install).toHaveBeenCalledTimes(1);
		expect(done).toHaveBeenCalledTimes(1);
	});

	it('shows the phase while installing', async () => {
		let capturedPhase: ((p: string) => void) | null = null;
		const install = vi.fn(
			(onPhase: (p: string) => void) =>
				new Promise<void>(() => {
					capturedPhase = onPhase;
					onPhase('downloading');
				}),
		);
		const modal = makeModal({ install }, vi.fn());
		modal.onOpen();
		installButton(modal).click();
		await vi.waitFor(() => expect(capturedPhase).not.toBeNull());
		const contentEl = (modal as never as { contentEl: HTMLElement }).contentEl;
		expect(contentEl.querySelector('.cubicj-noble-status')!.textContent).toBe('noble.phase.downloading');
	});

	it('shows a mapped error with manual hint and allows retry', async () => {
		const install = vi.fn(async () => {
			throw new NobleInstallError('checksum', 'mismatch');
		});
		const done = vi.fn();
		const modal = makeModal({ install }, done);
		modal.onOpen();
		installButton(modal).click();
		const contentEl = (modal as never as { contentEl: HTMLElement }).contentEl;
		await vi.waitFor(() =>
			expect(contentEl.querySelector('.cubicj-noble-error')!.textContent).toContain('noble.error.checksum'),
		);
		expect(contentEl.querySelector('.cubicj-noble-error a')!.getAttribute('href')).toBe('https://example.com/wiki');
		expect(done).not.toHaveBeenCalled();
		expect(installButton(modal).disabled).toBe(false);
	});

	it('shows the locked addon error', async () => {
		const install = vi.fn(async () => {
			throw new NobleInstallError('locked', 'in use');
		});
		const modal = makeModal({ install }, vi.fn());
		modal.onOpen();

		installButton(modal).click();

		const contentEl = (modal as never as { contentEl: HTMLElement }).contentEl;
		await vi.waitFor(() =>
			expect(contentEl.querySelector('.cubicj-noble-error')!.textContent).toContain('noble.error.locked'),
		);
	});

	it('reports false when closed without installing', () => {
		const done = vi.fn();
		const modal = makeModal({ install: vi.fn() }, done);
		modal.onOpen();
		modal.onClose();
		expect(done).toHaveBeenCalledWith(false);
		expect(done).toHaveBeenCalledTimes(1);
	});

	it('ignores a successful install that finishes after the modal closes', async () => {
		let resolveInstall!: () => void;
		const install = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveInstall = resolve;
				}),
		);
		const done = vi.fn();
		const modal = makeModal({ install }, done);
		modal.onOpen();
		installButton(modal).click();
		await vi.waitFor(() => expect(install).toHaveBeenCalledTimes(1));

		modal.onClose();
		resolveInstall();
		await Promise.resolve();
		await Promise.resolve();

		expect(done).toHaveBeenCalledWith(false);
		expect(done).toHaveBeenCalledTimes(1);
	});
});
