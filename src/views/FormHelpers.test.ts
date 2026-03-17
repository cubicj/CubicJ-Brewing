// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { installPolyfills, createContainer } from '../test/obsidian-dom-polyfill';

vi.mock('../i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

import { createToggleGroup, createSelectField, createAccessoryChecklist } from './FormHelpers';

beforeAll(() => installPolyfills());

describe('createToggleGroup', () => {
	it('renders buttons for each item', () => {
		const container = createContainer();
		const onChange = vi.fn();
		createToggleGroup(
			container,
			[
				{ value: 'a', label: 'A' },
				{ value: 'b', label: 'B' },
			],
			null,
			onChange,
		);

		const buttons = container.querySelectorAll('.brew-flow-toggle');
		expect(buttons.length).toBe(2);
		expect(buttons[0].textContent).toBe('A');
		expect(buttons[1].textContent).toBe('B');
	});

	it('marks selected item as active', () => {
		const container = createContainer();
		createToggleGroup(
			container,
			[
				{ value: 'a', label: 'A' },
				{ value: 'b', label: 'B' },
			],
			'b',
			vi.fn(),
		);

		const buttons = container.querySelectorAll('.brew-flow-toggle');
		expect(buttons[0].classList.contains('is-active')).toBe(false);
		expect(buttons[1].classList.contains('is-active')).toBe(true);
	});

	it('clicking unselected item selects it', () => {
		const container = createContainer();
		const onChange = vi.fn();
		createToggleGroup(
			container,
			[
				{ value: 'a', label: 'A' },
				{ value: 'b', label: 'B' },
			],
			null,
			onChange,
		);

		const buttons = container.querySelectorAll('.brew-flow-toggle');
		(buttons[0] as HTMLElement).click();
		expect(onChange).toHaveBeenCalledWith('a');
		expect(buttons[0].classList.contains('is-active')).toBe(true);
	});

	it('clicking active item deselects it', () => {
		const container = createContainer();
		const onChange = vi.fn();
		createToggleGroup(
			container,
			[
				{ value: 'a', label: 'A' },
				{ value: 'b', label: 'B' },
			],
			'a',
			onChange,
		);

		const buttons = container.querySelectorAll('.brew-flow-toggle');
		(buttons[0] as HTMLElement).click();
		expect(onChange).toHaveBeenCalledWith(null);
		expect(buttons[0].classList.contains('is-active')).toBe(false);
	});

	it('selecting one deselects others', () => {
		const container = createContainer();
		const onChange = vi.fn();
		createToggleGroup(
			container,
			[
				{ value: 'a', label: 'A' },
				{ value: 'b', label: 'B' },
			],
			'a',
			onChange,
		);

		const buttons = container.querySelectorAll('.brew-flow-toggle');
		(buttons[1] as HTMLElement).click();
		expect(buttons[0].classList.contains('is-active')).toBe(false);
		expect(buttons[1].classList.contains('is-active')).toBe(true);
	});
});

describe('createSelectField', () => {
	it('renders label and options', () => {
		const container = createContainer();
		const select = createSelectField(container, 'Filter', ['V60', 'Kalita'], 'V60', vi.fn());

		expect(container.querySelector('label')?.textContent).toBe('Filter');
		const options = select.querySelectorAll('option');
		expect(options.length).toBe(2);
		expect(select.value).toBe('V60');
	});

	it('fires onChange on selection change', () => {
		const container = createContainer();
		const onChange = vi.fn();
		const select = createSelectField(container, 'Filter', ['V60', 'Kalita'], 'V60', onChange);

		select.value = 'Kalita';
		select.dispatchEvent(new Event('change'));
		expect(onChange).toHaveBeenCalledWith('Kalita');
	});
});

describe('createAccessoryChecklist', () => {
	it('renders checkboxes for each accessory', () => {
		const container = createContainer();
		createAccessoryChecklist(container, ['WDT', 'Leveler'], []);

		const checkboxes = container.querySelectorAll('input[type="checkbox"]');
		expect(checkboxes.length).toBe(2);
	});

	it('checks initial selections', () => {
		const container = createContainer();
		createAccessoryChecklist(container, ['WDT', 'Leveler'], ['WDT']);

		const checkboxes = container.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
		expect(checkboxes[0].checked).toBe(true);
		expect(checkboxes[1].checked).toBe(false);
	});

	it('returns set of selected items', () => {
		const container = createContainer();
		const selected = createAccessoryChecklist(container, ['WDT', 'Leveler'], ['WDT']);
		expect(selected.has('WDT')).toBe(true);
		expect(selected.has('Leveler')).toBe(false);
	});

	it('fires onChange when toggled', () => {
		const container = createContainer();
		const onChange = vi.fn();
		createAccessoryChecklist(container, ['WDT', 'Leveler'], [], onChange);

		const checkboxes = container.querySelectorAll('input[type="checkbox"]') as NodeListOf<HTMLInputElement>;
		checkboxes[0].checked = true;
		checkboxes[0].dispatchEvent(new Event('change', { bubbles: true }));
		expect(onChange).toHaveBeenCalledWith(['WDT']);
	});
});
