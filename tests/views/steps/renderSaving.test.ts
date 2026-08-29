// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { BrewFlowState } from '../../../src/brew/BrewFlowState';
import { BrewProfileRecorder } from '../../../src/views/BrewProfileRecorder';
import { installPolyfills, createContainer } from '../../helpers/obsidian-dom-polyfill';
import type { StepRenderContext } from '../../../src/views/StepRenderers';
import type { BeanInfo } from '../../../src/brew/types';
import { ok, fail, type Result } from '../../../src/types/result';
import { renderSaving } from '../../../src/views/steps/renderSaving';

vi.mock('../../../src/i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

beforeAll(() => {
	installPolyfills();
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

function makeSavingContext(bean: BeanInfo, setWeightResult: Result<void>) {
	const flowState = new BrewFlowState();
	flowState.step = 'saving';
	flowState.selection = {
		method: 'filter',
		temp: 'hot',
		bean,
		grindSize: 2.5,
		dose: 18,
		waterTemp: 93,
	};

	const add = vi.fn(async () => ok(undefined));
	const setWeight = vi.fn(async () => setWeightResult);
	const resetFlow = vi.fn();

	const ctx = {
		flowState,
		plugin: {
			recordService: { add },
			vaultData: { setWeight },
			pluginLogger: null,
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
		getWeightText: vi.fn(() => '0'),
		resetFlow,
		recorder: new BrewProfileRecorder(),
		profileStorage: {} as StepRenderContext['profileStorage'],
		equipment: {} as StepRenderContext['equipment'],
		registerCleanup: vi.fn(),
	} as StepRenderContext;

	return { ctx, add, setWeight, resetFlow };
}

const makeBean = (): BeanInfo => ({
	path: 'beans/a.md',
	name: 'A',
	roaster: '',
	status: 'active',
	roastDate: null,
	weight: 500,
});

describe('renderSaving bean weight deduction', () => {
	it('deducts the dose from the bean weight after a successful save', async () => {
		const bean = makeBean();
		const { ctx, setWeight, resetFlow } = makeSavingContext(bean, ok(undefined));
		const container = createContainer();
		renderSaving(container, ctx);

		(container.querySelector('.brew-flow-save-btn') as HTMLButtonElement).click();
		await vi.waitFor(() => expect(resetFlow).toHaveBeenCalled());

		expect(setWeight).toHaveBeenCalledWith('beans/a.md', 482);
		expect(bean.weight).toBe(482);
	});

	it('keeps the local bean weight when the vault update fails', async () => {
		const bean = makeBean();
		const { ctx, setWeight, resetFlow } = makeSavingContext(
			bean,
			fail('VAULT_FILE_NOT_FOUND', 'File not found: beans/a.md'),
		);
		const container = createContainer();
		renderSaving(container, ctx);

		(container.querySelector('.brew-flow-save-btn') as HTMLButtonElement).click();
		await vi.waitFor(() => expect(resetFlow).toHaveBeenCalled());

		expect(setWeight).toHaveBeenCalled();
		expect(bean.weight).toBe(500);
	});
});
