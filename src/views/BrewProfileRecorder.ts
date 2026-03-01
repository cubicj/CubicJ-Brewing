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

	reset(): void {
		this.points = [];
		this.startTime = 0;
		this.recording = false;
	}
}
