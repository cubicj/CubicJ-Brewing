// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform, type App } from 'obsidian';
import { createContainer, installPolyfills } from '../helpers/obsidian-dom-polyfill';

const chartMocks = vi.hoisted(() => ({
	instances: [] as Array<{
		renderStatic: ReturnType<typeof vi.fn>;
		destroy: ReturnType<typeof vi.fn>;
	}>,
}));

vi.mock('../../src/views/BrewProfileChart', () => ({
	BrewProfileChart: class {
		renderStatic = vi.fn();
		destroy = vi.fn();

		constructor() {
			chartMocks.instances.push(this);
		}
	},
}));

vi.mock('../../src/i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

import { BrewProfileModal } from '../../src/views/BrewProfileModal';

beforeAll(() => installPolyfills());

beforeEach(() => {
	chartMocks.instances.length = 0;
	Platform.isDesktop = true;
	Platform.isMobile = false;
});

function makeModal(): BrewProfileModal {
	const modal = new BrewProfileModal({} as App, 'Bean', {
		type: 'expand',
		points: [{ t: 0, w: 0 }],
	});
	const titleEl = createContainer();
	titleEl.setText = (text) => {
		titleEl.textContent = typeof text === 'string' ? text : text.textContent;
	};
	Object.defineProperty(modal, 'contentEl', { value: createContainer() });
	Object.defineProperty(modal, 'modalEl', { value: createContainer() });
	Object.defineProperty(modal, 'titleEl', { value: titleEl });
	return modal;
}

describe('BrewProfileModal chart cleanup', () => {
	it('destroys the current chart before replacing its content', async () => {
		const modal = makeModal();
		await modal.onOpen();
		const firstChart = chartMocks.instances[0];

		await modal.onOpen();

		expect(chartMocks.instances).toHaveLength(2);
		expect(firstChart.destroy).toHaveBeenCalledTimes(1);
	});

	it('destroys the current chart on close', async () => {
		const modal = makeModal();
		await modal.onOpen();
		const chart = chartMocks.instances[0];

		modal.onClose();

		expect(chart.destroy).toHaveBeenCalledTimes(1);
	});
});
