import type { BrewProfilePoint } from '../brew/types';
import type { BrewProfileRecorder } from './BrewProfileRecorder';
import { processDetail, processTrend } from '../utils/signal';
import { t as i18t } from '../i18n/index';
import { filterVisible } from './chartMath';
import {
	paintProfileCanvas,
	type ProfileCanvasColors,
	type ProfileCanvasMetrics,
	type ProfileCanvasViewport,
} from './ProfileCanvasPainter';

const CHART_HEIGHT = 220;
const PADDING = { top: 12, right: 12, bottom: 28, left: 40 };
const BG_COLOR = '#0a0a0a';
const GRID_COLOR = '#1a1a1a';
const LABEL_COLOR = '#999';
const LINE_COLOR = '#4a9eff';
const TIME_SCALE = 10;
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

	private colors: ProfileCanvasColors = {
		bg: BG_COLOR,
		grid: GRID_COLOR,
		label: LABEL_COLOR,
		line: LINE_COLOR,
		crosshair: CROSSHAIR_COLOR,
		labelBg: 'rgba(0, 0, 0, 0.8)',
		labelText: '#e8e8e8',
	};

	private resolveColors(): void {
		const style = getComputedStyle(this.canvas);
		const cssVar = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
		this.colors = {
			bg: cssVar('--background-primary', BG_COLOR),
			grid: cssVar('--background-modifier-border', GRID_COLOR),
			label: cssVar('--text-muted', LABEL_COLOR),
			line: LINE_COLOR,
			crosshair: cssVar('--text-faint', CROSSHAIR_COLOR),
			labelBg: cssVar('--background-secondary', 'rgba(0, 0, 0, 0.8)'),
			labelText: cssVar('--text-normal', '#e8e8e8'),
		};
	}

	constructor(container: HTMLElement, height = CHART_HEIGHT, timeScale = TIME_SCALE, scrollable = false) {
		this.timeScale = timeScale;
		this.scrollable = scrollable;
		this.canvas = container.createEl('canvas', { cls: 'brew-profile-canvas' });
		this.canvas.height = height * devicePixelRatio;
		this.canvas.setCssProps({ height: height + 'px' });
		if (!scrollable) this.canvas.setCssProps({ width: '100%' });
		this.ctx = this.canvas.getContext('2d')!;

		if (scrollable) this.attachScrollControls(container);

		this.ro = new ResizeObserver(() => this.syncWidth());
		this.ro.observe(container);
		this.syncWidth();
	}

	private attachScrollControls(container: HTMLElement): void {
		this.scrollContainer = container;
		container.tabIndex = 0;
		container.setCssProps({ outline: 'none' });
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
		});
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

	private scheduleCrosshairRender(): void {
		if (this.crosshairRaf) return;
		this.crosshairRaf = window.requestAnimationFrame(() => {
			this.crosshairRaf = 0;
			if (this.staticPoints) this.render(this.staticPoints);
		});
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
			this.scheduleCrosshairRender();
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
			window.cancelAnimationFrame(this.crosshairRaf);
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
			} else if (this.recorder) {
				this.render(this.recorder.getPoints());
			} else {
				this.render([]);
			}
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
		let lastLen = -1;
		const tick = () => {
			const points = this.recorder!.getPoints();
			if (points.length !== lastLen) {
				lastLen = points.length;
				this.render(points);
			}
			this.rafId = window.requestAnimationFrame(tick);
		};
		this.rafId = window.requestAnimationFrame(tick);
	}

	stopLive(): void {
		if (this.rafId) {
			window.cancelAnimationFrame(this.rafId);
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

	private getMetrics(): ProfileCanvasMetrics {
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

	private computeScale(m: ProfileCanvasMetrics): ProfileCanvasViewport {
		const dur = this.viewDuration();
		const viewEnd = this.viewStart + dur;
		let maxW = 10;
		for (const p of this.cachedDetail) if (p.w > maxW) maxW = p.w;
		maxW *= 1.1;

		const toX = (t: number) => m.pl + ((t - this.viewStart) / dur) * m.plotW;
		const toY = (w: number) => m.pt + m.plotH - (w / maxW) * m.plotH;

		return {
			start: this.viewStart,
			end: viewEnd,
			maxWeight: maxW,
			toX,
			toY,
		};
	}

	private getProcessedData(viewEnd: number) {
		const visibleDetail = filterVisible(this.cachedDetail, this.viewStart, viewEnd);
		const visibleTrend = filterVisible(this.cachedTrend, this.viewStart, viewEnd);
		return { visibleDetail, visibleTrend };
	}

	private render(points: BrewProfilePoint[]): void {
		const m = this.getMetrics();
		this.resolveColors();

		if (points.length === 0) {
			paintProfileCanvas({
				ctx: this.ctx,
				metrics: m,
				viewport: null,
				detail: [],
				trend: [],
				crosshair: null,
				colors: this.colors,
			});
			return;
		}

		this.updateCache(points);
		if (this.recorder) {
			this.viewStart = Math.max(0, points[points.length - 1].t - this.viewDuration());
		}
		const viewport = this.computeScale(m);
		const { visibleDetail, visibleTrend } = this.getProcessedData(viewport.end);
		const crosshair =
			this.crosshairT === null
				? null
				: {
						t: this.crosshairT,
						trend: this.cachedTrend,
						labelY: this.labelY,
						labels: {
							weight: i18t('chart.weight'),
							flow: i18t('chart.flow'),
							time: i18t('chart.time'),
						},
					};
		const result = paintProfileCanvas({
			ctx: this.ctx,
			metrics: m,
			viewport,
			detail: visibleDetail,
			trend: visibleTrend,
			crosshair,
			colors: this.colors,
		});
		if (crosshair) {
			this.labelY = result.labelY;
			if (result.needsAnimationFrame) this.scheduleCrosshairRender();
		}
	}
}
