// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { BrewFlowState } from '../../../src/brew/BrewFlowState';
import { installPolyfills, createContainer } from '../../helpers/obsidian-dom-polyfill';
import type { StepRenderContext } from '../../../src/views/StepRenderers';
import { renderMethod } from '../../../src/views/steps/renderMethod';

vi.mock('../../../src/i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

beforeAll(() => installPolyfills());

function makeContext(flowState: BrewFlowState, renderContent = vi.fn()): StepRenderContext {
	return {
		flowState,
		plugin: {} as StepRenderContext['plugin'],
		renderContent,
		accordion: {
			update: vi.fn(),
			expand: vi.fn(),
			scrollToStep: vi.fn(),
			animateContentChange: vi.fn((_, fn: () => void) => fn()),
			updateSummaries: vi.fn(),
			getStepPanel: vi.fn(() => null),
		},
		timerController: {} as StepRenderContext['timerController'],
		runCoordinator: {} as StepRenderContext['runCoordinator'],
		getWeightText: vi.fn(() => ''),
		resetFlow: vi.fn(),
		recorder: {} as StepRenderContext['recorder'],
		profileStorage: {} as StepRenderContext['profileStorage'],
		equipment: {} as StepRenderContext['equipment'],
		registerCleanup: vi.fn(),
	};
}

describe('renderMethod', () => {
	it('changing temperature at configure rewinds through the state machine and re-renders', () => {
		const flowState = new BrewFlowState();
		flowState.startBrew();
		flowState.selectMethod('filter', 'hot');
		flowState.selectBean({
			path: 'b.md',
			name: 'B',
			roaster: '',
			status: 'active',
			roastDate: null,
			weight: null,
		});
		const renderContent = vi.fn();
		const container = createContainer();
		renderMethod(container, makeContext(flowState, renderContent));
		const icedBtn = Array.from(container.querySelectorAll('.brew-flow-toggle')).find(
			(button) => button.textContent === 'temp.iced',
		)!;

		(icedBtn as HTMLElement).click();

		expect(flowState.selection.temp).toBe('iced');
		expect(flowState.step).toBe('configure');
		expect(renderContent).toHaveBeenCalled();
	});

	it('renders no is-locked branches: toggles stay clickable DOM in review', () => {
		const flowState = new BrewFlowState();
		flowState.startBrew();
		flowState.selectMethod('filter', 'hot');
		flowState.selectBean({
			path: 'b.md',
			name: 'B',
			roaster: '',
			status: 'active',
			roastDate: null,
			weight: null,
		});
		flowState.startBrewing();
		flowState.beginBrewingRun();
		flowState.finishBrewing(120, 250);
		const container = createContainer();
		renderMethod(container, makeContext(flowState));

		expect(container.querySelectorAll('.brew-flow-toggle').length).toBeGreaterThan(0);
	});

	it('deselecting the active temperature clears equipment immediately and keeps the bean', () => {
		const flowState = new BrewFlowState();
		flowState.startBrew();
		flowState.selectMethod('filter', 'hot');
		flowState.selectBean({ path: 'b.md', name: 'B', roaster: '', status: 'active', roastDate: null, weight: null });
		flowState.updateVariables({ grindSize: 20, dose: 15, waterTemp: 92, grinder: 'G1' });
		const container = createContainer();
		renderMethod(container, makeContext(flowState));
		const hotBtn = Array.from(container.querySelectorAll('.brew-flow-toggle')).find(
			(button) => button.textContent === 'temp.hot',
		)!;

		(hotBtn as HTMLElement).click();

		expect(flowState.step).toBe('method');
		expect(flowState.selection.bean?.path).toBe('b.md');
		expect(flowState.selection.grindSize).toBeUndefined();
		expect(flowState.selection.grinder).toBeUndefined();
	});
});
