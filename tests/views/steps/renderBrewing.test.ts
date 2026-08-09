// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

function makeContext(brewingStarted: boolean, points: BrewProfilePoint[]) {
	const cleanups: Array<() => void> = [];
	const recorder = {
		getPoints: vi.fn(() => points),
		start: vi.fn(),
		stop: vi.fn(),
	};
	const ctx = {
		flowState: {
			selection: { method: 'filter' },
			finishBrewing: vi.fn(),
		},
		plugin: {
			acaiaService: { state: 'connected' },
			app: {},
		},
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
		},
		getWeightText: vi.fn(() => '0'),
		recorder,
		brewingStarted,
		registerCleanup: (fn: () => void) => cleanups.push(fn),
	} as unknown as StepRenderContext;

	return { ctx, cleanups, recorder };
}

describe('renderBrewing chart cleanup', () => {
	it('registers destruction for a live chart', () => {
		const points = [{ t: 0, w: 0 }];
		const { ctx, cleanups, recorder } = makeContext(true, points);

		renderBrewing(createContainer(), ctx);

		expect(chartMocks.instances).toHaveLength(1);
		expect(chartMocks.instances[0].startLive).toHaveBeenCalledWith(recorder);
		expect(cleanups).toHaveLength(1);
		cleanups[0]();
		expect(chartMocks.instances[0].destroy).toHaveBeenCalledTimes(1);
	});

	it('registers destruction for a static chart', () => {
		const points = [{ t: 0, w: 0 }];
		const { ctx, cleanups } = makeContext(false, points);

		renderBrewing(createContainer(), ctx);

		expect(chartMocks.instances).toHaveLength(1);
		expect(chartMocks.instances[0].renderStatic).toHaveBeenCalledWith(points);
		expect(cleanups).toHaveLength(1);
		cleanups[0]();
		expect(chartMocks.instances[0].destroy).toHaveBeenCalledTimes(1);
	});
});
