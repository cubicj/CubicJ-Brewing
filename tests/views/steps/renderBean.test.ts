// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { BrewFlowState } from '../../../src/brew/BrewFlowState';
import { installPolyfills, createContainer } from '../../helpers/obsidian-dom-polyfill';
import type { StepRenderContext } from '../../../src/views/StepRenderers';
import { renderBean } from '../../../src/views/steps/renderBean';

vi.mock('../../../src/i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

beforeAll(() => installPolyfills());

const beanA = { path: 'Beans/A/Ethiopia.md', name: 'Ethiopia', roaster: '', status: 'active' as const, roastDate: null, weight: null };
const beanB = { path: 'Beans/B/Ethiopia.md', name: 'Ethiopia', roaster: '', status: 'active' as const, roastDate: null, weight: null };

function makeContext(flowState: BrewFlowState): StepRenderContext {
	return {
		flowState,
		plugin: {
			vaultData: {
				getActiveBeans: () => [beanA, beanB],
				getDaysSinceRoast: () => null,
			},
		} as unknown as StepRenderContext['plugin'],
		renderContent: vi.fn(),
		accordion: {
			update: vi.fn(),
			expand: vi.fn(),
			scrollToStep: vi.fn(),
			animateContentChange: vi.fn((_, fn: () => void) => fn()),
			updateSummaries: vi.fn(),
		},
		timerController: {} as StepRenderContext['timerController'],
		getWeightText: vi.fn(() => ''),
		resetFlow: vi.fn(),
		recorder: {} as StepRenderContext['recorder'],
		profileStorage: {} as StepRenderContext['profileStorage'],
		equipment: {} as StepRenderContext['equipment'],
		registerCleanup: vi.fn(),
	};
}

describe('renderBean duplicate-basename identity', () => {
	it('marks only the path-matching row as selected', () => {
		const flowState = new BrewFlowState();
		flowState.startBrew();
		flowState.selectMethod('filter', 'hot');
		flowState.selectBean(beanA);
		const container = createContainer();
		renderBean(container, makeContext(flowState));
		const rows = Array.from(container.querySelectorAll('.brew-flow-bean-item'));
		expect(rows.filter((r) => r.classList.contains('is-selected'))).toHaveLength(1);
	});

	it('clicking the same-named other bean selects it instead of deselecting', () => {
		const flowState = new BrewFlowState();
		flowState.startBrew();
		flowState.selectMethod('filter', 'hot');
		flowState.selectBean(beanA);
		const container = createContainer();
		renderBean(container, makeContext(flowState));
		const rows = Array.from(container.querySelectorAll<HTMLElement>('.brew-flow-bean-item'));
		const otherRow = rows.find((r) => !r.classList.contains('is-selected'))!;
		otherRow.click();
		expect(flowState.selection.bean?.path).toBe(beanB.path);
	});
});
