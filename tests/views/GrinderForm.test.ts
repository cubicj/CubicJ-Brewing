// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { installPolyfills, createContainer } from '../helpers/obsidian-dom-polyfill';
import type { GrinderConfig } from '../../src/brew/types';
import { renderGrinderForm } from '../../src/views/GrinderForm';

vi.mock('../../src/i18n/index', () => ({ t: (key: string) => key, initI18n: vi.fn() }));

beforeAll(() => installPolyfills());

function numberInputs(container: HTMLElement): HTMLInputElement[] {
	return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="number"]'));
}

function submit(container: HTMLElement): void {
	const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.dm-equip-grinder-actions button'));
	buttons[0].click();
}

describe('renderGrinderForm', () => {
	it('submits a grinder without rpm when the checkbox is unchecked', () => {
		const container = createContainer();
		const onSubmit = vi.fn();
		renderGrinderForm(container, { submitLabel: 'add', onSubmit });

		const nameInput = container.querySelector<HTMLInputElement>('input[type="text"]')!;
		nameInput.value = 'C40';
		submit(container);

		expect(onSubmit).toHaveBeenCalledWith({ name: 'C40', step: 0.1, min: 0, max: 50 });
	});

	it('hides rpm fields until the checkbox is checked', () => {
		const container = createContainer();
		renderGrinderForm(container, { submitLabel: 'add', onSubmit: vi.fn() });

		const rpmFields = container.querySelector<HTMLElement>('.dm-equip-rpm-fields')!;
		expect(rpmFields.style.display).toBe('none');

		const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
		checkbox.checked = true;
		checkbox.dispatchEvent(new Event('change'));
		expect(rpmFields.style.display).toBe('');
	});

	it('submits an rpm config when the checkbox is checked', () => {
		const container = createContainer();
		const onSubmit = vi.fn();
		renderGrinderForm(container, { submitLabel: 'add', onSubmit });

		container.querySelector<HTMLInputElement>('input[type="text"]')!.value = 'DF64V';
		const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
		checkbox.checked = true;
		checkbox.dispatchEvent(new Event('change'));

		const [, , rpmMin, rpmMax, rpmStep, rpmCurrent] = numberInputs(container);
		rpmMin.value = '300';
		rpmMax.value = '2000';
		rpmStep.value = '10';
		rpmCurrent.value = '1200';
		submit(container);

		expect(onSubmit).toHaveBeenCalledWith({
			name: 'DF64V',
			step: 0.1,
			min: 0,
			max: 50,
			rpm: { min: 300, max: 2000, step: 10, current: 1200 },
		});
	});

	it('prefills all fields from an initial grinder', () => {
		const container = createContainer();
		const initial: GrinderConfig = {
			name: 'DF64V',
			step: 1,
			min: 0,
			max: 90,
			rpm: { min: 300, max: 2000, step: 10, current: 1400 },
		};
		renderGrinderForm(container, { initial, submitLabel: 'save', onSubmit: vi.fn() });

		expect(container.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('DF64V');
		expect(container.querySelector<HTMLSelectElement>('select')!.value).toBe('1');
		expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
		const [min, max, rpmMin, rpmMax, rpmStep, rpmCurrent] = numberInputs(container);
		expect([min.value, max.value]).toEqual(['0', '90']);
		expect([rpmMin.value, rpmMax.value, rpmStep.value, rpmCurrent.value]).toEqual(['300', '2000', '10', '1400']);
	});

	it('clamps current rpm into the rpm range on submit', () => {
		const container = createContainer();
		const onSubmit = vi.fn();
		renderGrinderForm(container, { submitLabel: 'add', onSubmit });

		container.querySelector<HTMLInputElement>('input[type="text"]')!.value = 'DF64V';
		const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
		checkbox.checked = true;
		checkbox.dispatchEvent(new Event('change'));

		const [, , rpmMin, rpmMax, rpmStep, rpmCurrent] = numberInputs(container);
		rpmMin.value = '300';
		rpmMax.value = '2000';
		rpmStep.value = '10';
		rpmCurrent.value = '9999';
		submit(container);

		expect(onSubmit.mock.calls[0][0].rpm.current).toBe(2000);
	});
});
