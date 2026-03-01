import type { BrewProfilePoint } from '../brew/types';
import type { BrewProfileRecorder } from './BrewProfileRecorder';

const CHART_HEIGHT = 220;
const PADDING = { top: 12, right: 12, bottom: 28, left: 40 };
const BG_COLOR = '#0a0a0a';
const GRID_COLOR = '#1a1a1a';
const LABEL_COLOR = '#666';
const LINE_COLOR = '#4a9eff';
const FILL_ALPHA = 0.12;

export class BrewProfileChart {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private rafId = 0;
	private recorder: BrewProfileRecorder | null = null;
	private staticPoints: BrewProfilePoint[] | null = null;
	private ro: ResizeObserver;

	private chartHeight: number;

	constructor(container: HTMLElement, height = CHART_HEIGHT) {
		this.chartHeight = height;
		this.canvas = container.createEl('canvas', { cls: 'brew-profile-canvas' });
		this.canvas.height = height * devicePixelRatio;
		this.canvas.style.height = height + 'px';
		this.canvas.style.width = '100%';
		this.ctx = this.canvas.getContext('2d')!;

		this.ro = new ResizeObserver(() => this.syncWidth());
		this.ro.observe(container);
		this.syncWidth();
	}

	private syncWidth(): void {
		const w = this.canvas.clientWidth;
		if (w > 0) {
			this.canvas.width = w * devicePixelRatio;
			if (this.staticPoints) this.render(this.staticPoints);
			else if (!this.recorder) this.render([]);
		}
	}

	startLive(recorder: BrewProfileRecorder): void {
		this.recorder = recorder;
		const tick = () => {
			this.render(this.recorder!.getPoints());
			this.rafId = requestAnimationFrame(tick);
		};
		this.rafId = requestAnimationFrame(tick);
	}

	stopLive(): void {
		if (this.rafId) {
			cancelAnimationFrame(this.rafId);
			this.rafId = 0;
		}
		if (this.recorder) {
			this.render(this.recorder.getPoints());
			this.recorder = null;
		}
	}

	renderStatic(points: BrewProfilePoint[]): void {
		this.staticPoints = points;
		this.render(points);
	}

	destroy(): void {
		this.stopLive();
		this.ro.disconnect();
	}

	private render(points: BrewProfilePoint[]): void {
		const ctx = this.ctx;
		const dpr = devicePixelRatio;
		const cw = this.canvas.width;
		const ch = this.canvas.height;
		const pl = PADDING.left * dpr;
		const pr = PADDING.right * dpr;
		const pt = PADDING.top * dpr;
		const pb = PADDING.bottom * dpr;
		const plotW = cw - pl - pr;
		const plotH = ch - pt - pb;

		ctx.clearRect(0, 0, cw, ch);
		ctx.fillStyle = BG_COLOR;
		ctx.fillRect(0, 0, cw, ch);

		if (points.length === 0) {
			ctx.fillStyle = LABEL_COLOR;
			ctx.font = `${12 * dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;
			ctx.textAlign = 'center';
			ctx.fillText('⏳', cw / 2, ch / 2);
			return;
		}

		const maxT = Math.max(points[points.length - 1].t, 30);
		const maxW = Math.max(...points.map(p => p.w), 10) * 1.1;

		const toX = (t: number) => pl + (t / maxT) * plotW;
		const toY = (w: number) => pt + plotH - (w / maxW) * plotH;

		this.drawGrid(ctx, dpr, pl, pt, plotW, plotH, maxT, maxW, toX, toY);
		this.drawCurve(ctx, dpr, points, toX, toY, pt, plotH);
	}

	private drawGrid(
		ctx: CanvasRenderingContext2D, dpr: number,
		pl: number, pt: number, plotW: number, plotH: number,
		maxT: number, maxW: number,
		toX: (t: number) => number, toY: (w: number) => number,
	): void {
		ctx.strokeStyle = GRID_COLOR;
		ctx.lineWidth = dpr;
		ctx.fillStyle = LABEL_COLOR;
		ctx.font = `${10 * dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;

		const timeStep = this.niceStep(maxT, 5);
		ctx.textAlign = 'center';
		for (let t = timeStep; t <= maxT; t += timeStep) {
			const x = toX(t);
			ctx.beginPath();
			ctx.moveTo(x, pt);
			ctx.lineTo(x, pt + plotH);
			ctx.stroke();
			const label = t >= 60 ? `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}` : `${t}s`;
			ctx.fillText(label, x, pt + plotH + 14 * dpr);
		}

		const weightStep = this.niceStep(maxW, 4);
		ctx.textAlign = 'right';
		for (let w = weightStep; w < maxW; w += weightStep) {
			const y = toY(w);
			ctx.beginPath();
			ctx.moveTo(pl, y);
			ctx.lineTo(pl + plotW, y);
			ctx.stroke();
			ctx.fillText(`${Math.round(w)}`, pl - 4 * dpr, y + 3 * dpr);
		}
	}

	private drawCurve(
		ctx: CanvasRenderingContext2D, dpr: number,
		points: BrewProfilePoint[],
		toX: (t: number) => number, toY: (w: number) => number,
		pt: number, plotH: number,
	): void {
		if (points.length < 2) return;

		ctx.beginPath();
		ctx.moveTo(toX(points[0].t), toY(points[0].w));
		for (let i = 1; i < points.length; i++) {
			ctx.lineTo(toX(points[i].t), toY(points[i].w));
		}

		ctx.strokeStyle = LINE_COLOR;
		ctx.lineWidth = 2 * dpr;
		ctx.lineJoin = 'round';
		ctx.stroke();

		ctx.lineTo(toX(points[points.length - 1].t), pt + plotH);
		ctx.lineTo(toX(points[0].t), pt + plotH);
		ctx.closePath();
		ctx.fillStyle = LINE_COLOR;
		ctx.globalAlpha = FILL_ALPHA;
		ctx.fill();
		ctx.globalAlpha = 1;
	}

	private niceStep(max: number, targetLines: number): number {
		const rough = max / targetLines;
		const mag = Math.pow(10, Math.floor(Math.log10(rough)));
		const norm = rough / mag;
		const nice = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
		return nice * mag;
	}
}
