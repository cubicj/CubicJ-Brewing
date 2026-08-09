// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import type { BrewFlowSelection } from '../../src/brew/types';
import { getStepSummary } from '../../src/views/StepRenderers';

vi.mock('../../src/i18n/index', () => ({ t: (key: string) => key, initI18n: vi.fn() }));

describe('getStepSummary configure', () => {
	it('includes RPM between grind size and dose when set', () => {
		const sel: BrewFlowSelection = { method: 'filter', grindSize: 20, dose: 15, waterTemp: 93, rpm: 1200 };
		expect(getStepSummary('configure', sel)).toBe('summary.grindSize 20 · RPM 1200 · summary.dose 15g · 93°C');
	});

	it('omits RPM when not set', () => {
		const sel: BrewFlowSelection = { method: 'filter', grindSize: 20, dose: 15, waterTemp: 93 };
		expect(getStepSummary('configure', sel)).toBe('summary.grindSize 20 · summary.dose 15g · 93°C');
	});
});
