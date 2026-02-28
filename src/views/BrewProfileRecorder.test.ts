import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrewProfileRecorder } from './BrewProfileRecorder';

describe('BrewProfileRecorder', () => {
	beforeEach(() => { vi.useFakeTimers(); });
	afterEach(() => { vi.useRealTimers(); });

	it('starts not recording', () => {
		const rec = new BrewProfileRecorder();
		expect(rec.isRecording).toBe(false);
		expect(rec.getPoints()).toEqual([]);
	});

	it('records points with timestamps after start', () => {
		const rec = new BrewProfileRecorder();
		rec.start();
		expect(rec.isRecording).toBe(true);

		rec.record(0.5);
		vi.advanceTimersByTime(500);
		rec.record(50.2);
		vi.advanceTimersByTime(500);
		rec.record(120.8);

		const points = rec.getPoints();
		expect(points).toHaveLength(3);
		expect(points[0]).toEqual({ t: 0, w: 0.5 });
		expect(points[1].t).toBeCloseTo(0.5, 1);
		expect(points[1].w).toBe(50.2);
		expect(points[2].t).toBeCloseTo(1.0, 1);
	});

	it('stops recording', () => {
		const rec = new BrewProfileRecorder();
		rec.start();
		rec.record(10);
		rec.stop();
		expect(rec.isRecording).toBe(false);

		rec.record(20);
		expect(rec.getPoints()).toHaveLength(1);
	});

	it('downsamples to every Nth point', () => {
		const rec = new BrewProfileRecorder();
		rec.start();
		for (let i = 0; i < 10; i++) {
			vi.advanceTimersByTime(100);
			rec.record(i * 10);
		}

		const down = rec.getDownsampled(5);
		expect(down).toHaveLength(3);
		expect(down[0].w).toBe(0);
		expect(down[1].w).toBe(50);
		expect(down[2].w).toBe(90);
	});

	it('downsample includes last point', () => {
		const rec = new BrewProfileRecorder();
		rec.start();
		for (let i = 0; i < 7; i++) {
			vi.advanceTimersByTime(100);
			rec.record(i);
		}

		const down = rec.getDownsampled(5);
		expect(down[down.length - 1].w).toBe(6);
	});

	it('reset clears all state', () => {
		const rec = new BrewProfileRecorder();
		rec.start();
		rec.record(10);
		rec.reset();
		expect(rec.isRecording).toBe(false);
		expect(rec.getPoints()).toEqual([]);
	});
});
