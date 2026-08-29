// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { BrewFlowSelection } from '../../src/brew/types';
import { getStepSummary, STEP_ORDER } from '../../src/views/StepRenderers';

vi.mock('../../src/i18n/index', () => ({ t: (key: string) => key, initI18n: vi.fn() }));

describe('STEP_ORDER', () => {
	it('uses bean-first panel order', () => {
		expect(STEP_ORDER).toEqual(['bean', 'method', 'configure', 'brewing', 'saving']);
	});
});

describe('getStepSummary configure', () => {
	it('includes RPM between grind size and dose when set', () => {
		const sel: BrewFlowSelection = { method: 'filter', grindSize: 20, dose: 15, waterTemp: 93, rpm: 1200 };
		expect(getStepSummary('configure', sel)).toBe('summary.grindSize 20 · RPM 1200 · summary.dose 15g · 93°C');
	});

	it('returns empty while the dose is not yet set even if the grind size is', () => {
		const sel: BrewFlowSelection = { method: 'filter', grindSize: 20 };
		expect(getStepSummary('configure', sel)).toBe('');
	});

	it('omits RPM when not set', () => {
		const sel: BrewFlowSelection = { method: 'filter', grindSize: 20, dose: 15, waterTemp: 93 };
		expect(getStepSummary('configure', sel)).toBe('summary.grindSize 20 · summary.dose 15g · 93°C');
	});

	it('method summary is empty until every required method field is chosen', () => {
		expect(getStepSummary('method', { method: 'filter' })).toBe('');
		expect(getStepSummary('method', { method: 'espresso', temp: 'hot' })).toBe('');
		expect(getStepSummary('method', { method: 'filter', temp: 'hot' })).not.toBe('');
		expect(getStepSummary('method', { method: 'espresso', temp: 'hot', drink: 'latte' })).not.toBe('');
	});
});
