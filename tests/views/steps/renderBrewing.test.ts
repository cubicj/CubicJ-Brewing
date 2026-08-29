// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrewFlowState } from '../../../src/brew/BrewFlowState';
import type { BrewProfilePoint } from '../../../src/brew/types';
import { BrewRunCoordinator } from '../../../src/views/BrewRunCoordinator';
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
	t: (key: string, vars?: Record<string, string | number>) => (key === 'modal.seconds' ? `${vars?.n}s` : key),
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

function makeArmedFilterFlow() {
	return makeFlowState('filter');
}

function makeRunningFilterFlow() {
	return makeFlowState('filter');
}

function makeReviewFlowWithPoints({ time, yield: yieldGrams }: { time: number; yield: number }) {
	const flowState = makeRunningFilterFlow();
	flowState.finishBrewing(time, yieldGrams);
	return flowState;
}

function makeHarness(
	flowState = makeArmedFilterFlow(),
	{
		points = [],
		connected = true,
		recording = false,
	}: { points?: BrewProfilePoint[]; connected?: boolean; recording?: boolean } = {},
) {
	const cleanups: Array<() => void> = [];
	let recordedPoints = [...points];
	let isRecording = false;
	const recorder = {
		get isRecording() {
			return isRecording;
		},
		getPoints: vi.fn(() => recordedPoints),
		start: vi.fn(() => {
			isRecording = true;
		}),
		stop: vi.fn(() => {
			isRecording = false;
		}),
		reset: vi.fn(() => {
			recordedPoints = [];
			isRecording = false;
		}),
	};
	const timerController = {
		freeze: vi.fn(),
		getElapsedSeconds: vi.fn(() => 0),
		handleTimerClick: vi.fn(),
		cancelRun: vi.fn().mockResolvedValue(undefined),
		resetToIdle: vi.fn(),
	};
	const container = createContainer();
	let ctx!: StepRenderContext;
	const renderContent = vi.fn(() => {
		container.empty();
		renderBrewing(container, ctx);
	});
	const runCoordinator = new BrewRunCoordinator(
		flowState,
		recorder as unknown as StepRenderContext['recorder'],
		timerController as unknown as StepRenderContext['timerController'],
		{
			getScaleState: () => (connected ? 'connected' : 'idle'),
			renderContent,
		},
	);
	if (recording) {
		if (flowState.brewingStarted) flowState.cancelBrewingRun();
		void runCoordinator.startRun();
	}
	ctx = {
		flowState,
		plugin: {
			acaiaService: { state: connected ? 'connected' : 'disconnected' },
			app: {},
		},
		renderContent,
		accordion: {
			update: vi.fn(),
			expand: vi.fn(),
			scrollToStep: vi.fn(),
			animateContentChange: vi.fn(),
			updateSummaries: vi.fn(),
		},
		timerController,
		getWeightText: vi.fn(() => '0'),
		runCoordinator,
		recorder,
		registerCleanup: (fn: () => void) => cleanups.push(fn),
	} as unknown as StepRenderContext;

	return {
		container,
		ctx,
		cleanups,
		recorder,
		renderContent,
		timerController,
		setConnected(value: boolean) {
			connected = value;
		},
	};
}

function makeContext(
	flowState = makeArmedFilterFlow(),
	points: BrewProfilePoint[] = [],
	scaleState: 'connected' | 'disconnected' = 'connected',
) {
	return makeHarness(flowState, { points, connected: scaleState === 'connected', recording: flowState.brewingStarted });
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
	return makeHarness(makeRunningFilterFlow(), {
		points: [{ t: 0, w: 0 }],
		connected: scaleState === 'connected',
		recording: true,
	}).ctx;
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
	it('shows the link-lost banner with a convert button while a run has lost its scale', async () => {
		const flowState = makeRunningFilterFlow();
		const harness = makeHarness(flowState, { connected: true, recording: true });
		renderBrewing(harness.container, harness.ctx);
		harness.setConnected(false);
		harness.ctx.runCoordinator.handleScaleState('disconnected');
		expect(harness.container.querySelector('.brew-flow-link-lost')).not.toBeNull();
		expect(harness.container.querySelector('.brew-flow-convert-btn')).not.toBeNull();
	});

	it('convert click discards points and requests a manual rerender', async () => {
		const flowState = makeRunningFilterFlow();
		const harness = makeHarness(flowState, {
			points: [{ t: 1, w: 10 }],
			connected: true,
			recording: true,
		});
		renderBrewing(harness.container, harness.ctx);
		harness.setConnected(false);
		harness.ctx.runCoordinator.handleScaleState('disconnected');
		harness.container.querySelector<HTMLButtonElement>('.brew-flow-convert-btn')!.click();
		expect(harness.recorder.getPoints()).toEqual([]);
		expect(harness.ctx.runCoordinator.isScaleModeRun()).toBe(false);
		expect(harness.renderContent).toHaveBeenCalledWith('brewing');
		expect(harness.container.querySelectorAll('.cubicj-stepper')).toHaveLength(2);
		expect(harness.container.querySelector('.brew-profile-container')).toBeNull();
		expect(harness.container.querySelector('.brew-flow-link-lost')).toBeNull();
	});

	it('renders no banner on a healthy connected run', () => {
		const flowState = makeRunningFilterFlow();
		const harness = makeHarness(flowState, { connected: true, recording: true });
		renderBrewing(harness.container, harness.ctx);
		expect(harness.container.querySelector('.brew-flow-link-lost')).toBeNull();
	});

	it('review with a recorded profile renders static chart and redo button, no stop/start', () => {
		const container = createContainer();
		const ctx = makeReviewContext({ method: 'filter', points: [{ t: 0, w: 0 }, { t: 1, w: 10 }] });
		renderBrewing(container, ctx);
		expect(container.querySelector('.brew-profile-container')).not.toBeNull();
		expect(container.querySelector('.brew-flow-redo-btn')).not.toBeNull();
		expect(container.querySelector('.brew-flow-start-btn')).toBeNull();
		expect(container.querySelector('.brew-flow-stop-btn')).toBeNull();
	});

	it('review with a recorded profile also shows prefilled time and yield steppers', () => {
		const flowState = makeReviewFlowWithPoints({ time: 130, yield: 210 });
		const harness = makeHarness(flowState, { connected: true, points: [{ t: 1, w: 10 }] });
		renderBrewing(harness.container, harness.ctx);
		expect(harness.container.querySelector('.brew-profile-container')).not.toBeNull();
		const steppers = harness.container.querySelectorAll<HTMLElement>('.brew-flow-form .cubicj-stepper');
		expect(steppers).toHaveLength(2);
		expect(steppers[0].querySelector('.cubicj-stepper-value')?.textContent).toBe('130s');
		expect(steppers[1].querySelector('.cubicj-stepper-value')?.textContent).toBe('210.0g');
		steppers[0].querySelectorAll<HTMLButtonElement>('.cubicj-stepper-btn')[1].click();
		steppers[1].querySelectorAll<HTMLButtonElement>('.cubicj-stepper-btn')[1].click();
		expect(flowState.selection.time).toBe(131);
		expect(flowState.selection.yield).toBe(210.1);
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

describe('renderBrewing re-entry guards', () => {
	it('start reads connectivity at click time, not render time', async () => {
		const flowState = makeArmedFilterFlow();
		const harness = makeHarness(flowState, { connected: true });
		renderBrewing(harness.container, harness.ctx);
		harness.setConnected(false);
		harness.container.querySelector<HTMLButtonElement>('.brew-flow-start-btn')!.click();
		await vi.waitFor(() => expect(flowState.brewingStarted).toBe(true));
		expect(harness.recorder.start).not.toHaveBeenCalled();
		expect(harness.timerController.handleTimerClick).not.toHaveBeenCalled();
	});

	it('done on a running scale-mode panel finishes through the coordinator', async () => {
		const flowState = makeRunningFilterFlow();
		const harness = makeHarness(flowState, { connected: true, recording: true });
		renderBrewing(harness.container, harness.ctx);
		harness.container.querySelector<HTMLButtonElement>('.brew-flow-stop-btn')!.click();
		await vi.waitFor(() => expect(flowState.step).toBe('saving'));
		expect(harness.timerController.freeze).toHaveBeenCalledTimes(1);
	});

	it('double-clicking start begins exactly one run', async () => {
		const flowState = makeFlowState('filter');
		const { ctx, recorder } = makeContext(flowState);
		let resolveTimer!: () => void;
		vi.mocked(ctx.timerController.handleTimerClick).mockImplementation(
			() => new Promise<void>((resolve) => (resolveTimer = resolve)),
		);
		const container = createContainer();
		renderBrewing(container, ctx);
		const startBtn = container.querySelector<HTMLButtonElement>('.brew-flow-start-btn')!;
		startBtn.click();
		startBtn.click();
		await vi.waitFor(() => expect(ctx.timerController.handleTimerClick).toHaveBeenCalledTimes(1));
		resolveTimer();
		await Promise.resolve();
		expect(recorder.start).toHaveBeenCalledTimes(1);
		expect(ctx.timerController.handleTimerClick).toHaveBeenCalledTimes(1);
	});

	it('a stale start button whose run already began performs no side effects', () => {
		const flowState = makeFlowState('filter');
		const { ctx, recorder } = makeContext(flowState);
		const container = createContainer();
		renderBrewing(container, ctx);
		flowState.beginBrewingRun();
		container.querySelector<HTMLButtonElement>('.brew-flow-start-btn')!.click();
		expect(recorder.start).not.toHaveBeenCalled();
		expect(ctx.timerController.handleTimerClick).not.toHaveBeenCalled();
	});

	it('a rejected timer start returns to an armed state that can be retried', async () => {
		const flowState = makeFlowState('filter');
		const { ctx, recorder } = makeContext(flowState);
		vi.mocked(ctx.timerController.handleTimerClick).mockRejectedValueOnce(new Error('timer failed'));
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			const container = createContainer();
			renderBrewing(container, ctx);
			container.querySelector<HTMLButtonElement>('.brew-flow-start-btn')!.click();
			await vi.waitFor(() => expect(consoleError).toHaveBeenCalledTimes(1));
			expect(flowState.brewingStarted).toBe(false);
			expect(recorder.reset).toHaveBeenCalledTimes(1);
			expect(ctx.renderContent).toHaveBeenCalledWith('brewing');

			const retryContainer = createContainer();
			renderBrewing(retryContainer, ctx);
			retryContainer.querySelector<HTMLButtonElement>('.brew-flow-start-btn')!.click();
			await Promise.resolve();
			expect(flowState.brewingStarted).toBe(true);
			expect(recorder.start).toHaveBeenCalledTimes(2);
			expect(ctx.timerController.handleTimerClick).toHaveBeenCalledTimes(2);
		} finally {
			consoleError.mockRestore();
		}
	});

	it('double-clicking done stops exactly once', async () => {
		const ctx = makeRunningContext();
		let resolveFreeze!: () => void;
		vi.mocked(ctx.timerController.freeze).mockImplementation(
			() => new Promise<void>((resolve) => (resolveFreeze = resolve)),
		);
		const container = createContainer();
		renderBrewing(container, ctx);
		const stopBtn = container.querySelector<HTMLButtonElement>('.brew-flow-stop-btn')!;
		stopBtn.click();
		stopBtn.click();
		await vi.waitFor(() => expect(ctx.timerController.freeze).toHaveBeenCalledTimes(1));
		resolveFreeze();
		await Promise.resolve();
		expect(ctx.recorder.stop).toHaveBeenCalledTimes(1);
		expect(ctx.timerController.freeze).toHaveBeenCalledTimes(1);
	});
});
