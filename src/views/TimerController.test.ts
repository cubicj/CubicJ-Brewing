// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimerController, formatTimer } from './TimerController';

function makeController() {
	const timerEl = document.createElement('div');
	timerEl.textContent = '0:00';
	const timerBtn = document.createElement('button');
	timerBtn.textContent = '\u23FB';

	const startTimer = vi.fn().mockResolvedValue(undefined);
	const stopTimer = vi.fn().mockResolvedValue(undefined);
	const resetTimer = vi.fn().mockResolvedValue(undefined);

	const controller = new TimerController({ timerEl, timerBtn }, { startTimer, stopTimer, resetTimer });

	return { controller, timerEl, timerBtn, startTimer, stopTimer, resetTimer };
}

describe('formatTimer', () => {
	it('formats 0 seconds', () => expect(formatTimer(0)).toBe('0:00'));
	it('formats 59 seconds', () => expect(formatTimer(59)).toBe('0:59'));
	it('formats 60 seconds', () => expect(formatTimer(60)).toBe('1:00'));
	it('formats 125 seconds', () => expect(formatTimer(125)).toBe('2:05'));
	it('floors fractional seconds', () => expect(formatTimer(61.9)).toBe('1:01'));
});

describe('TimerController', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('starts in idle state', () => {
		const { controller } = makeController();
		expect(controller.getElapsedSeconds()).toBe(0);
	});

	it('idle → running on first click', async () => {
		const { controller, timerBtn, resetTimer, startTimer } = makeController();
		await controller.handleTimerClick();
		expect(resetTimer).toHaveBeenCalled();
		expect(startTimer).toHaveBeenCalled();
		expect(timerBtn.textContent).toBe('\u23F9');
	});

	it('running → stopped on second click', async () => {
		const { controller, timerBtn, stopTimer } = makeController();
		await controller.handleTimerClick();

		vi.advanceTimersByTime(5000);
		await controller.handleTimerClick();

		expect(stopTimer).toHaveBeenCalled();
		expect(timerBtn.textContent).toBe('\u21BA');
		expect(controller.getElapsedSeconds()).toBeCloseTo(5, 0);
	});

	it('stopped → idle on third click', async () => {
		const { controller, timerEl, timerBtn, resetTimer } = makeController();
		await controller.handleTimerClick();
		vi.advanceTimersByTime(3000);
		await controller.handleTimerClick();
		await controller.handleTimerClick();

		expect(resetTimer).toHaveBeenCalledTimes(2);
		expect(timerEl.textContent).toBe('0:00');
		expect(timerBtn.textContent).toBe('\u23FB');
		expect(controller.getElapsedSeconds()).toBe(0);
	});

	it('freeze stops a running timer', async () => {
		const { controller, timerBtn, stopTimer } = makeController();
		await controller.handleTimerClick();
		vi.advanceTimersByTime(2000);

		await controller.freeze();
		expect(stopTimer).toHaveBeenCalled();
		expect(timerBtn.textContent).toBe('\u21BA');
		expect(controller.getElapsedSeconds()).toBeCloseTo(2, 0);
	});

	it('freeze does nothing when idle', async () => {
		const { controller, stopTimer } = makeController();
		await controller.freeze();
		expect(stopTimer).not.toHaveBeenCalled();
	});

	it('resetToIdle clears everything', async () => {
		const { controller, timerEl, timerBtn } = makeController();
		await controller.handleTimerClick();
		vi.advanceTimersByTime(5000);

		controller.resetToIdle();
		expect(controller.getElapsedSeconds()).toBe(0);
		expect(timerEl.textContent).toBe('0:00');
		expect(timerBtn.textContent).toBe('\u23FB');
	});

	it('handleScaleButton timer_start starts timer', () => {
		const { controller, timerBtn } = makeController();
		controller.handleScaleButton({ type: 'timer_start' });
		expect(timerBtn.textContent).toBe('\u23F9');
		vi.advanceTimersByTime(3000);
		expect(controller.getElapsedSeconds()).toBeCloseTo(3, 0);
	});

	it('handleScaleButton timer_stop stops timer', () => {
		const { controller, timerBtn } = makeController();
		controller.handleScaleButton({ type: 'timer_start' });
		vi.advanceTimersByTime(4000);
		controller.handleScaleButton({ type: 'timer_stop' });
		expect(timerBtn.textContent).toBe('\u21BA');
		expect(controller.getElapsedSeconds()).toBeCloseTo(4, 0);
	});

	it('handleScaleButton timer_reset resets', () => {
		const { controller, timerEl } = makeController();
		controller.handleScaleButton({ type: 'timer_start' });
		vi.advanceTimersByTime(2000);
		controller.handleScaleButton({ type: 'timer_reset' });
		expect(controller.getElapsedSeconds()).toBe(0);
		expect(timerEl.textContent).toBe('0:00');
	});

	it('handleScaleTimer syncs running timer offset', async () => {
		const { controller } = makeController();
		await controller.handleTimerClick();
		controller.handleScaleTimer(10);
		expect(controller.getElapsedSeconds()).toBeCloseTo(10, 0);
	});

	it('handleScaleTimer resets stopped timer when seconds=0', async () => {
		const { controller, timerEl } = makeController();
		await controller.handleTimerClick();
		vi.advanceTimersByTime(5000);
		await controller.handleTimerClick();
		controller.handleScaleTimer(0);
		expect(controller.getElapsedSeconds()).toBe(0);
		expect(timerEl.textContent).toBe('0:00');
	});

	it('destroy cleans up interval', async () => {
		const { controller } = makeController();
		await controller.handleTimerClick();
		controller.destroy();
		const before = controller.getElapsedSeconds();
		vi.advanceTimersByTime(5000);
		expect(controller.getElapsedSeconds()).toBeCloseTo(before + 5, 0);
	});
});
