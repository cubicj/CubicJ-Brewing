// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrewFlowState } from '../../../src/brew/BrewFlowState';
import type { BrewProfilePoint } from '../../../src/brew/types';
import type { StepRenderContext } from '../../../src/views/StepRenderers';
import { createContainer, installPolyfills } from '../../helpers/obsidian-dom-polyfill';

const chartMocks = vi.hoisted(() => ({
	instances: [] as Array<{
		startLive: ReturnType<typeof vi.fn>;
		stopLive: ReturnType<typeof vi.fn>;
		renderStatic: ReturnType<typeof vi.fn>;
		destroy: ReturnType<typeof vi.fn>;
	}>,
}));

vi.mock('../../../src/views/BrewProfileChart', () => ({
	BrewProfileChart: class {
		startLive = vi.fn();
		stopLive = vi.fn();
		renderStatic = vi.fn();
		destroy = vi.fn();

		constructor() {
			chartMocks.instances.push(this);
		}
	},
}));

vi.mock('../../../src/views/BrewProfileModal', () => ({
	BrewProfileModal: class {
		open = vi.fn();
	},
}));

vi.mock('../../../src/i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

import { renderBrewing } from '../../../src/views/steps/renderBrewing';

beforeAll(() => installPolyfills());

beforeEach(() => {
	chartMocks.instances.length = 0;
});

function makeFlowState(method: 'filter' | 'espresso') {
	const s = new BrewFlowState();
	s.startBrew();
	s.selectMethod(method, 'hot', method === 'espresso' ? 'shot' : undefined);
	s.selectBean({ path: 'b.md', name: 'B', roaster: '', status: 'active', roastDate: null, weight: null });
	s.startBrewing();
	return s;
}

function makeContext(
	flowState = makeFlowState('filter'),
	points: BrewProfilePoint[] = [],
	scaleState: 'connected' | 'disconnected' = 'connected',
) {
	const cleanups: Array<() => void> = [];
	let recordedPoints = [...points];
	const recorder = {
		getPoints: vi.fn(() => recordedPoints),
		start: vi.fn(),
		stop: vi.fn(),
		reset: vi.fn(() => {
			recordedPoints = [];
		}),
	};
	const ctx = {
		flowState,
		plugin: {
			acaiaService: { state: scaleState },
			app: {},
		},
		renderContent: vi.fn(),
		accordion: {
			update: vi.fn(),
			expand: vi.fn(),
			scrollToStep: vi.fn(),
			animateContentChange: vi.fn(),
			updateSummaries: vi.fn(),
		},
		timerController: {
			freeze: vi.fn(),
			getElapsedSeconds: vi.fn(() => 0),
			handleTimerClick: vi.fn(),
			cancelRun: vi.fn().mockResolvedValue(undefined),
			resetToIdle: vi.fn(),
		},
		getWeightText: vi.fn(() => '0'),
		recorder,
		registerCleanup: (fn: () => void) => cleanups.push(fn),
	} as unknown as StepRenderContext;

	return { ctx, cleanups, recorder };
}

function makeReviewContext({
	method,
	points,
	time,
	yieldGrams,
}: {
	method: 'filter' | 'espresso';
	points: BrewProfilePoint[];
	time?: number;
	yieldGrams?: number;
}) {
	const flowState = makeFlowState(method);
	flowState.beginBrewingRun();
	flowState.finishBrewing(time, yieldGrams);
	return makeContext(flowState, points).ctx;
}

function makeRunningContext(scaleState: 'connected' | 'disconnected' = 'connected') {
	const flowState = makeFlowState('filter');
	flowState.beginBrewingRun();
	return makeContext(flowState, [{ t: 0, w: 0 }], scaleState).ctx;
}

describe('renderBrewing chart cleanup', () => {
	it('registers destruction for a live chart', () => {
		const points = [{ t: 0, w: 0 }];
		const flowState = makeFlowState('filter');
		flowState.beginBrewingRun();
		const { ctx, cleanups, recorder } = makeContext(flowState, points);

		renderBrewing(createContainer(), ctx);

		expect(chartMocks.instances).toHaveLength(1);
		expect(chartMocks.instances[0].startLive).toHaveBeenCalledWith(recorder);
		expect(cleanups).toHaveLength(1);
		cleanups[0]();
		expect(chartMocks.instances[0].destroy).toHaveBeenCalledTimes(1);
	});

	it('registers destruction for a static chart', () => {
		const points = [{ t: 0, w: 0 }];
		const flowState = makeFlowState('filter');
		flowState.beginBrewingRun();
		flowState.finishBrewing(120, 250);
		const { ctx, cleanups } = makeContext(flowState, points);

		renderBrewing(createContainer(), ctx);

		expect(chartMocks.instances).toHaveLength(1);
		expect(chartMocks.instances[0].renderStatic).toHaveBeenCalledWith(points);
		expect(cleanups).toHaveLength(1);
		cleanups[0]();
		expect(chartMocks.instances[0].destroy).toHaveBeenCalledTimes(1);
	});
});

describe('renderBrewing phase controls', () => {
	it('review with a recorded profile renders static chart and redo button, no stop/start', () => {
		const container = createContainer();
		const ctx = makeReviewContext({ method: 'filter', points: [{ t: 0, w: 0 }, { t: 1, w: 10 }] });
		renderBrewing(container, ctx);
		expect(container.querySelector('.brew-profile-container')).not.toBeNull();
		expect(container.querySelector('.brew-flow-redo-btn')).not.toBeNull();
		expect(container.querySelector('.brew-flow-start-btn')).toBeNull();
		expect(container.querySelector('.brew-flow-stop-btn')).toBeNull();
	});

	it('review without a profile renders manual time/yield steppers seeded from selection', () => {
		const container = createContainer();
		const ctx = makeReviewContext({ method: 'espresso', points: [], time: 32, yieldGrams: 40 });
		renderBrewing(container, ctx);
		const steppers = container.querySelectorAll('.cubicj-stepper');
		expect(steppers.length).toBe(2);
		expect(container.querySelector('.brew-profile-container')).toBeNull();
		expect(container.querySelector('.brew-flow-redo-btn')).not.toBeNull();
	});

	it('redo button clears time/yield, resets the recorder, and re-renders', () => {
		const container = createContainer();
		const ctx = makeReviewContext({ method: 'filter', points: [{ t: 0, w: 0 }], time: 120, yieldGrams: 250 });
		renderBrewing(container, ctx);
		(container.querySelector('.brew-flow-redo-btn') as HTMLButtonElement).click();
		expect(ctx.flowState.step).toBe('brewing');
		expect(ctx.flowState.selection.time).toBeUndefined();
		expect(ctx.recorder.getPoints().length).toBe(0);
		expect(ctx.renderContent).toHaveBeenCalled();
	});

	it('connected cancel stops the chart and timer, discards the run, and focuses brewing', async () => {
		const container = createContainer();
		const ctx = makeRunningContext();
		renderBrewing(container, ctx);
		const cancelBtn = container.querySelector('.brew-flow-cancel-btn') as HTMLButtonElement;
		const doneBtn = container.querySelector('.brew-flow-stop-btn') as HTMLButtonElement;
		expect(cancelBtn).not.toBeNull();
		cancelBtn.click();
		expect(cancelBtn.disabled).toBe(true);
		expect(doneBtn.disabled).toBe(true);
		await vi.waitFor(() => expect(ctx.renderContent).toHaveBeenCalledWith('brewing'));
		expect(chartMocks.instances[0].stopLive).toHaveBeenCalledTimes(1);
		expect(ctx.timerController.cancelRun).toHaveBeenCalledTimes(1);
		expect(ctx.flowState.step).toBe('brewing');
		expect(ctx.flowState.brewingStarted).toBe(false);
		expect(ctx.recorder.getPoints().length).toBe(0);
	});

	it('disconnected cancel resets the local timer to idle', async () => {
		const container = createContainer();
		const ctx = makeRunningContext('disconnected');
		renderBrewing(container, ctx);
		(container.querySelector('.brew-flow-cancel-btn') as HTMLButtonElement).click();
		await vi.waitFor(() => expect(ctx.renderContent).toHaveBeenCalledWith('brewing'));
		expect(ctx.timerController.resetToIdle).toHaveBeenCalledTimes(1);
		expect(ctx.timerController.cancelRun).not.toHaveBeenCalled();
	});

	it('scale-less running shows manual steppers and done finishes with the entered values', async () => {
		const container = createContainer();
		const flowState = makeFlowState('filter');
		flowState.beginBrewingRun();
		const { ctx } = makeContext(flowState, [], 'disconnected');
		renderBrewing(container, ctx);
		expect(container.querySelectorAll('.cubicj-stepper').length).toBe(2);
		flowState.updateVariables({ time: 45, yield: 200 });
		(container.querySelector('.brew-flow-stop-btn') as HTMLButtonElement).click();
		await vi.waitFor(() => expect(ctx.renderContent).toHaveBeenCalledWith());
		expect(ctx.flowState.step).toBe('saving');
		expect(ctx.flowState.selection.time).toBe(45);
		expect(ctx.flowState.selection.yield).toBe(200);
	});

	it('connected running shows the chart without manual steppers', () => {
		const container = createContainer();
		const ctx = makeRunningContext();
		renderBrewing(container, ctx);
		expect(container.querySelectorAll('.cubicj-stepper').length).toBe(0);
		expect(container.querySelector('.brew-profile-container')).not.toBeNull();
	});

	it('espresso shows manual steppers next to done and done finishes with the entered values', () => {
		const container = createContainer();
		const { ctx } = makeContext(makeFlowState('espresso'));
		renderBrewing(container, ctx);
		expect(container.querySelectorAll('.cubicj-stepper').length).toBe(2);
		ctx.flowState.updateVariables({ time: 30, yield: 36 });
		(container.querySelector('.brew-flow-stop-btn') as HTMLButtonElement).click();
		expect(ctx.renderContent).toHaveBeenCalledWith();
		expect(ctx.flowState.step).toBe('saving');
		expect(ctx.flowState.selection.time).toBe(30);
		expect(ctx.flowState.selection.yield).toBe(36);
	});

	it('finishing with a recorded profile focuses saving as before', async () => {
		const container = createContainer();
		const ctx = makeRunningContext();
		renderBrewing(container, ctx);
		(container.querySelector('.brew-flow-stop-btn') as HTMLButtonElement).click();
		await vi.waitFor(() => expect(ctx.renderContent).toHaveBeenCalledWith());
		expect(ctx.flowState.step).toBe('saving');
	});

	it('cancel rejection still re-renders a coherent armed brewing state', async () => {
		const container = createContainer();
		const ctx = makeRunningContext();
		vi.mocked(ctx.timerController.cancelRun).mockRejectedValueOnce(new Error('reset failed'));
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		renderBrewing(container, ctx);
		(container.querySelector('.brew-flow-cancel-btn') as HTMLButtonElement).click();
		await vi.waitFor(() => expect(ctx.renderContent).toHaveBeenCalledWith('brewing'));
		expect(ctx.flowState.step).toBe('brewing');
		expect(ctx.flowState.brewingStarted).toBe(false);
		expect(ctx.recorder.getPoints().length).toBe(0);
		consoleError.mockRestore();
	});
});
