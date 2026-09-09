import { describe, it, expect } from 'vitest';
import { niceStep, filterVisible, interpolateWeight, flowRateAt, flowSeries } from '../../src/views/chartMath';
import type { BrewProfilePoint } from '../../src/brew/types';

const pt = (t: number, w: number): BrewProfilePoint => ({ t, w });

describe('niceStep', () => {
	it('returns 5 for max=20 targetLines=4', () => {
		expect(niceStep(20, 4)).toBe(5);
	});

	it('returns 10 for max=40 targetLines=4', () => {
		expect(niceStep(40, 4)).toBe(10);
	});

	it('returns 50 for max=200 targetLines=4', () => {
		expect(niceStep(200, 4)).toBe(50);
	});

	it('returns 100 for max=350 targetLines=4', () => {
		expect(niceStep(350, 4)).toBe(100);
	});

	it('returns 0.5 for max=2 targetLines=4', () => {
		expect(niceStep(2, 4)).toBe(0.5);
	});

	it('returns 2 for max=7 targetLines=4', () => {
		expect(niceStep(7, 4)).toBe(2);
	});
});

describe('filterVisible', () => {
	const points = [pt(0, 0), pt(5, 10), pt(10, 20), pt(15, 30), pt(20, 40)];

	it('returns all points when window covers entire range', () => {
		expect(filterVisible(points, 0, 20)).toEqual(points);
	});

	it('includes one point before visible window for line continuity', () => {
		const result = filterVisible(points, 10, 20);
		expect(result[0].t).toBe(5);
	});

	it('includes one point after visible window for line continuity', () => {
		const result = filterVisible(points, 0, 10);
		expect(result[result.length - 1].t).toBe(15);
	});

	it('returns subset for middle window', () => {
		const result = filterVisible(points, 6, 14);
		expect(result.map((p) => p.t)).toEqual([5, 10, 15]);
	});

	it('handles empty array', () => {
		expect(filterVisible([], 0, 10)).toEqual([]);
	});

	it('returns only the nearest point when window is after all points', () => {
		expect(filterVisible(points, 30, 40)).toEqual([pt(20, 40)]);
	});

	it('returns only the nearest point when window is before all points', () => {
		expect(filterVisible(points, -20, -10)).toEqual([pt(0, 0)]);
	});

	it('handles single point', () => {
		expect(filterVisible([pt(5, 10)], 0, 10)).toEqual([pt(5, 10)]);
	});
});

describe('interpolateWeight', () => {
	const trend = [pt(0, 0), pt(10, 100), pt(20, 200)];

	it('returns exact weight at data point', () => {
		expect(interpolateWeight(trend, 10)).toBe(100);
	});

	it('interpolates between two points', () => {
		expect(interpolateWeight(trend, 5)).toBe(50);
	});

	it('clamps to first weight before range', () => {
		expect(interpolateWeight(trend, -5)).toBe(0);
	});

	it('clamps to last weight after range', () => {
		expect(interpolateWeight(trend, 25)).toBe(200);
	});

	it('interpolates at 75% between points', () => {
		expect(interpolateWeight(trend, 15)).toBe(150);
	});

	it('returns 0 for empty array', () => {
		expect(interpolateWeight([], 5)).toBe(0);
	});
});

describe('flowRateAt', () => {
	const trend = [pt(0, 0), pt(10, 100), pt(20, 200)];

	it('returns slope on linear data', () => {
		expect(flowRateAt(trend, 5)).toBeCloseTo(10);
	});

	it('clamps window at the start edge', () => {
		expect(flowRateAt(trend, 0)).toBeCloseTo(10);
	});

	it('clamps window at the end edge', () => {
		expect(flowRateAt(trend, 20)).toBeCloseTo(10);
	});

	it('clamps negative slope to 0 on decreasing data', () => {
		const falling = [pt(0, 100), pt(10, 0)];
		expect(flowRateAt(falling, 5)).toBe(0);
	});

	it('returns undefined for fewer than 2 points', () => {
		expect(flowRateAt([], 5)).toBeUndefined();
		expect(flowRateAt([pt(5, 10)], 5)).toBeUndefined();
	});

	it('returns undefined when window falls outside data', () => {
		expect(flowRateAt(trend, 30)).toBeUndefined();
	});
});

describe('flowSeries', () => {
	const linear = [
		{ t: 0, w: 0 },
		{ t: 1, w: 2 },
		{ t: 2, w: 4 },
		{ t: 3, w: 6 },
		{ t: 4, w: 8 },
	];

	it('returns one point per trend point with the slope on linear data', () => {
		const series = flowSeries(linear);
		expect(series.map((p) => p.t)).toEqual([0, 1, 2, 3, 4]);
		for (const p of series) expect(p.w).toBeCloseTo(2, 9);
	});

	it('matches flowRateAt at every trend timestamp on noisy data', () => {
		const trend: BrewProfilePoint[] = [];
		for (let i = 0; i < 200; i++) {
			const t = i * 0.1;
			trend.push({ t, w: 3 * t + 2 * Math.sin(t * 1.7) + (i % 7) * 0.05 });
		}
		const series = flowSeries(trend);
		expect(series.length).toBe(trend.length);
		series.forEach((p, i) => {
			expect(p.t).toBe(trend[i].t);
			expect(p.w).toBeCloseTo(flowRateAt(trend, trend[i].t)!, 9);
		});
	});

	it('clamps negative slopes to 0', () => {
		const series = flowSeries([
			{ t: 0, w: 10 },
			{ t: 1, w: 8 },
			{ t: 2, w: 6 },
		]);
		expect(series.map((p) => p.w)).toEqual([0, 0, 0]);
	});

	it('returns an empty series for fewer than 2 points', () => {
		expect(flowSeries([])).toEqual([]);
		expect(flowSeries([{ t: 0, w: 1 }])).toEqual([]);
	});

	it('omits points whose clamped window is degenerate', () => {
		const series = flowSeries(
			[
				{ t: 0, w: 0 },
				{ t: 0, w: 0 },
			],
			1,
		);
		expect(series).toEqual([]);
	});

	it('matches flowRateAt with duplicate final timestamps and the default window', () => {
		const trend = [
			{ t: 0, w: 0 },
			{ t: 1, w: 1 },
			{ t: 1, w: 3 },
		];
		const series = flowSeries(trend);
		expect(series).toEqual(trend.map((p) => ({ t: p.t, w: flowRateAt(trend, p.t) })));
		expect(series.map((p) => p.w)).toEqual([3, 3, 3]);
	});

	it('matches flowRateAt with duplicate final timestamps and an oversized window', () => {
		const trend = [
			{ t: 0, w: 0 },
			{ t: 1, w: 1 },
			{ t: 1, w: 3 },
		];
		const series = flowSeries(trend, 5);
		expect(series).toEqual(trend.map((p) => ({ t: p.t, w: flowRateAt(trend, p.t, 5) })));
		expect(series.map((p) => p.w)).toEqual([3, 3, 3]);
	});

	it('matches flowRateAt with duplicate first timestamps and the default window', () => {
		const trend = [
			{ t: 0, w: 5 },
			{ t: 0, w: 0 },
			{ t: 1, w: 2 },
		];
		const series = flowSeries(trend);
		expect(series).toEqual(trend.map((p) => ({ t: p.t, w: flowRateAt(trend, p.t) })));
		expect(series.map((p) => p.w)).toEqual([0, 0, 0]);
	});
});
