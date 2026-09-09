import { describe, expect, it } from 'vitest';
import {
	paintProfileCanvas,
	type ProfileCanvasMetrics,
	type ProfileCanvasPaintInput,
} from '../../src/views/ProfileCanvasPainter';

function createContext(): { ctx: CanvasRenderingContext2D; calls: string[] } {
	const calls: string[] = [];
	let fillStyle = '';
	let strokeStyle = '';
	let lineWidth = 1;
	let lineJoin: CanvasLineJoin = 'miter';
	let globalAlpha = 1;
	let font = '';
	let textAlign: CanvasTextAlign = 'start';
	const ctx = {
		clearRect: () => calls.push('clear'),
		fillRect: () => calls.push(`fill:${fillStyle}`),
		save: () => calls.push('save'),
		restore: () => calls.push('restore'),
		beginPath: () => {},
		closePath: () => {},
		rect: () => {},
		clip: () => calls.push('clip'),
		moveTo: () => {},
		lineTo: () => {},
		stroke: () => calls.push(`stroke:${strokeStyle}:${lineWidth}:${globalAlpha}`),
		arc: () => calls.push('arc'),
		fill: () => calls.push(`path-fill:${fillStyle}`),
		setLineDash: (segments: number[]) => calls.push(`dash:${segments.join(',')}`),
		fillText: (text: string) => calls.push(`text:${text}:${fillStyle}:${textAlign}`),
		measureText: (text: string) => ({ width: text.length * 5 }) as TextMetrics,
		get fillStyle() {
			return fillStyle;
		},
		set fillStyle(value: string | CanvasGradient | CanvasPattern) {
			fillStyle = String(value);
		},
		get strokeStyle() {
			return strokeStyle;
		},
		set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
			strokeStyle = String(value);
		},
		get lineWidth() {
			return lineWidth;
		},
		set lineWidth(value: number) {
			lineWidth = value;
		},
		get lineJoin() {
			return lineJoin;
		},
		set lineJoin(value: CanvasLineJoin) {
			lineJoin = value;
		},
		get globalAlpha() {
			return globalAlpha;
		},
		set globalAlpha(value: number) {
			globalAlpha = value;
		},
		get font() {
			return font;
		},
		set font(value: string) {
			font = value;
		},
		get textAlign() {
			return textAlign;
		},
		set textAlign(value: CanvasTextAlign) {
			textAlign = value;
		},
	} as unknown as CanvasRenderingContext2D;
	return { ctx, calls };
}

const metrics: ProfileCanvasMetrics = {
	dpr: 1,
	cw: 100,
	ch: 80,
	pl: 10,
	pr: 10,
	pt: 10,
	pb: 20,
	plotW: 80,
	plotH: 50,
};

const colors = {
	bg: '#background',
	grid: '#grid',
	label: '#label',
	line: '#line',
	flow: '#flow',
	crosshair: '#crosshair',
	labelBg: '#label-bg',
	labelText: '#label-text',
};

function createInput(ctx: CanvasRenderingContext2D): ProfileCanvasPaintInput {
	return {
		ctx,
		metrics,
		viewport: {
			start: 0,
			end: 10,
			maxWeight: 10,
			maxFlow: 4,
			toX: (t) => 10 + t * 8,
			toY: (weight) => 60 - weight * 5,
			toFlowY: (flow) => 60 - flow * 12.5,
		},
		detail: [
			{ t: 0, w: 2 },
			{ t: 10, w: 4 },
		],
		trend: [
			{ t: 0, w: 2 },
			{ t: 10, w: 4 },
		],
		flow: [
			{ t: 0, w: 0.2 },
			{ t: 10, w: 0.2 },
		],
		crosshair: null,
		colors,
	};
}

describe('paintProfileCanvas', () => {
	it('preserves the background, clipped plot, series, and axes draw order', () => {
		const { ctx, calls } = createContext();

		paintProfileCanvas(createInput(ctx));

		expect(calls).toEqual([
			'clear',
			'fill:#background',
			'save',
			'clip',
			'stroke:#grid:1:1',
			'stroke:#grid:1:1',
			'stroke:#grid:1:1',
			'stroke:#grid:1:1',
			'stroke:#grid:1:1',
			'stroke:#grid:1:1',
			'path-fill:#flow',
			'stroke:#flow:1.5:1',
			'stroke:#line:1:0.35',
			'stroke:#line:2:1',
			'restore',
			'text:0s:#label:center',
			'text:10s:#label:center',
			'text:2:#label:right',
			'text:4:#label:right',
			'text:6:#label:right',
			'text:8:#label:right',
			'text:1:#flow:left',
			'text:2:#flow:left',
			'text:3:#flow:left',
		]);
	});

	it('skips the flow series when fewer than 2 flow points are visible', () => {
		const { ctx, calls } = createContext();
		const input = createInput(ctx);
		input.flow = [{ t: 0, w: 0.2 }];

		paintProfileCanvas(input);

		expect(calls).not.toContain('path-fill:#flow');
		expect(calls).not.toContain('stroke:#flow:1.5:1');
		expect(calls).toContain('text:1:#flow:left');
	});

	it('formats fractional flow ticks with one decimal', () => {
		const { ctx, calls } = createContext();
		const input = createInput(ctx);
		input.viewport!.maxFlow = 2;

		paintProfileCanvas(input);

		expect(calls).toContain('text:0.5:#flow:left');
		expect(calls).toContain('text:1:#flow:left');
		expect(calls).toContain('text:1.5:#flow:left');
	});

	it('skips the flow series when no flow points are visible', () => {
		const { ctx, calls } = createContext();
		const input = createInput(ctx);
		input.flow = [];

		paintProfileCanvas(input);

		expect(calls).not.toContain('path-fill:#flow');
		expect(calls).not.toContain('stroke:#flow:1.5:1');
		expect(calls).toContain('text:1:#flow:left');
	});

	it('returns crosshair label animation intent without owning the frame loop', () => {
		const { ctx, calls } = createContext();
		const input = createInput(ctx);
		input.crosshair = {
			t: 5,
			trend: [
				{ t: 0, w: 0 },
				{ t: 10, w: 10 },
			],
			labelY: 0,
			labels: { weight: 'Weight', flow: 'Flow', time: 'Time' },
		};

		const result = paintProfileCanvas(input);

		expect(result).toEqual({ labelY: 4.92, needsAnimationFrame: true });
		expect(calls).toContain('dash:4,4');
		expect(calls).toContain('dash:');
		expect(calls).toContain('arc');
		expect(calls.filter((call) => call === 'arc')).toHaveLength(2);
		expect(calls).toContain('path-fill:#flow');
		expect(calls).toContain('text:Weight: 5.0g:#label-text:left');
		expect(calls).toContain('text:Flow: 1.0g/s:#label-text:left');
		expect(calls).toContain('text:Time: 5s:#label-text:left');
	});
});
