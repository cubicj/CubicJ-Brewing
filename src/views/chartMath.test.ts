import { describe, it, expect } from 'vitest';
import { niceStep, filterVisible, interpolateWeight } from './chartMath';
import type { BrewProfilePoint } from '../brew/types';

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
