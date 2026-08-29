// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { installPolyfills, createContainer } from '../helpers/obsidian-dom-polyfill';
import type { PanelMode } from '../../src/brew/BrewFlowState';
import type { FlowStep } from '../../src/views/StepRenderers';

vi.mock('../../src/i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

import { AccordionManager } from '../../src/views/AccordionManager';

beforeAll(() => installPolyfills());

function makeAccordion() {
	const container = createContainer();
	const renderStep = vi.fn();
	const getStepSummary = vi.fn().mockReturnValue('');
	const getPanelMode = vi.fn().mockReturnValue('editable' as const);
	const getDisabledHint = vi.fn().mockReturnValue('hint text');

	const manager = new AccordionManager(container, {
		renderStep,
		getStepSummary,
		getPanelMode,
		getDisabledHint,
	});

	return { container, manager, renderStep, getStepSummary, getPanelMode, getDisabledHint };
}

function installAnimationFrameQueue() {
	let nextId = 1;
	const callbacks = new Map<number, FrameRequestCallback>();
	const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
		const id = nextId++;
		callbacks.set(id, callback);
		return id;
	});
	const cancelAnimationFrame = vi.fn((id: number) => {
		callbacks.delete(id);
	});
	const runFrame = (timestamp: number) => {
		const entry = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
		if (!entry) throw new Error('No animation frame queued');
		const [id, callback] = entry;
		callbacks.delete(id);
		callback(timestamp);
	};

	vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
	vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);

	return { requestAnimationFrame, cancelAnimationFrame, runFrame };
}

describe('AccordionManager', () => {
	let acc: ReturnType<typeof makeAccordion>;

	beforeEach(() => {
		acc = makeAccordion();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('isBuilt returns false before build', () => {
		expect(acc.manager.isBuilt()).toBe(false);
	});

	it('build creates 5 panels', () => {
		acc.manager.build();
		expect(acc.manager.isBuilt()).toBe(true);
		const panels = acc.container.querySelectorAll('.brew-accordion-panel');
		expect(panels.length).toBe(5);
	});

	it('panels have numbered indicators', () => {
		acc.manager.build();
		const indicators = acc.container.querySelectorAll('.brew-accordion-indicator');
		const numbers = Array.from(indicators).map((el) => el.textContent);
		expect(numbers).toEqual(['1', '2', '3', '4', '5']);
	});

	it('panels have title text', () => {
		acc.manager.build();
		const titles = acc.container.querySelectorAll('.brew-accordion-title');
		expect(titles.length).toBe(5);
		expect(Array.from(titles).map((title) => title.textContent)).toEqual([
			'brew.step.bean',
			'brew.step.method',
			'brew.step.variables',
			'brew.step.brewing',
			'brew.step.memo',
		]);
	});

	it('no panels expanded initially after build + update', () => {
		acc.manager.build();
		acc.manager.update();
		const openBodies = acc.container.querySelectorAll('.brew-accordion-body.is-open');
		expect(openBodies.length).toBe(0);
	});

	it('togglePanel expands a panel', () => {
		acc.manager.build();
		acc.manager.togglePanel(0);
		const body = acc.container.querySelectorAll('.brew-accordion-body')[0];
		expect(body.classList.contains('is-open')).toBe(true);
		expect(acc.renderStep).toHaveBeenCalled();
	});

	it('togglePanel twice collapses a panel', () => {
		acc.manager.build();
		acc.manager.togglePanel(0);
		acc.manager.togglePanel(0);
		expect(acc.renderStep).toHaveBeenCalled();
	});

	it('runs a panel cleanup before re-rendering that panel', () => {
		const cleanup = vi.fn();
		let marker: HTMLElement | null = null;
		acc.renderStep.mockImplementationOnce(
			(_step: FlowStep, container: HTMLElement, registerCleanup: (fn: () => void) => void) => {
				marker = container.createDiv();
				const body = container.closest('.brew-accordion-body') as HTMLElement;
				registerCleanup(() => {
					expect(body.contains(marker)).toBe(true);
					cleanup();
				});
			},
		);
		acc.manager.build();
		acc.manager.togglePanel(0);

		acc.manager.update();

		expect(cleanup).toHaveBeenCalledTimes(1);
		const body = acc.container.querySelector('.brew-accordion-body') as HTMLElement;
		expect(body.contains(marker)).toBe(false);
		acc.manager.destroy();
		expect(cleanup).toHaveBeenCalledTimes(1);
	});

	it('runs a panel cleanup before collapse empties its body', () => {
		const cleanup = vi.fn();
		let marker: HTMLElement | null = null;
		acc.renderStep.mockImplementationOnce(
			(_step: FlowStep, container: HTMLElement, registerCleanup: (fn: () => void) => void) => {
				marker = container.createDiv();
				const body = container.closest('.brew-accordion-body') as HTMLElement;
				registerCleanup(() => {
					expect(body.contains(marker)).toBe(true);
					cleanup();
				});
			},
		);
		acc.manager.build();
		acc.manager.togglePanel(0);
		acc.manager.togglePanel(0);
		const body = acc.container.querySelector('.brew-accordion-body') as HTMLElement;
		const transitionEnd = new Event('transitionend') as TransitionEvent;
		Object.defineProperty(transitionEnd, 'propertyName', { value: 'max-height' });

		body.dispatchEvent(transitionEnd);
		body.dispatchEvent(transitionEnd);

		expect(cleanup).toHaveBeenCalledTimes(1);
		expect(body.contains(marker)).toBe(false);
	});

	it('runs every current panel cleanup before build replaces the accordion', () => {
		const cleanups: Array<ReturnType<typeof vi.fn>> = [];
		acc.renderStep.mockImplementation(
			(_step: FlowStep, container: HTMLElement, registerCleanup: (fn: () => void) => void) => {
				const marker = container.createDiv();
				const cleanup = vi.fn(() => {
					expect(acc.container.contains(marker)).toBe(true);
				});
				cleanups.push(cleanup);
				registerCleanup(cleanup);
			},
		);
		acc.manager.build();
		acc.manager.togglePanel(0);
		acc.manager.togglePanel(1);

		acc.manager.build();

		expect(cleanups).toHaveLength(3);
		for (const cleanup of cleanups) expect(cleanup).toHaveBeenCalledTimes(1);
	});

	it('destroy runs every panel cleanup exactly once', () => {
		const cleanups: Array<ReturnType<typeof vi.fn>> = [];
		acc.renderStep.mockImplementation(
			(_step: FlowStep, _container: HTMLElement, registerCleanup: (fn: () => void) => void) => {
				const cleanup = vi.fn();
				cleanups.push(cleanup);
				registerCleanup(cleanup);
			},
		);
		acc.manager.build();
		acc.manager.togglePanel(0);
		acc.manager.togglePanel(1);

		acc.manager.destroy();
		acc.manager.destroy();

		expect(cleanups).toHaveLength(3);
		for (const cleanup of cleanups) expect(cleanup).toHaveBeenCalledTimes(1);
	});

	it('focusStep clears and expands only target', () => {
		acc.manager.build();
		acc.manager.togglePanel(0);
		acc.manager.focusStep('configure');
		acc.manager.update();

		const bodies = acc.container.querySelectorAll('.brew-accordion-body');
		expect(bodies[2].classList.contains('is-open')).toBe(true);
	});

	it('expandStep adds without clearing', () => {
		acc.manager.build();
		acc.manager.focusStep('method');
		acc.manager.expandStep('bean');
		acc.manager.update();

		const bodies = acc.container.querySelectorAll('.brew-accordion-body');
		expect(bodies[0].classList.contains('is-open')).toBe(true);
		expect(bodies[1].classList.contains('is-open')).toBe(true);
	});

	it('scrollStepToTop aligns the target panel with the container top', () => {
		const animation = installAnimationFrameQueue();
		acc.manager.build();
		const panel = acc.container.querySelectorAll('.brew-accordion-panel')[3] as HTMLElement;
		acc.container.scrollTop = 40;
		Object.defineProperty(acc.container, 'scrollHeight', { configurable: true, value: 300 });
		Object.defineProperty(acc.container, 'clientHeight', { configurable: true, value: 100 });
		vi.spyOn(acc.container, 'getBoundingClientRect').mockReturnValue({ top: 30 } as DOMRect);
		vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ top: 180 } as DOMRect);

		acc.manager.scrollStepToTop('brewing');
		expect(animation.requestAnimationFrame).toHaveBeenCalledTimes(1);

		animation.runFrame(1000);
		animation.runFrame(1250);
		animation.runFrame(1500);

		expect(acc.container.scrollTop).toBe(190);
	});

	it('scrollStepToTop cancels an in-flight animation before starting another', () => {
		const animation = installAnimationFrameQueue();
		acc.manager.build();
		const panel = acc.container.querySelectorAll('.brew-accordion-panel')[3] as HTMLElement;
		acc.container.scrollTop = 40;
		Object.defineProperty(acc.container, 'scrollHeight', { configurable: true, value: 300 });
		Object.defineProperty(acc.container, 'clientHeight', { configurable: true, value: 100 });
		vi.spyOn(acc.container, 'getBoundingClientRect').mockReturnValue({ top: 30 } as DOMRect);
		vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ top: 180 } as DOMRect);

		acc.manager.scrollStepToTop('brewing');
		acc.manager.scrollStepToTop('brewing');

		expect(animation.cancelAnimationFrame).toHaveBeenCalledWith(1);
	});

	it('clearExpandedSteps stops rendering new content', () => {
		acc.manager.build();
		acc.manager.togglePanel(0);
		acc.manager.togglePanel(1);
		const callsBefore = acc.renderStep.mock.calls.length;

		acc.manager.clearExpandedSteps();
		acc.manager.update();

		// After clear, no new renderStep calls for panels 0 and 1
		// (is-open removal relies on CSS transitionend which jsdom can't fire)
		const callsAfter = acc.renderStep.mock.calls.length;
		expect(callsAfter).toBe(callsBefore);
	});

	it('updateSummaries shows summary when data exists and panel collapsed', () => {
		acc.manager.build();
		acc.getStepSummary.mockImplementation((step: string) => (step === 'method' ? 'Filter · Hot' : ''));
		acc.manager.updateSummaries();

		const summaries = acc.container.querySelectorAll('.brew-accordion-summary');
		expect(summaries.length).toBe(1);
		expect(summaries[0].textContent).toBe('Filter · Hot');
	});

	it('updateSummaries hides summary when panel expanded', () => {
		acc.manager.build();
		acc.getStepSummary.mockReturnValue('Filter · Hot');
		acc.manager.focusStep('method');
		acc.manager.update();

		const methodSummaries = acc.container
			.querySelectorAll('.brew-accordion-panel')[1]
			.querySelectorAll('.brew-accordion-summary');
		expect(methodSummaries.length).toBe(0);
	});

	it('updateSummaries shows check icon for completed steps', () => {
		acc.manager.build();
		acc.getStepSummary.mockImplementation((step: string) => (step === 'method' ? 'Filter · Hot' : ''));
		acc.manager.updateSummaries();

		const indicator = acc.container.querySelectorAll('.brew-accordion-indicator')[1];
		expect(indicator.classList.contains('is-done')).toBe(true);
		expect(indicator.querySelector('svg')).not.toBeNull();
	});

	it('header click toggles panel', () => {
		acc.manager.build();
		const header = acc.container.querySelectorAll('.brew-accordion-header')[0] as HTMLElement;
		header.click();

		const body = acc.container.querySelectorAll('.brew-accordion-body')[0];
		expect(body.classList.contains('is-open')).toBe(true);
	});

	it('expands a disabled panel and renders the hint instead of step content', () => {
		acc.getPanelMode.mockImplementation((step) => (step === 'configure' ? 'disabled' : 'editable'));
		acc.manager.build();

		acc.manager.togglePanel(2);

		const body = acc.container.querySelectorAll('.brew-accordion-body')[2];
		expect(body.querySelector('.brew-accordion-hint')?.textContent).toBe('hint text');
		expect(acc.renderStep).not.toHaveBeenCalledWith('configure', expect.anything(), expect.anything());
	});

	it('keeps a disabled panel expanded across update()', () => {
		acc.getPanelMode.mockImplementation((step) => (step === 'configure' ? 'disabled' : 'editable'));
		acc.manager.build();

		acc.manager.togglePanel(2);
		acc.manager.update();

		const body = acc.container.querySelectorAll('.brew-accordion-body')[2];
		expect(body.classList.contains('is-open')).toBe(true);
	});

	it('replaces the hint with real content when the panel becomes enabled', () => {
		let mode: PanelMode = 'disabled';
		acc.getPanelMode.mockImplementation((step) => (step === 'configure' ? mode : 'editable'));
		acc.manager.build();

		acc.manager.togglePanel(2);
		mode = 'editable';
		acc.manager.update();

		const body = acc.container.querySelectorAll('.brew-accordion-body')[2];
		expect(body.querySelector('.brew-accordion-hint')).toBeNull();
		expect(acc.renderStep).toHaveBeenCalledWith('configure', expect.anything(), expect.anything());
	});

	it('marks disabled headers without affecting enabled headers', () => {
		acc.getPanelMode.mockImplementation((step) => (step === 'saving' ? 'disabled' : 'editable'));
		acc.manager.build();
		acc.manager.update();

		const headers = acc.container.querySelectorAll('.brew-accordion-header');
		expect(headers[4].classList.contains('is-disabled')).toBe(true);
		expect(headers[0].classList.contains('is-disabled')).toBe(false);
	});

	it('marks readonly body inners as inert without affecting editable panels', () => {
		const mgr = new AccordionManager(acc.container, {
			renderStep: () => {},
			getStepSummary: () => '',
			getPanelMode: (step) => (step === 'method' ? 'readonly' : 'editable'),
			getDisabledHint: () => 'hint text',
		});
		mgr.build();
		mgr.togglePanel(0);
		mgr.togglePanel(1);
		mgr.update();
		const inners = acc.container.querySelectorAll('.brew-accordion-body-inner');
		expect(inners[0].classList.contains('is-readonly')).toBe(false);
		expect(inners[0].hasAttribute('inert')).toBe(false);
		expect(inners[1].classList.contains('is-readonly')).toBe(true);
		expect(inners[1].hasAttribute('inert')).toBe(true);
	});

	it('animateContentChange calls mutation', () => {
		acc.manager.build();
		const fn = vi.fn();
		acc.manager.animateContentChange('method', fn);
		expect(fn).toHaveBeenCalled();
	});
});
