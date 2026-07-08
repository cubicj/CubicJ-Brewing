import { describe, it, expect } from 'vitest';
import { spikeFilter, emaSmooth, savitzkyGolay, processDetail, processTrend } from './signal';
import type { BrewProfilePoint } from '../brew/types';

describe('spikeFilter', () => {
	it('passes through clean data unchanged', () => {
		const points: BrewProfilePoint[] = [
			{ t: 0, w: 100 },
			{ t: 0.1, w: 101 },
			{ t: 0.2, w: 102 },
			{ t: 0.3, w: 103 },
			{ t: 0.4, w: 104 },
		];
		const result = spikeFilter(points);
		expect(result).toEqual(points);
	});

	it('replaces spike with median', () => {
		const points: BrewProfilePoint[] = [
			{ t: 0, w: 100 },
			{ t: 0.1, w: 101 },
			{ t: 0.2, w: 250 },
			{ t: 0.3, w: 103 },
			{ t: 0.4, w: 104 },
		];
		const result = spikeFilter(points);
		expect(result[2].w).toBe(103);
		expect(result[2].t).toBe(0.2);
	});

	it('returns short arrays unchanged', () => {
		const points: BrewProfilePoint[] = [
			{ t: 0, w: 100 },
			{ t: 0.1, w: 200 },
		];
		expect(spikeFilter(points)).toEqual(points);
	});

	it('handles edge positions with smaller window', () => {
		const points: BrewProfilePoint[] = [
			{ t: 0, w: 300 },
			{ t: 0.1, w: 100 },
			{ t: 0.2, w: 101 },
			{ t: 0.3, w: 102 },
			{ t: 0.4, w: 103 },
		];
		const result = spikeFilter(points);
		expect(result[0].w).toBe(101);
	});

	it('does not modify original array', () => {
		const points: BrewProfilePoint[] = [
			{ t: 0, w: 100 },
			{ t: 0.1, w: 101 },
			{ t: 0.2, w: 300 },
			{ t: 0.3, w: 103 },
			{ t: 0.4, w: 104 },
		];
		spikeFilter(points);
		expect(points[2].w).toBe(300);
	});
});

describe('emaSmooth', () => {
	it('returns empty for empty input', () => {
		expect(emaSmooth([])).toEqual([]);
	});

	it('first point unchanged', () => {
		const points: BrewProfilePoint[] = [
			{ t: 0, w: 100 },
			{ t: 0.1, w: 200 },
		];
		const result = emaSmooth(points);
		expect(result[0].w).toBe(100);
	});

	it('smooths toward new values', () => {
		const points: BrewProfilePoint[] = [
			{ t: 0, w: 100 },
			{ t: 0.1, w: 200 },
		];
		const result = emaSmooth(points, 0.6);
		expect(result[1].w).toBeGreaterThan(110);
		expect(result[1].w).toBeLessThan(120);
	});

	it('preserves timestamps', () => {
		const points: BrewProfilePoint[] = [
			{ t: 0, w: 100 },
			{ t: 0.5, w: 150 },
			{ t: 1.0, w: 200 },
		];
		const result = emaSmooth(points);
		expect(result.map((p) => p.t)).toEqual([0, 0.5, 1.0]);
	});

	it('converges on step input', () => {
		const points: BrewProfilePoint[] = Array.from({ length: 50 }, (_, i) => ({
			t: i * 0.1,
			w: 200,
		}));
		points[0] = { t: 0, w: 0 };
		const result = emaSmooth(points);
		expect(result[result.length - 1].w).toBeGreaterThan(195);
	});

	it('smoothing depends on elapsed time, not sample count', () => {
		const at10Hz: BrewProfilePoint[] = [
			{ t: 0, w: 0 },
			...Array.from({ length: 20 }, (_, i) => ({ t: (i + 1) * 0.1, w: 100 })),
		];
		const at5Hz: BrewProfilePoint[] = [
			{ t: 0, w: 0 },
			...Array.from({ length: 10 }, (_, i) => ({ t: (i + 1) * 0.2, w: 100 })),
		];
		const dense = emaSmooth(at10Hz);
		const sparse = emaSmooth(at5Hz);
		expect(Math.abs(dense[dense.length - 1].w - sparse[sparse.length - 1].w)).toBeLessThan(1);
	});

	it('catches up after a sample gap', () => {
		const points: BrewProfilePoint[] = [
			{ t: 0, w: 0 },
			{ t: 5, w: 100 },
		];
		const result = emaSmooth(points);
		expect(result[1].w).toBeGreaterThan(95);
	});

	it('handles duplicate timestamps without NaN', () => {
		const points: BrewProfilePoint[] = [
			{ t: 1, w: 100 },
			{ t: 1, w: 200 },
		];
		const result = emaSmooth(points);
		expect(Number.isFinite(result[1].w)).toBe(true);
		expect(result[1].w).toBeGreaterThanOrEqual(100);
		expect(result[1].w).toBeLessThanOrEqual(200);
	});
});

describe('savitzkyGolay', () => {
	it('returns short arrays unchanged', () => {
		const points: BrewProfilePoint[] = Array.from({ length: 5 }, (_, i) => ({
			t: i * 0.1,
			w: 100 + i,
		}));
		expect(savitzkyGolay(points)).toEqual(points);
	});

	it('smooths noisy data while preserving trend', () => {
		const points: BrewProfilePoint[] = Array.from({ length: 20 }, (_, i) => ({
			t: i * 0.1,
			w: 100 + i * 2 + (i % 2 === 0 ? 3 : -3),
		}));
		const result = savitzkyGolay(points);
		const midIdx = 10;
		const rawNoise = Math.abs(points[midIdx].w - points[midIdx - 1].w);
		const sgNoise = Math.abs(result[midIdx].w - result[midIdx - 1].w);
		expect(sgNoise).toBeLessThan(rawNoise);
	});

	it('preserves linear data exactly', () => {
		const points: BrewProfilePoint[] = Array.from({ length: 20 }, (_, i) => ({
			t: i * 0.1,
			w: 50 + i * 5,
		}));
		const result = savitzkyGolay(points);
		for (let i = 5; i < 15; i++) {
			expect(result[i].w).toBeCloseTo(points[i].w, 5);
		}
	});

	it('preserves timestamps', () => {
		const points: BrewProfilePoint[] = Array.from({ length: 20 }, (_, i) => ({
			t: i * 0.1,
			w: 100,
		}));
		const result = savitzkyGolay(points);
		expect(result.map((p) => p.t)).toEqual(points.map((p) => p.t));
	});
});

describe('processDetail', () => {
	it('applies spike filter only', () => {
		const points: BrewProfilePoint[] = Array.from({ length: 20 }, (_, i) => ({
			t: i * 0.1,
			w: 100 + i,
		}));
		points[10] = { t: 1.0, w: 300 };
		const result = processDetail(points);
		expect(result[10].w).toBeLessThan(150);
		expect(result.length).toBe(20);
	});
});

describe('processTrend', () => {
	it('applies spike filter then EMA', () => {
		const points: BrewProfilePoint[] = [
			{ t: 0, w: 100 },
			{ t: 0.1, w: 101 },
			{ t: 0.2, w: 300 },
			{ t: 0.3, w: 103 },
			{ t: 0.4, w: 104 },
		];
		const result = processTrend(points);
		expect(result[2].w).toBeLessThan(150);
		expect(result.length).toBe(5);
	});

	it('handles empty input', () => {
		expect(processTrend([])).toEqual([]);
	});
});
