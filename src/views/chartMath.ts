import type { BrewProfilePoint } from '../brew/types';

export function niceStep(max: number, targetLines: number): number {
	const rough = max / targetLines;
	const mag = Math.pow(10, Math.floor(Math.log10(rough)));
	const norm = rough / mag;
	const nice = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
	return nice * mag;
}

export function filterVisible(points: BrewProfilePoint[], start: number, end: number): BrewProfilePoint[] {
	if (points.length === 0) return points;
	let lo = points.length;
	for (let i = 0; i < points.length; i++) {
		if (points[i].t >= start) {
			lo = i;
			break;
		}
	}
	let hi = 0;
	for (let i = points.length - 1; i >= 0; i--) {
		if (points[i].t <= end) {
			hi = i + 1;
			break;
		}
	}
	return points.slice(Math.max(0, lo - 1), Math.min(points.length, hi + 1));
}

export function interpolateWeight(trend: BrewProfilePoint[], t: number): number {
	if (trend.length === 0) return 0;
	if (t <= trend[0].t) return trend[0].w;
	if (t >= trend[trend.length - 1].t) return trend[trend.length - 1].w;
	for (let i = 0; i < trend.length - 1; i++) {
		if (trend[i].t <= t && trend[i + 1].t >= t) {
			const frac = (t - trend[i].t) / (trend[i + 1].t - trend[i].t);
			return trend[i].w + frac * (trend[i + 1].w - trend[i].w);
		}
	}
	return trend[trend.length - 1].w;
}

export function flowRateAt(trend: BrewProfilePoint[], t: number, halfWindow = 1): number | undefined {
	if (trend.length < 2) return undefined;
	const t0 = Math.max(trend[0].t, t - halfWindow);
	const t1 = Math.min(trend[trend.length - 1].t, t + halfWindow);
	if (t1 <= t0) return undefined;
	return Math.max(0, (interpolateWeight(trend, t1) - interpolateWeight(trend, t0)) / (t1 - t0));
}
