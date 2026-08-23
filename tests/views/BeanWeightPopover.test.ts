// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BeanInfo } from '../../src/brew/types';
import type { VaultDataService } from '../../src/services/VaultDataService';
import { openWeightPopover } from '../../src/views/BeanWeightPopover';
import { createContainer, installPolyfills } from '../helpers/obsidian-dom-polyfill';

vi.mock('../../src/i18n/index', () => ({ t: (key: string) => key, initI18n: vi.fn() }));

beforeAll(() => installPolyfills());
afterEach(() => {
	document.body.innerHTML = '';
});

function bean(weight: number | null): BeanInfo {
	return { path: 'Beans/A.md', name: 'A', roaster: '', status: 'active', roastDate: null, weight };
}

function vaultData() {
	return {
		setWeight: vi.fn(async () => ({ ok: true as const, data: undefined })),
		setBeanStatus: vi.fn(async () => ({ ok: true as const, data: undefined })),
	} as unknown as VaultDataService & { setWeight: ReturnType<typeof vi.fn>; setBeanStatus: ReturnType<typeof vi.fn> };
}

function open(b: BeanInfo, vd: VaultDataService, getScale: (() => number | null) | null = null, options?: { inModal?: boolean }) {
	const anchor = createContainer();
	document.body.appendChild(anchor);
	const onSave = vi.fn();
	openWeightPopover(anchor, b, vd, onSave, getScale, options);
	const popover = document.querySelector<HTMLElement>('.bean-weight-popover');
	if (!popover) throw new Error('popover not rendered');
	return { popover, onSave };
}

function clickAction(popover: HTMLElement, label: string) {
	const btn = Array.from(popover.querySelectorAll<HTMLButtonElement>('.bwp-action')).find((el) => el.textContent === label);
	if (!btn) throw new Error(`action ${label} not found`);
	btn.click();
}

async function flush() {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('openWeightPopover', () => {
	it('sets the weight to the typed value', async () => {
		const vd = vaultData();
		const b = bean(100);
		const { popover, onSave } = open(b, vd);
		popover.querySelector<HTMLInputElement>('.bwp-input')!.value = '250';

		clickAction(popover, 'bean.settings');
		await flush();

		expect(vd.setWeight).toHaveBeenCalledWith('Beans/A.md', 250);
		expect(b.weight).toBe(250);
		expect(onSave).toHaveBeenCalledTimes(1);
		expect(document.querySelector('.bean-weight-popover')).toBeNull();
	});

	it('adds and uses relative to the current weight, clamping use at zero', async () => {
		const vd = vaultData();
		const addCase = open(bean(100.25), vd);
		addCase.popover.querySelector<HTMLInputElement>('.bwp-input')!.value = '20.1';
		clickAction(addCase.popover, 'bean.add');
		await flush();
		expect(vd.setWeight).toHaveBeenLastCalledWith('Beans/A.md', 120.4);

		const useCase = open(bean(10), vd);
		useCase.popover.querySelector<HTMLInputElement>('.bwp-input')!.value = '15';
		clickAction(useCase.popover, 'bean.use');
		await flush();
		expect(vd.setWeight).toHaveBeenLastCalledWith('Beans/A.md', 0);
	});

	it('ignores empty or negative input', async () => {
		const vd = vaultData();
		const { popover } = open(bean(100), vd);
		popover.querySelector<HTMLInputElement>('.bwp-input')!.value = '-1';
		clickAction(popover, 'bean.settings');
		await flush();
		expect(vd.setWeight).not.toHaveBeenCalled();
	});

	it('depleted marks the bean finished and clears the weight', async () => {
		const vd = vaultData();
		const b = bean(40);
		const { popover, onSave } = open(b, vd);

		popover.querySelector<HTMLButtonElement>('.bwp-depleted')!.click();
		await flush();

		expect(vd.setBeanStatus).toHaveBeenCalledWith('Beans/A.md', 'finished');
		expect(vd.setWeight).toHaveBeenCalledWith('Beans/A.md', null);
		expect(b.weight).toBeNull();
		expect(onSave).toHaveBeenCalledTimes(1);
	});

	it('shows the Auto button only when a scale weight is available', () => {
		const withScale = open(bean(0), vaultData(), () => 18.4);
		expect(withScale.popover.querySelector('.bwp-auto')).not.toBeNull();
		withScale.popover.querySelector<HTMLButtonElement>('.bwp-auto')!.click();
		expect(withScale.popover.querySelector<HTMLInputElement>('.bwp-input')!.value).toBe('18.4');

		document.body.innerHTML = '';
		const noScale = open(bean(0), vaultData(), () => null);
		expect(noScale.popover.querySelector('.bwp-auto')).toBeNull();
	});

	it('adds is-in-modal when opened with inModal', () => {
		const { popover } = open(bean(0), vaultData(), null, { inModal: true });
		expect(popover.classList.contains('is-in-modal')).toBe(true);
	});
});
