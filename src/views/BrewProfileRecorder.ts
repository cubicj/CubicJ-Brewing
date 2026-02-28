import type { BrewProfilePoint } from '../brew/types';

export class BrewProfileRecorder {
	private points: BrewProfilePoint[] = [];
	private startTime = 0;
	private recording = false;

	get isRecording(): boolean {
		return this.recording;
	}

	start(): void {
		this.points = [];
		this.startTime = Date.now();
		this.recording = true;
	}

	record(grams: number): void {
		if (!this.recording) return;
		const t = (Date.now() - this.startTime) / 1000;
		this.points.push({ t: Math.round(t * 10) / 10, w: grams });
	}

	stop(): void {
		this.recording = false;
	}

	getPoints(): BrewProfilePoint[] {
		return this.points;
	}

	getDownsampled(stride = 5): BrewProfilePoint[] {
		const result: BrewProfilePoint[] = [];
		for (let i = 0; i < this.points.length; i += stride) {
			result.push(this.points[i]);
		}
		if (this.points.length > 0) {
			const last = this.points[this.points.length - 1];
			if (result[result.length - 1] !== last) {
				result.push(last);
			}
		}
		return result;
	}

	reset(): void {
		this.points = [];
		this.startTime = 0;
		this.recording = false;
	}
}
