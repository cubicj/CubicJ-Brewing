import type { BrewProfilePoint } from '../brew/types';
import type { BrewProfileRecorder } from './BrewProfileRecorder';
import { processDetail, processTrend } from '../utils/signal';
import { t as i18t } from '../i18n/index';
import { niceStep, filterVisible, interpolateWeight } from './chartMath';

const CHART_HEIGHT = 220;
const PADDING = { top: 12, right: 12, bottom: 28, left: 40 };
const BG_COLOR = '#0a0a0a';
const GRID_COLOR = '#1a1a1a';
const LABEL_COLOR = '#999';
const LINE_COLOR = '#4a9eff';
const DETAIL_ALPHA = 0.35;
const TIME_SCALE = 10;
const TIME_GRID_STEP = 10;
const SCROLL_SPEED = 0.05;
const CROSSHAIR_COLOR = 'rgba(255, 255, 255, 0.3)';

export class BrewProfileChart {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private rafId = 0;
	private recorder: BrewProfileRecorder | null = null;
	private staticPoints: BrewProfilePoint[] | null = null;
	private ro: ResizeObserver;
	private viewStart = 0;
	private wheelHandler: ((e: WheelEvent) => void) | null = null;

	private chartHeight: number;
	private timeScale: number;
	private scrollable: boolean;
	private scrollContainer: HTMLElement | null = null;
	private scrollWheelHandler: ((e: WheelEvent) => void) | null = null;
	private scrollKeyHandler: ((e: KeyboardEvent) => void) | null = null;
	private dragHandlers: { down: (e: MouseEvent) => void; move: (e: MouseEvent) => void; up: () => void } | null = null;

	private cachedSource: BrewProfilePoint[] | null = null;
	private cachedDetail: BrewProfilePoint[] = [];
	private cachedTrend: BrewProfilePoint[] = [];

	private crosshairT: number | null = null;
	private crosshairMoveHandler: ((e: MouseEvent) => void) | null = null;
	private crosshairLeaveHandler: (() => void) | null = null;
	private crosshairRaf = 0;
	private labelY: number | null = null;

	constructor(container: HTMLElement, height = CHART_HEIGHT, timeScale = TIME_SCALE, scrollable = false) {
		this.chartHeight = height;
		this.timeScale = timeScale;
		this.scrollable = scrollable;
		this.canvas = container.createEl('canvas', { cls: 'brew-profile-canvas' });
		this.canvas.height = height * devicePixelRatio;
		this.canvas.style.height = height + 'px';
		if (!scrollable) this.canvas.style.width = '100%';
		this.ctx = this.canvas.getContext('2d')!;

		if (scrollable) this.attachScrollControls(container);

		this.ro = new ResizeObserver(() => this.syncWidth());
		this.ro.observe(container);
		this.syncWidth();
	}

	private attachScrollControls(container: HTMLElement): void {
		this.scrollContainer = container;
		container.tabIndex = 0;
		container.style.outline = 'none';
		this.attachWheel(container);
		this.attachKeyboard(container);
		this.attachDragScroll(container);
		this.attachCrosshairEvents(container);
	}

	private attachWheel(container: HTMLElement): void {
		this.scrollWheelHandler = (e: WheelEvent) => {
			const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
			if (!dx) return;
			e.preventDefault();
			e.stopPropagation();
			container.scrollLeft += dx;
		};
		container.addEventListener('wheel', this.scrollWheelHandler, {
			capture: true,
			passive: false,
		} as AddEventListenerOptions);
	}

	private attachKeyboard(container: HTMLElement): void {
		const STEP = 60;
		this.scrollKeyHandler = (e: KeyboardEvent) => {
			if (e.key === 'ArrowRight') {
				container.scrollLeft += STEP;
				e.preventDefault();
			} else if (e.key === 'ArrowLeft') {
				container.scrollLeft -= STEP;
				e.preventDefault();
			}
		};
		container.addEventListener('keydown', this.scrollKeyHandler);
	}

	private attachDragScroll(container: HTMLElement): void {
		let dragging = false;
		let dragStartX = 0;
		let dragScrollLeft = 0;
		const down = (e: MouseEvent) => {
			dragging = true;
			dragStartX = e.clientX;
			dragScrollLeft = container.scrollLeft;
		};
		const move = (e: MouseEvent) => {
			if (!dragging) return;
			container.scrollLeft = dragScrollLeft - (e.clientX - dragStartX);
		};
		const up = () => {
			dragging = false;
		};
		container.addEventListener('mousedown', down);
		container.addEventListener('mousemove', move);
		container.addEventListener('mouseleave', up);
		container.addEventListener('mouseup', up);
		this.dragHandlers = { down, move, up };
	}

	private attachCrosshairEvents(_container: HTMLElement): void {
		this.crosshairMoveHandler = (e: MouseEvent) => {
			const rect = this.canvas.getBoundingClientRect();
			const scaleX = this.canvas.width / rect.width;
			const mouseX = (e.clientX - rect.left) * scaleX;
			const dpr = devicePixelRatio;
			const pl = PADDING.left * dpr;
			const plotW = this.canvas.width - (PADDING.left + PADDING.right) * dpr;
			const dur = this.viewDuration();
			const t = this.viewStart + ((mouseX - pl) / plotW) * dur;
			this.crosshairT = t;
			if (!this.crosshairRaf) {
				this.crosshairRaf = requestAnimationFrame(() => {
					this.crosshairRaf = 0;
					if (this.staticPoints) this.render(this.staticPoints);
				});
			}
		};
		this.canvas.addEventListener('mousemove', this.crosshairMoveHandler);

		this.crosshairLeaveHandler = () => {
			this.crosshairT = null;
			this.labelY = null;
			if (this.staticPoints) this.render(this.staticPoints);
		};
		this.canvas.addEventListener('mouseleave', this.crosshairLeaveHandler);
	}

	private detachScrollControls(): void {
		if (this.scrollContainer && this.scrollWheelHandler) {
			this.scrollContainer.removeEventListener('wheel', this.scrollWheelHandler);
		}
		if (this.scrollContainer && this.scrollKeyHandler) {
			this.scrollContainer.removeEventListener('keydown', this.scrollKeyHandler);
		}
		if (this.crosshairMoveHandler) {
			this.canvas.removeEventListener('mousemove', this.crosshairMoveHandler);
		}
		if (this.crosshairLeaveHandler) {
			this.canvas.removeEventListener('mouseleave', this.crosshairLeaveHandler);
		}
		if (this.crosshairRaf) {
			cancelAnimationFrame(this.crosshairRaf);
			this.crosshairRaf = 0;
		}
		if (this.scrollContainer && this.dragHandlers) {
			this.scrollContainer.removeEventListener('mousedown', this.dragHandlers.down);
			this.scrollContainer.removeEventListener('mousemove', this.dragHandlers.move);
			this.scrollContainer.removeEventListener('mouseleave', this.dragHandlers.up);
			this.scrollContainer.removeEventListener('mouseup', this.dragHandlers.up);
		}
		this.scrollContainer = null;
		this.scrollWheelHandler = null;
		this.scrollKeyHandler = null;
		this.dragHandlers = null;
		this.crosshairMoveHandler = null;
		this.crosshairLeaveHandler = null;
	}

	private syncWidth(): void {
		if (this.scrollable) {
			if (this.staticPoints) this.applyScrollableWidth(this.staticPoints);
			return;
		}
		const w = this.canvas.clientWidth;
		if (w > 0) {
			this.canvas.width = w * devicePixelRatio;
			if (this.staticPoints) {
				this.fitTimeScale(this.staticPoints);
				this.render(this.staticPoints);
			} else if (!this.recorder) this.render([]);
		}
	}

	private applyScrollableWidth(points: BrewProfilePoint[]): void {
		const maxT = points.length > 0 ? points[points.length - 1].t : 0;
		const containerWidth = this.canvas.parentElement?.clientWidth ?? 0;
		const dataWidth = PADDING.left + maxT * this.timeScale + containerWidth * 0.2;
		const w = Math.max(dataWidth, containerWidth);
		this.canvas.style.width = w + 'px';
		this.canvas.width = w * devicePixelRatio;
		this.render(points);
	}

	private viewDuration(): number {
		const dpr = devicePixelRatio;
		const plotW = this.canvas.width - (PADDING.left + PADDING.right) * dpr;
		return plotW / (this.timeScale * dpr);
	}

	startLive(recorder: BrewProfileRecorder): void {
		this.recorder = recorder;
		this.viewStart = 0;
		this.detachWheel();
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
		this.detachWheel();
		this.detachScrollControls();
		if (this.recorder) {
			this.render(this.recorder.getPoints());
			this.recorder = null;
		}
	}

	renderStatic(points: BrewProfilePoint[]): void {
		this.staticPoints = points;
		this.viewStart = 0;
		if (this.scrollable) {
			this.applyScrollableWidth(points);
		} else {
			this.fitTimeScale(points);
			this.attachViewWheel(points);
			this.render(points);
		}
	}

	private fitTimeScale(points: BrewProfilePoint[]): void {
		const maxT = points.length > 0 ? points[points.length - 1].t : 0;
		if (maxT <= 0) return;
		const dpr = devicePixelRatio;
		const plotW = this.canvas.width - (PADDING.left + PADDING.right) * dpr;
		this.timeScale = plotW / (maxT * dpr);
	}

	destroy(): void {
		this.stopLive();
		this.detachWheel();
		this.detachScrollControls();
		this.ro.disconnect();
	}

	private attachViewWheel(points: BrewProfilePoint[]): void {
		this.detachWheel();
		this.wheelHandler = (e: WheelEvent) => {
			e.preventDefault();
			const maxT = points[points.length - 1]?.t ?? 0;
			const dur = this.viewDuration();
			const maxStart = Math.max(0, maxT - dur);
			const delta = (e.deltaY || e.deltaX) * SCROLL_SPEED;
			this.viewStart = Math.max(0, Math.min(maxStart, this.viewStart + delta));
			this.render(points);
		};
		this.canvas.addEventListener('wheel', this.wheelHandler, { passive: false });
	}

	private detachWheel(): void {
		if (this.wheelHandler) {
			this.canvas.removeEventListener('wheel', this.wheelHandler);
			this.wheelHandler = null;
		}
	}

	private cachedLen = 0;

	private updateCache(points: BrewProfilePoint[]): void {
		if (this.cachedSource === points && this.cachedLen === points.length) return;
		this.cachedSource = points;
		this.cachedLen = points.length;
		this.cachedDetail = processDetail(points);
		this.cachedTrend = processTrend(points);
	}

	private getMetrics() {
		const dpr = devicePixelRatio;
		const cw = this.canvas.width;
		const ch = this.canvas.height;
		const pl = PADDING.left * dpr;
		const pr = PADDING.right * dpr;
		const pt = PADDING.top * dpr;
		const pb = PADDING.bottom * dpr;
		const plotW = cw - pl - pr;
		const plotH = ch - pt - pb;
		return { dpr, cw, ch, pl, pr, pt, pb, plotW, plotH };
	}

	private computeScale(points: BrewProfilePoint[], m: ReturnType<BrewProfileChart['getMetrics']>) {
		const maxT = points[points.length - 1].t;
		const dur = this.viewDuration();

		if (this.recorder) {
			this.viewStart = Math.max(0, maxT - dur);
		}

		const viewEnd = this.viewStart + dur;
		let maxW = 10;
		for (const p of points) if (p.w > maxW) maxW = p.w;
		maxW *= 1.1;

		const toX = (t: number) => m.pl + ((t - this.viewStart) / dur) * m.plotW;
		const toY = (w: number) => m.pt + m.plotH - (w / maxW) * m.plotH;

		return { viewEnd, maxW, dur, toX, toY };
	}

	private getProcessedData(points: BrewProfilePoint[], viewEnd: number) {
		this.updateCache(points);
		const visibleDetail = filterVisible(this.cachedDetail, this.viewStart, viewEnd);
		const visibleTrend = filterVisible(this.cachedTrend, this.viewStart, viewEnd);
		return { visibleDetail, visibleTrend };
	}

	private renderPlot(
		ctx: CanvasRenderingContext2D,
		m: ReturnType<BrewProfileChart['getMetrics']>,
		scale: ReturnType<BrewProfileChart['computeScale']>,
		detail: BrewProfilePoint[],
		trend: BrewProfilePoint[],
	): void {
		ctx.save();
		ctx.beginPath();
		ctx.rect(m.pl, m.pt, m.plotW, m.plotH);
		ctx.clip();

		this.drawGrid(
			ctx,
			m.dpr,
			m.pl,
			m.pt,
			m.plotW,
			m.plotH,
			this.viewStart,
			scale.viewEnd,
			scale.maxW,
			scale.toX,
			scale.toY,
		);
		this.drawLine(ctx, m.dpr, detail, scale.toX, scale.toY, 1, DETAIL_ALPHA);
		this.drawTrend(ctx, m.dpr, trend, scale.toX, scale.toY);

		if (this.crosshairT !== null) {
			this.drawCrosshair(ctx, m.dpr, m.pl, m.pt, m.plotW, m.plotH, this.cachedTrend, scale.toX, scale.toY);
		}

		ctx.restore();
	}

	private render(points: BrewProfilePoint[]): void {
		const ctx = this.ctx;
		const m = this.getMetrics();

		ctx.clearRect(0, 0, m.cw, m.ch);
		ctx.fillStyle = BG_COLOR;
		ctx.fillRect(0, 0, m.cw, m.ch);

		if (points.length === 0) {
			ctx.fillStyle = LABEL_COLOR;
			ctx.font = `${12 * m.dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;
			ctx.textAlign = 'center';
			ctx.fillText('⏳', m.cw / 2, m.ch / 2);
			return;
		}

		const scale = this.computeScale(points, m);
		const { visibleDetail, visibleTrend } = this.getProcessedData(points, scale.viewEnd);

		this.renderPlot(ctx, m, scale, visibleDetail, visibleTrend);

		this.drawXAxis(ctx, m.dpr, m.pl, m.pt, m.plotW, m.plotH, this.viewStart, scale.viewEnd, scale.toX);
		this.drawYAxis(ctx, m.dpr, m.pl, m.pt, m.plotH, scale.maxW, scale.toY);
	}

	private drawCrosshair(
		ctx: CanvasRenderingContext2D,
		dpr: number,
		pl: number,
		pt: number,
		plotW: number,
		plotH: number,
		trend: BrewProfilePoint[],
		toX: (t: number) => number,
		toY: (w: number) => number,
	): void {
		if (trend.length < 2) return;
		const t = Math.max(0, Math.min(this.crosshairT!, trend[trend.length - 1].t));
		const x = toX(t);
		if (x < pl || x > pl + plotW) return;

		const w = interpolateWeight(trend, t);

		ctx.beginPath();
		ctx.moveTo(x, pt);
		ctx.lineTo(x, pt + plotH);
		ctx.strokeStyle = CROSSHAIR_COLOR;
		ctx.lineWidth = dpr;
		ctx.setLineDash([4 * dpr, 4 * dpr]);
		ctx.stroke();
		ctx.setLineDash([]);

		const dotY = toY(w);
		ctx.beginPath();
		ctx.arc(x, dotY, 3 * dpr, 0, Math.PI * 2);
		ctx.fillStyle = LINE_COLOR;
		ctx.fill();

		this.renderCrosshairLabel(ctx, dpr, x, dotY, w, t, pl, plotW, pt);
	}

	private renderCrosshairLabel(
		ctx: CanvasRenderingContext2D,
		dpr: number,
		x: number,
		dotY: number,
		w: number,
		t: number,
		pl: number,
		plotW: number,
		pt: number,
	): void {
		const tSec = Math.round(t);
		const tLabel = tSec >= 60 ? `${Math.floor(tSec / 60)}m ${tSec % 60}s` : `${tSec}s`;
		const line1 = `${i18t('chart.weight')}: ${w.toFixed(1)}g`;
		const line2 = `${i18t('chart.time')}: ${tLabel}`;
		ctx.font = `${11 * dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;
		const tw = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width) + 8 * dpr;
		const lineH = 16 * dpr;
		const th = lineH * 2 + 4 * dpr;

		let lx = x + 8 * dpr;
		if (lx + tw > pl + plotW) lx = x - tw - 4 * dpr;
		let targetY = dotY - th - 6 * dpr;
		if (targetY < pt) targetY = dotY + 6 * dpr;
		const ly = this.labelY === null ? targetY : this.labelY + (targetY - this.labelY) * 0.12;
		this.labelY = ly;

		ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
		ctx.fillRect(lx, ly, tw, th);
		ctx.fillStyle = '#e8e8e8';
		ctx.textAlign = 'left';
		ctx.fillText(line1, lx + 4 * dpr, ly + 13 * dpr);
		ctx.fillText(line2, lx + 4 * dpr, ly + 13 * dpr + lineH);
	}

	private drawGrid(
		ctx: CanvasRenderingContext2D,
		dpr: number,
		pl: number,
		pt: number,
		plotW: number,
		plotH: number,
		viewStart: number,
		viewEnd: number,
		maxW: number,
		toX: (t: number) => number,
		toY: (w: number) => number,
	): void {
		ctx.strokeStyle = GRID_COLOR;
		ctx.lineWidth = dpr;

		const firstT = Math.ceil(viewStart / TIME_GRID_STEP) * TIME_GRID_STEP;
		for (let t = firstT; t <= viewEnd; t += TIME_GRID_STEP) {
			const x = toX(t);
			ctx.beginPath();
			ctx.moveTo(x, pt);
			ctx.lineTo(x, pt + plotH);
			ctx.stroke();
		}

		const weightStep = niceStep(maxW, 4);
		for (let w = weightStep; w < maxW; w += weightStep) {
			const y = toY(w);
			ctx.beginPath();
			ctx.moveTo(pl, y);
			ctx.lineTo(pl + plotW, y);
			ctx.stroke();
		}
	}

	private drawXAxis(
		ctx: CanvasRenderingContext2D,
		dpr: number,
		pl: number,
		pt: number,
		plotW: number,
		plotH: number,
		viewStart: number,
		viewEnd: number,
		toX: (t: number) => number,
	): void {
		ctx.fillStyle = LABEL_COLOR;
		ctx.font = `${10 * dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;
		ctx.textAlign = 'center';

		const firstT = Math.ceil(viewStart / TIME_GRID_STEP) * TIME_GRID_STEP;
		for (let t = firstT; t <= viewEnd; t += TIME_GRID_STEP) {
			const x = toX(t);
			if (x >= pl && x <= pl + plotW) {
				const label = t >= 60 ? `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}` : `${Math.round(t)}s`;
				ctx.fillText(label, x, pt + plotH + 14 * dpr);
			}
		}
	}

	private drawYAxis(
		ctx: CanvasRenderingContext2D,
		dpr: number,
		pl: number,
		_pt: number,
		plotH: number,
		maxW: number,
		toY: (w: number) => number,
	): void {
		ctx.fillStyle = LABEL_COLOR;
		ctx.font = `${10 * dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;
		ctx.textAlign = 'right';

		const weightStep = niceStep(maxW, 4);
		for (let w = weightStep; w < maxW; w += weightStep) {
			ctx.fillText(`${Math.round(w)}`, pl - 4 * dpr, toY(w) + 3 * dpr);
		}
	}

	private drawLine(
		ctx: CanvasRenderingContext2D,
		dpr: number,
		points: BrewProfilePoint[],
		toX: (t: number) => number,
		toY: (w: number) => number,
		width: number,
		alpha: number,
	): void {
		if (points.length < 2) return;
		ctx.beginPath();
		ctx.moveTo(toX(points[0].t), toY(points[0].w));
		for (let i = 1; i < points.length; i++) {
			ctx.lineTo(toX(points[i].t), toY(points[i].w));
		}
		ctx.strokeStyle = LINE_COLOR;
		ctx.lineWidth = width * dpr;
		ctx.lineJoin = 'round';
		ctx.globalAlpha = alpha;
		ctx.stroke();
		ctx.globalAlpha = 1;
	}

	private drawTrend(
		ctx: CanvasRenderingContext2D,
		dpr: number,
		points: BrewProfilePoint[],
		toX: (t: number) => number,
		toY: (w: number) => number,
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
	}
}
