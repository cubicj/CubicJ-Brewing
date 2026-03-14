import { describe, it, expect } from 'vitest';
import { estimateYield } from './yieldEstimator';
import type { BrewProfilePoint } from './types';

function pts(data: [number, number][]): BrewProfilePoint[] {
	return data.map(([t, w]) => ({ t, w }));
}

describe('estimateYield', () => {
	it('returns undefined for empty points', () => {
		expect(estimateYield([])).toBeUndefined();
	});

	it('returns undefined for duration < 2s', () => {
		expect(
			estimateYield(
				pts([
					[0, 100],
					[1, 101],
				]),
			),
		).toBeUndefined();
	});

	it('detects stable yield in normal brew', () => {
		const points = pts([
			[0, 0],
			[5, 50],
			[10, 100],
			[15, 150],
			[20, 200],
			[25, 200.3],
			[26, 200.1],
			[27, 200.5],
			[28, 200.2],
			[29, 200.4],
			[30, 200.1],
		]);
		const result = estimateYield(points)!;
		expect(result).toBeGreaterThanOrEqual(199);
		expect(result).toBeLessThanOrEqual(201);
	});

	it('ignores dripper removal (weight drop to near-zero)', () => {
		const points = pts([
			[0, 0],
			[10, 180],
			[20, 185],
			[21, 185.2],
			[22, 185.1],
			[23, 185.3],
			[24, 185.0],
			[25, 5],
			[26, 3],
			[27, 2],
			[28, 2],
			[29, 2],
			[30, 2],
		]);
		const result = estimateYield(points)!;
		expect(result).toBeGreaterThanOrEqual(184);
		expect(result).toBeLessThanOrEqual(186);
	});

	it('filters out negative weights', () => {
		const points = pts([
			[0, -5],
			[1, -3],
			[5, 150],
			[10, 150.2],
			[11, 150.1],
			[12, 150.3],
			[13, 150.0],
		]);
		const result = estimateYield(points)!;
		expect(result).toBeGreaterThanOrEqual(149);
		expect(result).toBeLessThanOrEqual(151);
	});

	it('returns undefined when all stable windows are below 10g', () => {
		const points = pts([
			[0, 5],
			[1, 5],
			[2, 5],
			[3, 5],
			[4, 5],
			[5, 5],
		]);
		expect(estimateYield(points)).toBeUndefined();
	});

	it('uses last 30s of a long brew', () => {
		const points: BrewProfilePoint[] = [];
		for (let t = 0; t <= 120; t++) {
			points.push({ t, w: t < 90 ? t * 2 : 250 });
		}
		const result = estimateYield(points)!;
		expect(result).toBe(250);
	});

	it('handles short brew (< 30s) using all points', () => {
		const points = pts([
			[0, 0],
			[3, 50],
			[5, 100],
			[7, 100.2],
			[8, 100.1],
			[9, 100.3],
			[10, 100.0],
		]);
		const result = estimateYield(points)!;
		expect(result).toBeGreaterThanOrEqual(99);
		expect(result).toBeLessThanOrEqual(101);
	});

	it('returns undefined when no stable window found', () => {
		const points = pts([
			[0, 50],
			[1, 80],
			[2, 120],
			[3, 60],
			[4, 150],
			[5, 30],
		]);
		expect(estimateYield(points)).toBeUndefined();
	});
});
