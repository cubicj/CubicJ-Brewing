// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { installPolyfills, createContainer } from '../test/obsidian-dom-polyfill';
import { createStepper } from './Stepper';

beforeAll(() => installPolyfills());

function makeStepper(overrides?: Partial<Parameters<typeof createStepper>[1]>) {
	const container = createContainer();
	const onChange = vi.fn();
	const stepper = createStepper(container, {
		label: 'Grind',
		initial: 10,
		min: 0,
		max: 50,
		step: 0.1,
		pxPerStep: 10,
		format: (v) => v.toFixed(1),
		onChange,
		...overrides,
	});
	return { container, stepper, onChange };
}

describe('Stepper', () => {
	it('renders with initial value', () => {
		const { stepper } = makeStepper();
		expect(stepper.getValue()).toBe(10);
		const display = stepper.el.querySelector('.cubicj-stepper-value');
		expect(display?.textContent).toBe('10.0');
	});

	it('does not fire onChange on initial render', () => {
		const { onChange } = makeStepper();
		expect(onChange).not.toHaveBeenCalled();
	});

	it('increments on right button click', () => {
		const { stepper, onChange } = makeStepper();
		const buttons = stepper.el.querySelectorAll('.cubicj-stepper-btn');
		const incBtn = buttons[1] as HTMLButtonElement;
		incBtn.click();
		expect(stepper.getValue()).toBeCloseTo(10.1, 5);
		expect(onChange).toHaveBeenCalledWith(expect.closeTo(10.1, 5));
	});

	it('decrements on left button click', () => {
		const { stepper, onChange } = makeStepper();
		const buttons = stepper.el.querySelectorAll('.cubicj-stepper-btn');
		const decBtn = buttons[0] as HTMLButtonElement;
		decBtn.click();
		expect(stepper.getValue()).toBeCloseTo(9.9, 5);
		expect(onChange).toHaveBeenCalledWith(expect.closeTo(9.9, 5));
	});

	it('clamps to min', () => {
		const { stepper } = makeStepper({ initial: 0 });
		const decBtn = stepper.el.querySelectorAll('.cubicj-stepper-btn')[0] as HTMLButtonElement;
		decBtn.click();
		expect(stepper.getValue()).toBe(0);
	});

	it('clamps to max', () => {
		const { stepper } = makeStepper({ initial: 50 });
		const incBtn = stepper.el.querySelectorAll('.cubicj-stepper-btn')[1] as HTMLButtonElement;
		incBtn.click();
		expect(stepper.getValue()).toBe(50);
	});

	it('setValue updates value and display', () => {
		const { stepper, onChange } = makeStepper();
		stepper.setValue(25);
		expect(stepper.getValue()).toBe(25);
		expect(onChange).toHaveBeenCalledWith(25);
	});

	it('setValue with silent skips onChange', () => {
		const { stepper, onChange } = makeStepper();
		stepper.setValue(25, true);
		expect(stepper.getValue()).toBe(25);
		expect(onChange).not.toHaveBeenCalled();
		const display = stepper.el.querySelector('.cubicj-stepper-value');
		expect(display?.textContent).toBe('25.0');
	});

	it('setValue clamps out-of-range values', () => {
		const { stepper } = makeStepper();
		stepper.setValue(999, true);
		expect(stepper.getValue()).toBe(50);
		stepper.setValue(-5, true);
		expect(stepper.getValue()).toBe(0);
	});

	it('destroy removes element', () => {
		const { container, stepper } = makeStepper();
		expect(container.querySelector('.cubicj-stepper')).not.toBeNull();
		stepper.destroy();
		expect(container.querySelector('.cubicj-stepper')).toBeNull();
	});

	it('integer step rounds correctly', () => {
		const { stepper } = makeStepper({ step: 1, initial: 5, format: (v) => String(v) });
		const incBtn = stepper.el.querySelectorAll('.cubicj-stepper-btn')[1] as HTMLButtonElement;
		incBtn.click();
		expect(stepper.getValue()).toBe(6);
	});

	it('drag right increases value', () => {
		const { stepper, onChange } = makeStepper({ pxPerStep: 10 });
		const display = stepper.el.querySelector('.cubicj-stepper-value') as HTMLElement;

		display.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true }));
		document.dispatchEvent(new MouseEvent('mousemove', { clientX: 130, bubbles: true }));
		document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

		expect(stepper.getValue()).toBeCloseTo(10.3, 5);
		expect(onChange).toHaveBeenCalled();
	});

	it('drag left decreases value', () => {
		const { stepper } = makeStepper({ pxPerStep: 10 });
		const display = stepper.el.querySelector('.cubicj-stepper-value') as HTMLElement;

		display.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true }));
		document.dispatchEvent(new MouseEvent('mousemove', { clientX: 80, bubbles: true }));
		document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

		expect(stepper.getValue()).toBeCloseTo(9.8, 5);
	});

	it('double-click enters edit mode, commit on blur', () => {
		const { stepper, onChange } = makeStepper();
		const display = stepper.el.querySelector('.cubicj-stepper-value') as HTMLElement;

		display.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const input = display.querySelector('input') as HTMLInputElement;
		expect(input).not.toBeNull();

		input.value = '30';
		input.dispatchEvent(new Event('blur'));
		expect(stepper.getValue()).toBe(30);
		expect(onChange).toHaveBeenCalledWith(30);
	});

	it('double-click edit clamps value', () => {
		const { stepper } = makeStepper();
		const display = stepper.el.querySelector('.cubicj-stepper-value') as HTMLElement;

		display.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const input = display.querySelector('input') as HTMLInputElement;
		input.value = '999';
		input.dispatchEvent(new Event('blur'));
		expect(stepper.getValue()).toBe(50);
	});

	it('double-click edit escape cancels', () => {
		const { stepper } = makeStepper();
		const display = stepper.el.querySelector('.cubicj-stepper-value') as HTMLElement;

		display.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		const input = display.querySelector('input') as HTMLInputElement;
		input.value = '99';
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(stepper.getValue()).toBe(10);
	});
});
