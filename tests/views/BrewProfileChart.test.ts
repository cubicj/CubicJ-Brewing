// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createContainer, installPolyfills } from '../helpers/obsidian-dom-polyfill';

vi.mock('../../src/i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

import { BrewProfileChart } from '../../src/views/BrewProfileChart';

const rects: number[][] = [];
const frames: { id: number; callback: FrameRequestCallback }[] = [];
let nextFrameId = 0;

function flushFrames(): void {
	const pending = frames.splice(0);
	for (const { callback } of pending) callback(performance.now());
}

function stubContext(): CanvasRenderingContext2D {
	const noop = () => {};
	return {
		clearRect: noop,
		fillRect: (x: number, y: number, w: number, h: number) => {
			rects.push([x, y, w, h]);
		},
		save: noop,
		restore: noop,
		beginPath: noop,
		closePath: noop,
		rect: noop,
		clip: noop,
		moveTo: noop,
		lineTo: noop,
		stroke: noop,
		arc: noop,
		fill: noop,
		setLineDash: noop,
		fillText: noop,
		measureText: () => ({ width: 10 }) as TextMetrics,
		fillStyle: '',
		strokeStyle: '',
		lineWidth: 1,
		lineJoin: 'miter',
		globalAlpha: 1,
		font: '',
		textAlign: 'start',
	} as unknown as CanvasRenderingContext2D;
}

const points = Array.from({ length: 601 }, (_, index) => ({ t: index / 10, w: index / 10 }));

describe('BrewProfileChart', () => {
	beforeAll(() => {
		installPolyfills();
		globalThis.ResizeObserver = class {
			observe() {}
			disconnect() {}
			unobserve() {}
		} as unknown as typeof ResizeObserver;
		HTMLCanvasElement.prototype.getContext = (() => stubContext()) as never;
		Object.defineProperty(globalThis, 'devicePixelRatio', { value: 1, configurable: true });
		window.requestAnimationFrame = (callback: FrameRequestCallback) => {
			const id = ++nextFrameId;
			frames.push({ id, callback });
			return id;
		};
		window.cancelAnimationFrame = (id: number) => {
			const index = frames.findIndex((frame) => frame.id === id);
			if (index !== -1) frames.splice(index, 1);
		};
	});

	beforeEach(() => {
		rects.length = 0;
		frames.length = 0;
		nextFrameId = 0;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('anchors the axis strips to the scrolled window of a scrollable chart', () => {
		const container = createContainer();
		Object.defineProperty(container, 'clientWidth', { value: 300, configurable: true });
		const chart = new BrewProfileChart(container, 200, 10, true);
		chart.renderStatic(points);

		rects.length = 0;
		Object.defineProperty(container, 'scrollLeft', { value: 120, configurable: true, writable: true });
		container.dispatchEvent(new Event('scroll'));
		flushFrames();

		expect(rects).toContainEqual([120, 12, 40, 160]);
		expect(rects).toContainEqual([120 + 300 - 36, 12, 36, 160]);
		chart.destroy();
	});

	it('coalesces scroll events into one frame and renders again on the next scroll', () => {
		const container = createContainer();
		Object.defineProperty(container, 'clientWidth', { value: 300, configurable: true });
		const chart = new BrewProfileChart(container, 200, 10, true);
		chart.renderStatic(points);

		rects.length = 0;
		Object.defineProperty(container, 'scrollLeft', { value: 120, configurable: true, writable: true });
		container.dispatchEvent(new Event('scroll'));
		container.dispatchEvent(new Event('scroll'));

		expect(rects).toEqual([]);
		expect(frames).toHaveLength(1);
		flushFrames();
		expect(rects.filter(([x, y, w, h]) => x === 120 && y === 12 && w === 40 && h === 160)).toHaveLength(1);

		Object.defineProperty(container, 'scrollLeft', { value: 200, configurable: true, writable: true });
		container.dispatchEvent(new Event('scroll'));
		flushFrames();

		expect(rects).toContainEqual([200, 12, 40, 160]);
		chart.destroy();
	});

	it('shares one pending frame between crosshair movement and scrolling', () => {
		const container = createContainer();
		Object.defineProperty(container, 'clientWidth', { value: 300, configurable: true });
		const chart = new BrewProfileChart(container, 200, 10, true);
		chart.renderStatic(points);
		const canvas = container.querySelector('canvas')!;
		vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 700, 200));

		rects.length = 0;
		Object.defineProperty(container, 'scrollLeft', { value: 120, configurable: true, writable: true });
		canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 }));
		expect(frames).toHaveLength(1);
		container.dispatchEvent(new Event('scroll'));
		expect(frames).toHaveLength(1);
		expect(rects).toEqual([]);
		flushFrames();
		expect(rects.filter(([x, y, w, h]) => x === 120 && y === 12 && w === 40 && h === 160)).toHaveLength(1);
		expect(frames).toHaveLength(0);

		rects.length = 0;
		container.dispatchEvent(new Event('scroll'));
		canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 }));
		expect(frames).toHaveLength(1);
		flushFrames();
		expect(rects.filter(([x, y, w, h]) => x === 120 && y === 12 && w === 40 && h === 160)).toHaveLength(1);
		chart.destroy();
	});

	it('cancels a pending frame on destroy', () => {
		const container = createContainer();
		Object.defineProperty(container, 'clientWidth', { value: 300, configurable: true });
		const chart = new BrewProfileChart(container, 200, 10, true);
		chart.renderStatic(points);
		Object.defineProperty(container, 'scrollLeft', { value: 120, configurable: true, writable: true });
		container.dispatchEvent(new Event('scroll'));
		expect(frames).toHaveLength(1);

		rects.length = 0;
		chart.destroy();
		expect(frames).toHaveLength(0);
		flushFrames();

		expect(rects).toEqual([]);
	});

	it('anchors the axis strips to the canvas edges of a non-scrollable chart', () => {
		const container = createContainer();
		const chart = new BrewProfileChart(container, 200);
		const canvas = container.querySelector('canvas')!;
		canvas.width = 400;
		chart.renderStatic(points);

		expect(rects).toContainEqual([0, 12, 40, 160]);
		expect(rects).toContainEqual([400 - 36, 12, 36, 160]);
		chart.destroy();
	});
});
