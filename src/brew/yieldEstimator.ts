import type { BrewProfilePoint } from './types';

const TAIL_SECONDS = 30;
const STABLE_SECONDS = 2;
const TOLERANCE_G = 1;
const MIN_YIELD_G = 10;

export function estimateYield(points: BrewProfilePoint[]): number | undefined {
	if (points.length < 2) return undefined;
	const duration = points[points.length - 1].t - points[0].t;
	if (duration < STABLE_SECONDS) return undefined;

	const cutoff = points[points.length - 1].t - TAIL_SECONDS;
	const tail = points.filter((p) => p.t >= cutoff && p.w > 0);
	if (tail.length < 2) return undefined;

	let bestMean: number | undefined;

	for (let i = 0; i < tail.length; i++) {
		const windowStart = tail[i].t;
		let sum = tail[i].w;
		let count = 1;
		let min = tail[i].w;
		let max = tail[i].w;

		for (let j = i + 1; j < tail.length; j++) {
			const w = tail[j].w;
			min = Math.min(min, w);
			max = Math.max(max, w);
			if (max - min > TOLERANCE_G * 2) break;
			sum += w;
			count++;
			const windowDuration = tail[j].t - windowStart;
			if (windowDuration >= STABLE_SECONDS) {
				const mean = Math.round((sum / count) * 10) / 10;
				if (bestMean === undefined || mean > bestMean) {
					bestMean = mean;
				}
			}
		}
	}

	if (bestMean !== undefined && bestMean < MIN_YIELD_G) return undefined;
	return bestMean;
}
