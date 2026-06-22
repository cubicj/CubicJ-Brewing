// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { BrewFlowState } from '../../brew/BrewFlowState';
import { installPolyfills, createContainer } from '../../test/obsidian-dom-polyfill';
import type { StepRenderContext } from '../StepRenderers';
import { renderMethod } from './renderMethod';

vi.mock('../../i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

beforeAll(() => installPolyfills());

function makeContext(flowState: BrewFlowState): StepRenderContext {
	return {
		flowState,
		plugin: {} as StepRenderContext['plugin'],
		renderContent: vi.fn(),
		accordion: {
			update: vi.fn(),
			expand: vi.fn(),
			animateContentChange: vi.fn((_, fn: () => void) => fn()),
			updateSummaries: vi.fn(),
		},
		timerController: {} as StepRenderContext['timerController'],
		getWeightText: vi.fn(() => ''),
		resetFlow: vi.fn(),
		recorder: {} as StepRenderContext['recorder'],
		profileStorage: {} as StepRenderContext['profileStorage'],
		equipment: {} as StepRenderContext['equipment'],
		brewingStarted: true,
		registerCleanup: vi.fn(),
	};
}

describe('renderMethod', () => {
	it('restores active method toggle when locked', () => {
		const flowState = new BrewFlowState();
		flowState.selection.method = 'filter';
		flowState.selection.temp = 'hot';
		flowState.step = 'brewing';
		const container = createContainer();

		renderMethod(container, makeContext(flowState));

		const toggles = container.querySelectorAll('.brew-flow-toggle');
		const filterToggle = toggles[0] as HTMLElement;
		const espressoToggle = toggles[1] as HTMLElement;
		espressoToggle.click();

		expect(flowState.selection.method).toBe('filter');
		expect(filterToggle.classList.contains('is-active')).toBe(true);
		expect(espressoToggle.classList.contains('is-active')).toBe(false);
	});
});
