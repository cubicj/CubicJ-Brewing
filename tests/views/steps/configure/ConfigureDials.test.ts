// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { installPolyfills, createContainer } from '../../../helpers/obsidian-dom-polyfill';
import type { BrewFlowSelection, EquipmentSettings, FilterRecord, GrinderConfig } from '../../../../src/brew/types';
import { renderConfigureDials } from '../../../../src/views/steps/configure/ConfigureDials';

vi.mock('../../../../src/i18n/index', () => ({ t: (key: string) => key, initI18n: vi.fn() }));

beforeAll(() => installPolyfills());

function makeRpmGrinder(): GrinderConfig {
	return { name: 'DF64V', step: 1, min: 0, max: 90, rpm: { min: 300, max: 2000, step: 10, current: 1200 } };
}

function makePlainGrinder(): GrinderConfig {
	return { name: 'C40', step: 1, min: 0, max: 40 };
}

function makeEquipment(grinders: GrinderConfig[]): EquipmentSettings {
	return { grinders, drippers: [], filters: [], baskets: [], accessories: [], scales: [] };
}

function makeRecord(rpm?: number): FilterRecord {
	return {
		id: 'r1',
		timestamp: '2026-07-16T00:00:00.000Z',
		bean: 'Bean',
		roastDate: '',
		roastDays: null,
		method: 'filter',
		temp: 'hot',
		grindSize: 20,
		grinder: 'DF64V',
		rpm,
		dose: 15,
		waterTemp: 93,
	};
}

function rpmStepperEl(form: HTMLElement): HTMLElement | undefined {
	return Array.from(form.querySelectorAll<HTMLElement>('.cubicj-stepper')).find(
		(el) => el.querySelector('label')?.textContent === 'form.rpm',
	);
}

function render(grinder: GrinderConfig | undefined, equipment: EquipmentSettings) {
	const sel: BrewFlowSelection = { method: 'filter' };
	if (grinder) sel.grinder = grinder.name;
	const form = createContainer();
	const persist = vi.fn();
	const controls = renderConfigureDials(form, sel, equipment, grinder, () => '0.0', vi.fn(), persist);
	return { sel, form, controls, persist };
}

describe('renderConfigureDials rpm stepper', () => {
	it('renders the rpm stepper and seeds sel.rpm from current rpm', () => {
		const grinder = makeRpmGrinder();
		const { sel, form } = render(grinder, makeEquipment([grinder]));
		expect(rpmStepperEl(form)).toBeDefined();
		expect(sel.rpm).toBe(1200);
	});

	it('renders no rpm stepper for a fixed-rpm grinder', () => {
		const grinder = makePlainGrinder();
		const { sel, form } = render(grinder, makeEquipment([grinder]));
		expect(rpmStepperEl(form)).toBeUndefined();
		expect(sel.rpm).toBeUndefined();
	});

	it('updates sel, grinder current rpm, and persists on change', () => {
		const grinder = makeRpmGrinder();
		const { sel, form, persist } = render(grinder, makeEquipment([grinder]));
		const buttons = rpmStepperEl(form)!.querySelectorAll('button');
		(buttons[1] as HTMLButtonElement).click();
		expect(sel.rpm).toBe(1210);
		expect(grinder.rpm!.current).toBe(1210);
		expect(persist).toHaveBeenCalledTimes(1);
	});

	it('removes the rpm stepper and clears sel.rpm when switching to a fixed-rpm grinder', () => {
		const rpmGrinder = makeRpmGrinder();
		const plain = makePlainGrinder();
		const { sel, form, controls } = render(rpmGrinder, makeEquipment([rpmGrinder, plain]));
		controls.rebuildGrinderSteppers(plain);
		expect(rpmStepperEl(form)).toBeUndefined();
		expect(sel.rpm).toBeUndefined();
	});

	it('resets rpm to the new grinder current when switching grinders', () => {
		const first = makeRpmGrinder();
		const second: GrinderConfig = {
			...makeRpmGrinder(),
			name: 'P100',
			rpm: { min: 200, max: 1600, step: 50, current: 800 },
		};
		const { sel, controls } = render(first, makeEquipment([first, second]));
		sel.rpm = 1500;
		controls.rebuildGrinderSteppers(second);
		expect(sel.rpm).toBe(800);
	});

	it('applies record rpm through the change chain', () => {
		const grinder = makeRpmGrinder();
		const { sel, controls, persist } = render(grinder, makeEquipment([grinder]));
		controls.applyRecord(makeRecord(1500));
		expect(sel.rpm).toBe(1500);
		expect(grinder.rpm!.current).toBe(1500);
		expect(persist).toHaveBeenCalled();
	});

	it('leaves rpm untouched when the applied record has none', () => {
		const grinder = makeRpmGrinder();
		const { sel, controls } = render(grinder, makeEquipment([grinder]));
		controls.applyRecord(makeRecord(undefined));
		expect(sel.rpm).toBe(1200);
	});

	it('includes rpm in readValues for a variable grinder', () => {
		const grinder = makeRpmGrinder();
		const { controls } = render(grinder, makeEquipment([grinder]));
		expect(controls.readValues().rpm).toBe(1200);
	});
});
