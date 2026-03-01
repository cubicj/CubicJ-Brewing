import type { BrewProfilePoint } from '../brew/types';

const SPIKE_WINDOW = 5;
const SPIKE_THRESHOLD = 50;
const EMA_ALPHA = 0.15;

const SG11_COEFFS = [-36, 9, 44, 69, 84, 89, 84, 69, 44, 9, -36];
const SG11_NORM = 429;

export function spikeFilter(
	points: BrewProfilePoint[],
	window = SPIKE_WINDOW,
	threshold = SPIKE_THRESHOLD,
): BrewProfilePoint[] {
	if (points.length < 3) return points;
	const half = Math.floor(window / 2);
	return points.map((p, i) => {
		const start = Math.max(0, i - half);
		const end = Math.min(points.length - 1, i + half);
		const neighbors: number[] = [];
		for (let j = start; j <= end; j++) {
			neighbors.push(points[j].w);
		}
		neighbors.sort((a, b) => a - b);
		const median = neighbors[Math.floor(neighbors.length / 2)];
		if (Math.abs(p.w - median) > threshold) {
			return { t: p.t, w: median };
		}
		return p;
	});
}

export function emaSmooth(
	points: BrewProfilePoint[],
	alpha = EMA_ALPHA,
): BrewProfilePoint[] {
	if (points.length === 0) return [];
	const result: BrewProfilePoint[] = [points[0]];
	for (let i = 1; i < points.length; i++) {
		const prev = result[i - 1].w;
		result.push({ t: points[i].t, w: alpha * points[i].w + (1 - alpha) * prev });
	}
	return result;
}

export function savitzkyGolay(
	points: BrewProfilePoint[],
	coeffs = SG11_COEFFS,
	norm = SG11_NORM,
): BrewProfilePoint[] {
	if (points.length < coeffs.length) return points;
	const half = Math.floor(coeffs.length / 2);
	const result: BrewProfilePoint[] = [];
	for (let i = 0; i < half; i++) {
		result.push(points[i]);
	}
	for (let i = half; i < points.length - half; i++) {
		let sum = 0;
		for (let j = 0; j < coeffs.length; j++) {
			sum += coeffs[j] * points[i - half + j].w;
		}
		result.push({ t: points[i].t, w: sum / norm });
	}
	for (let i = points.length - half; i < points.length; i++) {
		result.push(points[i]);
	}
	return result;
}

export function processDetail(points: BrewProfilePoint[]): BrewProfilePoint[] {
	return savitzkyGolay(spikeFilter(points));
}

export function processTrend(points: BrewProfilePoint[]): BrewProfilePoint[] {
	return emaSmooth(spikeFilter(points));
}
