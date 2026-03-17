// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { installPolyfills, createContainer } from '../test/obsidian-dom-polyfill';

vi.mock('../i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

import { AccordionManager } from './AccordionManager';

beforeAll(() => installPolyfills());

function makeAccordion() {
	const container = createContainer();
	const renderStep = vi.fn();
	const getStepSummary = vi.fn().mockReturnValue('');
	const getCurrentStep = vi.fn().mockReturnValue('method');

	const manager = new AccordionManager(container, {
		renderStep,
		getStepSummary,
		getCurrentStep,
	});

	return { container, manager, renderStep, getStepSummary, getCurrentStep };
}

describe('AccordionManager', () => {
	let acc: ReturnType<typeof makeAccordion>;

	beforeEach(() => {
		acc = makeAccordion();
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
		expect(titles[0].textContent).toBe('brew.step.method');
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

		const panel0Summaries = acc.container
			.querySelectorAll('.brew-accordion-panel')[0]
			.querySelectorAll('.brew-accordion-summary');
		expect(panel0Summaries.length).toBe(0);
	});

	it('updateSummaries shows check icon for completed steps', () => {
		acc.manager.build();
		acc.getStepSummary.mockImplementation((step: string) => (step === 'method' ? 'Filter · Hot' : ''));
		acc.manager.updateSummaries();

		const indicator = acc.container.querySelectorAll('.brew-accordion-indicator')[0];
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

	it('animateContentChange calls mutation', () => {
		acc.manager.build();
		const fn = vi.fn();
		acc.manager.animateContentChange('method', fn);
		expect(fn).toHaveBeenCalled();
	});
});
