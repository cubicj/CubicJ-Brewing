import { describe, it, expect, vi } from 'vitest';
import { BrewFlowState } from '../../src/brew/BrewFlowState';
import { BrewProfileRecorder } from '../../src/views/BrewProfileRecorder';
import { BrewRunCoordinator } from '../../src/views/BrewRunCoordinator';
import { withTimerOperationTimeout } from '../../src/views/BrewingView';
import { TimerController } from '../../src/views/TimerController';
import type { AcaiaState } from '../../src/acaia/types';

vi.mock('obsidian', async (importOriginal) => {
	const obsidian = await importOriginal<Record<string, unknown>>();
	return { ...obsidian, ItemView: class {} };
});

const bean = { path: 'Beans/b.md', name: 'B', roaster: '', status: 'active' as const, roastDate: null, weight: null };

function makeFlow(): BrewFlowState {
	const s = new BrewFlowState();
	s.startBrew();
	s.selectMethod('filter', 'hot');
	s.selectBean(bean);
	s.updateVariables({ grindSize: 20, dose: 15, waterTemp: 92 });
	s.startBrewing();
	return s;
}

interface TimerMock {
	handleTimerClick: ReturnType<typeof vi.fn>;
	handleScaleButton: ReturnType<typeof vi.fn>;
	freeze: ReturnType<typeof vi.fn>;
	cancelRun: ReturnType<typeof vi.fn>;
	resetToIdle: ReturnType<typeof vi.fn>;
	getElapsedSeconds: ReturnType<typeof vi.fn>;
}

function makeTimer(elapsed = 90): TimerMock {
	return {
		handleTimerClick: vi.fn(async () => {}),
		handleScaleButton: vi.fn(),
		freeze: vi.fn(async () => {}),
		cancelRun: vi.fn(async () => {}),
		resetToIdle: vi.fn(),
		getElapsedSeconds: vi.fn(() => elapsed),
	};
}

function makeDeferred() {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function makeRealTimer(callbacks: {
	startTimer: () => Promise<void>;
	stopTimer: () => Promise<void>;
	resetTimer: () => Promise<void>;
}) {
	vi.stubGlobal('window', {
		setInterval: vi.fn(() => 1),
		clearInterval: vi.fn(),
		setTimeout: globalThis.setTimeout,
		clearTimeout: globalThis.clearTimeout,
	});
	const timerEl = { textContent: '0:00' } as HTMLElement;
	const timerBtn = { textContent: '\u23FB' } as HTMLButtonElement;
	const timer = new TimerController({ timerEl, timerBtn }, callbacks);
	return { timer, timerEl, timerBtn };
}

function makeCoordinator(flow: BrewFlowState, timer: TimerMock | TimerController, state: AcaiaState = 'connected') {
	const recorder = new BrewProfileRecorder();
	const renderContent = vi.fn();
	let scaleState = state;
	const coordinator = new BrewRunCoordinator(flow, recorder, timer as TimerController, {
		getScaleState: () => scaleState,
		renderContent,
	});
	return { coordinator, recorder, renderContent, setScaleState: (s: AcaiaState) => (scaleState = s) };
}

describe('startRun', () => {
	it('starts recorder and timer when connected and returns true', async () => {
		const flow = makeFlow();
		const timer = makeTimer();
		const { coordinator, recorder } = makeCoordinator(flow, timer);
		await expect(coordinator.startRun()).resolves.toBe(true);
		expect(flow.brewingStarted).toBe(true);
		expect(recorder.isRecording).toBe(true);
		expect(timer.handleTimerClick).toHaveBeenCalledTimes(1);
	});

	it('starts a manual run without recorder or timer when disconnected', async () => {
		const flow = makeFlow();
		const timer = makeTimer();
		const { coordinator, recorder } = makeCoordinator(flow, timer, 'idle');
		await expect(coordinator.startRun()).resolves.toBe(true);
		expect(recorder.isRecording).toBe(false);
		expect(timer.handleTimerClick).not.toHaveBeenCalled();
	});

	it('rejects re-entry without side effects', async () => {
		const flow = makeFlow();
		const timer = makeTimer();
		const { coordinator } = makeCoordinator(flow, timer);
		await coordinator.startRun();
		await expect(coordinator.startRun()).resolves.toBe(false);
		expect(timer.handleTimerClick).toHaveBeenCalledTimes(1);
	});

	it('rolls back to armed and rethrows when the timer start rejects', async () => {
		const flow = makeFlow();
		const timer = makeTimer();
		timer.handleTimerClick.mockRejectedValueOnce(new Error('ble'));
		const { coordinator, recorder, renderContent } = makeCoordinator(flow, timer);
		await expect(coordinator.startRun()).rejects.toThrow('ble');
		expect(flow.brewingStarted).toBe(false);
		expect(recorder.isRecording).toBe(false);
		expect(recorder.getPoints()).toHaveLength(0);
		expect(renderContent).toHaveBeenCalledWith('brewing');
	});
});

describe('link loss and reconnect', () => {
	it('disconnect mid-run sets linkLost, keeps timer and recorder armed, rerenders P4', async () => {
		const flow = makeFlow();
		const timer = makeTimer();
		const { coordinator, recorder, renderContent, setScaleState } = makeCoordinator(flow, timer);
		await coordinator.startRun();
		timer.resetToIdle.mockClear();
		setScaleState('disconnected');
		coordinator.handleScaleState('disconnected');
		expect(coordinator.isLinkLost()).toBe(true);
		expect(coordinator.isScaleModeRun()).toBe(true);
		expect(recorder.isRecording).toBe(true);
		expect(timer.resetToIdle).not.toHaveBeenCalled();
		expect(renderContent).toHaveBeenCalledWith('brewing');
	});

	it('reconnect clears linkLost and rerenders', async () => {
		const flow = makeFlow();
		const timer = makeTimer();
		const { coordinator, renderContent, setScaleState } = makeCoordinator(flow, timer);
		await coordinator.startRun();
		setScaleState('reconnecting');
		coordinator.handleScaleState('reconnecting');
		renderContent.mockClear();
		setScaleState('connected');
		coordinator.handleScaleState('connected');
		expect(coordinator.isLinkLost()).toBe(false);
		expect(renderContent).toHaveBeenCalledWith('brewing');
	});

	it('ignores state changes when no run is active', () => {
		const flow = makeFlow();
		const timer = makeTimer();
		const { coordinator, renderContent } = makeCoordinator(flow, timer);
		coordinator.handleScaleState('disconnected');
		expect(coordinator.isLinkLost()).toBe(false);
		expect(renderContent).not.toHaveBeenCalled();
	});
});

describe('convertToManual', () => {
	it('discards points, leaves scale mode, and rerenders', async () => {
		const flow = makeFlow();
		const timer = makeTimer();
		const { coordinator, recorder, renderContent, setScaleState } = makeCoordinator(flow, timer);
		await coordinator.startRun();
		recorder.record(10);
		setScaleState('disconnected');
		coordinator.handleScaleState('disconnected');
		renderContent.mockClear();
		coordinator.convertToManual();
		expect(recorder.getPoints()).toHaveLength(0);
		expect(coordinator.isScaleModeRun()).toBe(false);
		expect(coordinator.isLinkLost()).toBe(false);
		expect(renderContent).toHaveBeenCalledWith('brewing');
	});

	it('is a no-op while the link is alive', async () => {
		const flow = makeFlow();
		const timer = makeTimer();
		const { coordinator, recorder } = makeCoordinator(flow, timer);
		await coordinator.startRun();
		recorder.record(10);
		coordinator.convertToManual();
		expect(recorder.getPoints()).toHaveLength(1);
	});
});

describe('converted timer ownership', () => {
	it('freezes at finish and starts a fresh timer after redo', async () => {
		const flow = makeFlow();
		const callbacks = {
			startTimer: vi.fn(async () => {}),
			stopTimer: vi.fn(async () => {}),
			resetTimer: vi.fn(async () => {}),
		};
		const { timer, timerBtn } = makeRealTimer(callbacks);
		const { coordinator, setScaleState } = makeCoordinator(flow, timer);
		await coordinator.startRun();
		setScaleState('disconnected');
		coordinator.handleScaleState('disconnected');
		coordinator.convertToManual();
		await expect(coordinator.finishRun()).resolves.toBe(true);
		expect(callbacks.stopTimer).toHaveBeenCalledTimes(1);
		expect(timerBtn.textContent).toBe('\u21BA');
		flow.redoBrewing();
		setScaleState('connected');
		await expect(coordinator.startRun()).resolves.toBe(true);
		expect(callbacks.startTimer).toHaveBeenCalledTimes(2);
		expect(timerBtn.textContent).toBe('\u23F9');
	});

	it('sends a hardware reset when a converted run reconnects before cancellation', async () => {
		const flow = makeFlow();
		const timer = makeTimer();
		const { coordinator, setScaleState } = makeCoordinator(flow, timer);
		await coordinator.startRun();
		setScaleState('disconnected');
		coordinator.handleScaleState('disconnected');
		coordinator.convertToManual();
		setScaleState('connected');
		coordinator.handleScaleState('connected');
		timer.resetToIdle.mockClear();
		await coordinator.cancelRun();
		expect(timer.cancelRun).toHaveBeenCalledTimes(1);
		expect(timer.resetToIdle).not.toHaveBeenCalled();
	});

	it('keeps a converted run alive when its pending scale start rejects', async () => {
		const flow = makeFlow();
		const timer = makeTimer();
		const start = makeDeferred();
		timer.handleTimerClick.mockImplementationOnce(() => start.promise);
		const { coordinator, recorder, setScaleState } = makeCoordinator(flow, timer);
		const pending = coordinator.startRun();
		await vi.waitFor(() => expect(timer.handleTimerClick).toHaveBeenCalledTimes(1));
		setScaleState('disconnected');
		coordinator.handleScaleState('disconnected');
		coordinator.convertToManual();
		timer.resetToIdle.mockClear();
		start.reject(new Error('ble'));
		await expect(pending).resolves.toBe(false);
		expect(flow.brewingStarted).toBe(true);
		expect(coordinator.isScaleModeRun()).toBe(false);
		expect(recorder.getPoints()).toHaveLength(0);
		expect(timer.resetToIdle).not.toHaveBeenCalled();
	});
});

describe('finishRun', () => {
	it('scale mode: stops recorder, freezes timer, saves elapsed time', async () => {
		const flow = makeFlow();
		const timer = makeTimer(120);
		const { coordinator } = makeCoordinator(flow, timer);
		await coordinator.startRun();
		await expect(coordinator.finishRun()).resolves.toBe(true);
		expect(flow.step).toBe('saving');
		expect(flow.selection.time).toBe(120);
		expect(timer.freeze).toHaveBeenCalledTimes(1);
	});

	it('scale mode: finishes with captured elapsed even when freeze rejects', async () => {
		const flow = makeFlow();
		const timer = makeTimer(80);
		timer.freeze.mockRejectedValueOnce(new Error('ble'));
		const { coordinator } = makeCoordinator(flow, timer);
		await coordinator.startRun();
		await expect(coordinator.finishRun()).resolves.toBe(true);
		expect(flow.selection.time).toBe(80);
		expect(timer.resetToIdle).toHaveBeenCalled();
	});

	it('converted run: user-entered time wins over the timer', async () => {
		const flow = makeFlow();
		const timer = makeTimer(200);
		const { coordinator, setScaleState } = makeCoordinator(flow, timer);
		await coordinator.startRun();
		setScaleState('disconnected');
		coordinator.handleScaleState('disconnected');
		coordinator.convertToManual();
		flow.updateVariables({ time: 150, yield: 240 });
		await coordinator.finishRun();
		expect(flow.selection.time).toBe(150);
		expect(flow.selection.yield).toBe(240);
	});

	it('converted run without manual time falls back to timer elapsed', async () => {
		const flow = makeFlow();
		const timer = makeTimer(200);
		const { coordinator, setScaleState } = makeCoordinator(flow, timer);
		await coordinator.startRun();
		setScaleState('disconnected');
		coordinator.handleScaleState('disconnected');
		coordinator.convertToManual();
		await coordinator.finishRun();
		expect(flow.selection.time).toBe(200);
	});

	it('returns false when no run is active', async () => {
		const flow = makeFlow();
		const timer = makeTimer();
		const { coordinator } = makeCoordinator(flow, timer);
		await expect(coordinator.finishRun()).resolves.toBe(false);
	});
});

describe('external control absorption', () => {
	it('physical timer_start while armed begins the run without a BLE timer round-trip', async () => {
		const flow = makeFlow();
		const timer = makeTimer();
		const { coordinator, recorder, renderContent } = makeCoordinator(flow, timer);
		coordinator.handleScaleButton({ type: 'timer_start' });
		await vi.waitFor(() => expect(flow.brewingStarted).toBe(true));
		expect(flow.brewingStarted).toBe(true);
		expect(recorder.isRecording).toBe(true);
		expect(timer.handleScaleButton).toHaveBeenCalledWith({ type: 'timer_start' });
		expect(timer.handleTimerClick).not.toHaveBeenCalled();
		expect(renderContent).toHaveBeenCalledWith('brewing');
	});

	it('physical timer_stop while running finishes the run', async () => {
		const flow = makeFlow();
		const timer = makeTimer(95);
		const { coordinator } = makeCoordinator(flow, timer);
		await coordinator.startRun();
		coordinator.handleScaleButton({ type: 'timer_stop' });
		await vi.waitFor(() => expect(flow.step).toBe('saving'));
		expect(flow.selection.time).toBe(95);
	});

	it('physical timer_reset while running cancels the run', async () => {
		const flow = makeFlow();
		const timer = makeTimer();
		const { coordinator, recorder } = makeCoordinator(flow, timer);
		await coordinator.startRun();
		recorder.record(10);
		coordinator.handleScaleButton({ type: 'timer_reset' });
		await vi.waitFor(() => expect(timer.handleScaleButton).toHaveBeenCalledWith({ type: 'timer_reset' }));
		expect(flow.step).toBe('brewing');
		expect(flow.brewingStarted).toBe(false);
		expect(recorder.getPoints()).toHaveLength(0);
		expect(timer.handleScaleButton).toHaveBeenCalledWith({ type: 'timer_reset' });
	});

	it('passes buttons through outside the brewing step', async () => {
		const flow = new BrewFlowState();
		flow.startBrew();
		const timer = makeTimer();
		const { coordinator } = makeCoordinator(flow, timer);
		coordinator.handleScaleButton({ type: 'timer_start' });
		await vi.waitFor(() => expect(timer.handleScaleButton).toHaveBeenCalledWith({ type: 'timer_start' }));
		expect(flow.brewingStarted).toBe(false);
		expect(timer.handleScaleButton).toHaveBeenCalledWith({ type: 'timer_start' });
	});

	it('passes buttons through for espresso', async () => {
		const flow = new BrewFlowState();
		flow.startBrew();
		flow.selectMethod('espresso', 'hot', 'shot');
		flow.selectBean(bean);
		flow.updateVariables({ grindSize: 20, dose: 15, basket: 'B18' });
		flow.startBrewing();
		const timer = makeTimer();
		const { coordinator } = makeCoordinator(flow, timer);
		const event = { type: 'timer_start' } as const;
		coordinator.handleScaleButton(event);
		await vi.waitFor(() => expect(timer.handleScaleButton).toHaveBeenCalledWith(event));
		expect(flow.brewingStarted).toBe(false);
		expect(timer.handleScaleButton).toHaveBeenCalledWith(event);
	});

	it('ignores a second toolbar stop while finish is pending', async () => {
		const flow = makeFlow();
		const timer = makeTimer(70);
		const freeze = makeDeferred();
		timer.freeze.mockImplementationOnce(() => freeze.promise);
		const { coordinator } = makeCoordinator(flow, timer);
		await coordinator.startRun();
		coordinator.handleToolbarTimer();
		await vi.waitFor(() => expect(timer.freeze).toHaveBeenCalledTimes(1));
		coordinator.handleToolbarTimer();
		await Promise.resolve();
		expect(flow.step).toBe('brewing');
		expect(timer.freeze).toHaveBeenCalledTimes(1);
		freeze.resolve();
		await vi.waitFor(() => expect(flow.step).toBe('saving'));
		expect(flow.selection.time).toBe(70);
	});

	it('toolbar click while armed starts the run and while running finishes it', async () => {
		const flow = makeFlow();
		const timer = makeTimer(70);
		const { coordinator } = makeCoordinator(flow, timer);
		coordinator.handleToolbarTimer();
		await vi.waitFor(() => expect(flow.brewingStarted).toBe(true));
		coordinator.handleToolbarTimer();
		await vi.waitFor(() => expect(flow.step).toBe('saving'));
	});

	it('toolbar click outside a run toggles the plain timer', async () => {
		const flow = new BrewFlowState();
		flow.startBrew();
		const timer = makeTimer();
		const { coordinator } = makeCoordinator(flow, timer);
		coordinator.handleToolbarTimer();
		await vi.waitFor(() => expect(timer.handleTimerClick).toHaveBeenCalledTimes(1));
	});
});

describe('resetAll generation token', () => {
	it('advances reset cleanup after a bounded timer callback never settles', async () => {
		vi.useFakeTimers();
		try {
			const flow = makeFlow();
			const callbacks = {
				startTimer: vi.fn(() => withTimerOperationTimeout(() => new Promise<void>(() => {}))),
				stopTimer: vi.fn(async () => {}),
				resetTimer: vi.fn(() => withTimerOperationTimeout(async () => {})),
			};
			const { timer, timerBtn } = makeRealTimer(callbacks);
			const { coordinator } = makeCoordinator(flow, timer);
			const pending = coordinator.startRun();
			await vi.advanceTimersByTimeAsync(0);
			expect(callbacks.startTimer).toHaveBeenCalledTimes(1);
			const rejection = expect(pending).rejects.toThrow('timed out');
			await vi.advanceTimersByTimeAsync(5000);
			await rejection;
			coordinator.resetAll();
			await vi.advanceTimersByTimeAsync(0);
			expect(callbacks.resetTimer).toHaveBeenCalledTimes(2);
			expect(timer.getElapsedSeconds()).toBe(0);
			expect(timerBtn.textContent).toBe('\u23FB');
		} finally {
			vi.useRealTimers();
		}
	});

	it('invalidates a pending start so its continuation reports stale', async () => {
		const flow = makeFlow();
		const timer = makeTimer();
		let resolveClick!: () => void;
		timer.handleTimerClick.mockImplementationOnce(() => new Promise<void>((r) => (resolveClick = r)));
		const { coordinator } = makeCoordinator(flow, timer);
		const pending = coordinator.startRun();
		await vi.waitFor(() => expect(timer.handleTimerClick).toHaveBeenCalledTimes(1));
		coordinator.resetAll();
		resolveClick();
		await expect(pending).resolves.toBe(false);
	});

	it('serializes a pending real timer start before reset cleanup', async () => {
		const flow = makeFlow();
		const start = makeDeferred();
		const callbacks = {
			startTimer: vi.fn(() => start.promise),
			stopTimer: vi.fn(async () => {}),
			resetTimer: vi.fn(async () => {}),
		};
		const { timer, timerEl, timerBtn } = makeRealTimer(callbacks);
		const { coordinator } = makeCoordinator(flow, timer);
		const pending = coordinator.startRun();
		await vi.waitFor(() => expect(callbacks.startTimer).toHaveBeenCalledTimes(1));
		coordinator.resetAll();
		expect(callbacks.resetTimer).toHaveBeenCalledTimes(1);
		start.resolve();
		await expect(pending).resolves.toBe(false);
		await vi.waitFor(() => expect(callbacks.resetTimer).toHaveBeenCalledTimes(2));
		expect(timer.getElapsedSeconds()).toBe(0);
		expect(timerEl.textContent).toBe('0:00');
		expect(timerBtn.textContent).toBe('\u23FB');
	});

	it('preserves a physical replacement run after a stale real timer start settles', async () => {
		const flow = makeFlow();
		const start = makeDeferred();
		const callbacks = {
			startTimer: vi.fn(() => start.promise),
			stopTimer: vi.fn(async () => {}),
			resetTimer: vi.fn(async () => {}),
		};
		const { timer, timerBtn } = makeRealTimer(callbacks);
		const { coordinator, recorder } = makeCoordinator(flow, timer);
		const staleStart = coordinator.startRun();
		await vi.waitFor(() => expect(callbacks.startTimer).toHaveBeenCalledTimes(1));
		coordinator.resetAll();
		flow.cancel();
		flow.startBrew();
		flow.selectMethod('filter', 'hot');
		flow.selectBean(bean);
		flow.updateVariables({ grindSize: 20, dose: 15, waterTemp: 92 });
		flow.startBrewing();
		coordinator.handleScaleButton({ type: 'timer_start' });
		start.resolve();
		await expect(staleStart).resolves.toBe(false);
		await vi.waitFor(() => expect(flow.brewingStarted).toBe(true));
		expect(coordinator.isScaleModeRun()).toBe(true);
		expect(recorder.isRecording).toBe(true);
		expect(timerBtn.textContent).toBe('\u23F9');
	});

	it('serializes a pending real timer finish before reset cleanup', async () => {
		const flow = makeFlow();
		const stop = makeDeferred();
		const callbacks = {
			startTimer: vi.fn(async () => {}),
			stopTimer: vi.fn(() => stop.promise),
			resetTimer: vi.fn(async () => {}),
		};
		const { timer, timerEl, timerBtn } = makeRealTimer(callbacks);
		const { coordinator } = makeCoordinator(flow, timer);
		await coordinator.startRun();
		const pending = coordinator.finishRun();
		await vi.waitFor(() => expect(callbacks.stopTimer).toHaveBeenCalledTimes(1));
		coordinator.resetAll();
		expect(callbacks.resetTimer).toHaveBeenCalledTimes(1);
		stop.resolve();
		await expect(pending).resolves.toBe(false);
		await vi.waitFor(() => expect(callbacks.resetTimer).toHaveBeenCalledTimes(2));
		expect(timer.getElapsedSeconds()).toBe(0);
		expect(timerEl.textContent).toBe('0:00');
		expect(timerBtn.textContent).toBe('\u23FB');
	});

	it('does not let a stale rejected real timer finish reset a newer run', async () => {
		const flow = makeFlow();
		const stop = makeDeferred();
		const callbacks = {
			startTimer: vi.fn(async () => {}),
			stopTimer: vi.fn(() => stop.promise),
			resetTimer: vi.fn(async () => {}),
		};
		const { timer, timerBtn } = makeRealTimer(callbacks);
		const { coordinator } = makeCoordinator(flow, timer);
		await coordinator.startRun();
		const staleFinish = coordinator.finishRun();
		await vi.waitFor(() => expect(callbacks.stopTimer).toHaveBeenCalledTimes(1));
		coordinator.resetAll();
		flow.cancel();
		flow.startBrew();
		flow.selectMethod('filter', 'hot');
		flow.selectBean(bean);
		flow.updateVariables({ grindSize: 20, dose: 15, waterTemp: 92 });
		flow.startBrewing();
		const nextStart = coordinator.startRun();
		stop.reject(new Error('ble'));
		await expect(staleFinish).resolves.toBe(false);
		await expect(nextStart).resolves.toBe(true);
		expect(timerBtn.textContent).toBe('\u23F9');
	});

	it('ignores cancellation while finish is pending', async () => {
		const flow = makeFlow();
		const timer = makeTimer(80);
		const freeze = makeDeferred();
		timer.freeze.mockImplementationOnce(() => freeze.promise);
		const { coordinator } = makeCoordinator(flow, timer);
		await coordinator.startRun();
		const pending = coordinator.finishRun();
		await vi.waitFor(() => expect(timer.freeze).toHaveBeenCalledTimes(1));
		await coordinator.cancelRun();
		expect(flow.brewingStarted).toBe(true);
		expect(timer.cancelRun).not.toHaveBeenCalled();
		freeze.resolve();
		await expect(pending).resolves.toBe(true);
		expect(flow.step).toBe('saving');
	});

	it('ignores conversion while finish is pending', async () => {
		const flow = makeFlow();
		const timer = makeTimer(80);
		const freeze = makeDeferred();
		timer.freeze.mockImplementationOnce(() => freeze.promise);
		const { coordinator, recorder, setScaleState } = makeCoordinator(flow, timer);
		await coordinator.startRun();
		recorder.record(20);
		setScaleState('disconnected');
		coordinator.handleScaleState('disconnected');
		const pending = coordinator.finishRun();
		await vi.waitFor(() => expect(timer.freeze).toHaveBeenCalledTimes(1));
		coordinator.convertToManual();
		expect(recorder.getPoints()).toHaveLength(1);
		expect(coordinator.isLinkLost()).toBe(true);
		freeze.resolve();
		await expect(pending).resolves.toBe(true);
	});

	it('resets recorder and timer through the connected cancel path', async () => {
		const flow = makeFlow();
		const timer = makeTimer();
		const { coordinator, recorder } = makeCoordinator(flow, timer);
		await coordinator.startRun();
		recorder.record(10);
		coordinator.resetAll();
		expect(recorder.getPoints()).toHaveLength(0);
		await vi.waitFor(() => expect(timer.cancelRun).toHaveBeenCalled());
	});

	it('resets the timer locally when disconnected', async () => {
		const flow = makeFlow();
		const timer = makeTimer();
		const { coordinator } = makeCoordinator(flow, timer, 'idle');
		coordinator.resetAll();
		await vi.waitFor(() => expect(timer.resetToIdle).toHaveBeenCalled());
	});
});
