// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createContainer, installPolyfills } from '../../helpers/obsidian-dom-polyfill';
import { BrewFlowState } from '../../../src/brew/BrewFlowState';
import type { StepRenderContext } from '../../../src/views/StepRenderers';
import { renderConfigure } from '../../../src/views/steps/renderConfigure';

const queries = vi.hoisted(() => ({ strict: vi.fn(), loose: vi.fn() }));
vi.mock('../../../src/views/steps/configure/ConfigureRecords', () => ({
	getStrictMatchingRecords: (...args: unknown[]) => {
		queries.strict(...args);
		return Promise.resolve([]);
	},
	getLooseMatchingRecords: (...args: unknown[]) => {
		queries.loose(...args);
		return Promise.resolve([]);
	},
}));

beforeAll(() => installPolyfills());

let container: HTMLElement;
beforeEach(() => {
	container = createContainer();
	queries.strict.mockClear();
	queries.loose.mockClear();
});

function makeFlowState(step: 'configure' | 'saving') {
	const s = new BrewFlowState();
	s.startBrew();
	s.selectMethod('filter', 'hot');
	s.selectBean({ path: 'b.md', name: 'B', roaster: '', status: 'active', roastDate: null, weight: null });
	if (step === 'configure') return s;
	s.updateVariables({ grindSize: 20, dose: 15, waterTemp: 93 });
	s.startBrewing();
	s.beginBrewingRun();
	s.finishBrewing(120, 250);
	return s;
}

function makeContext(flowState: BrewFlowState): StepRenderContext {
	return {
		flowState,
		plugin: {
			recordService: {},
			saveEquipment: vi.fn().mockResolvedValue(undefined),
			acaiaService: null,
			vaultData: { getAllRecipes: () => [] },
		},
		renderContent: vi.fn(),
		accordion: {
			update: vi.fn(),
			expand: vi.fn(),
			getStepPanel: vi.fn(() => null),
			scrollToStep: vi.fn(),
			animateContentChange: (
				_s: Parameters<StepRenderContext['accordion']['animateContentChange']>[0],
				fn: () => void,
			) => fn(),
			updateSummaries: vi.fn(),
		},
		timerController: {},
		getWeightText: () => '0.0',
		resetFlow: vi.fn(),
		recorder: { getPoints: () => [] },
		profileStorage: {},
		equipment: { grinders: [], drippers: [], filters: ['V60'], baskets: [], accessories: [] },
		registerCleanup: vi.fn(),
	} as unknown as StepRenderContext;
}

describe('renderConfigure phase gating', () => {
	it('renders the complete button and runs record init at configure', async () => {
		renderConfigure(container, makeContext(makeFlowState('configure')));
		expect(container.querySelector('.brew-flow-start-btn')).not.toBeNull();
		expect(container.querySelector('.brew-flow-last-record')).not.toBeNull();
		await vi.waitFor(() => expect(queries.loose).toHaveBeenCalled());
	});

	it('hides the last-record card outside the setup phase', () => {
		const flowState = makeFlowState('configure');
		flowState.updateVariables({ grindSize: 20, dose: 15, waterTemp: 93, filter: 'V60' });
		flowState.startBrewing();
		flowState.beginBrewingRun();
		renderConfigure(container, makeContext(flowState));
		expect(container.querySelector('.brew-flow-last-record')).toBeNull();
	});

	it('hides the complete button, the record card, and skips all record queries in review', async () => {
		renderConfigure(container, makeContext(makeFlowState('saving')));
		expect(container.querySelector('.brew-flow-start-btn')).toBeNull();
		expect(container.querySelector('.brew-flow-last-record')).toBeNull();
		await new Promise((r) => setTimeout(r, 0));
		expect(queries.loose).not.toHaveBeenCalled();
		expect(queries.strict).not.toHaveBeenCalled();
	});

	it('keeps the rebuilt grind display and selection aligned after a review grinder change', async () => {
		const flowState = makeFlowState('saving');
		flowState.updateVariables({ grinder: 'Old', grindSize: 20 });
		const ctx = makeContext(flowState);
		ctx.equipment = {
			grinders: [
				{ name: 'Old', step: 1, min: 0, max: 40 },
				{ name: 'New', step: 0.5, min: 5, max: 10 },
			],
			drippers: [],
			filters: ['V60'],
			baskets: [],
			accessories: [],
		};
		renderConfigure(container, ctx);
		const grinderSelect = Array.from(container.querySelectorAll('select')).find(
			(select) => Array.from(select.options).some((option) => option.value === 'New'),
		)!;
		grinderSelect.value = 'New';
		grinderSelect.dispatchEvent(new Event('change'));
		const grindStepper = container.querySelector('.cubicj-stepper')!;
		const displayedGrind = parseFloat(grindStepper.querySelector('.cubicj-stepper-value')!.textContent!);
		expect(displayedGrind).toBe(flowState.selection.grindSize);
		expect(flowState.selection.grindSize).toBe(5);
		expect(ctx.accordion.updateSummaries).toHaveBeenCalled();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(queries.loose).not.toHaveBeenCalled();
		expect(queries.strict).not.toHaveBeenCalled();
	});
});
