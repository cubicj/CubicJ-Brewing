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

	record(grams: number, stable = false): void {
		if (!this.recording) return;
		const t = (Date.now() - this.startTime) / 1000;
		const rounded = Math.round(t * 10) / 10;
		this.points.push(stable ? { t: rounded, w: grams, s: true } : { t: rounded, w: grams });
	}

	stop(): void {
		this.recording = false;
	}

	getPoints(): BrewProfilePoint[] {
		return this.points;
	}

	reset(): void {
		this.points = [];
		this.startTime = 0;
		this.recording = false;
	}
}
