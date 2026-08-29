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
		await vi.waitFor(() => expect(queries.loose).toHaveBeenCalled());
	});

	it('hides the complete button, the record card, and skips all record queries in review', async () => {
		renderConfigure(container, makeContext(makeFlowState('saving')));
		expect(container.querySelector('.brew-flow-start-btn')).toBeNull();
		expect(container.querySelector('.brew-flow-last-record')).toBeNull();
		await new Promise((r) => setTimeout(r, 0));
		expect(queries.loose).not.toHaveBeenCalled();
		expect(queries.strict).not.toHaveBeenCalled();
	});
});
