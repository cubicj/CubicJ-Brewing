import type { BrewProfilePoint } from '../brew/types';
import { flowRateAt, interpolateWeight, niceStep } from './chartMath';

const DETAIL_ALPHA = 0.35;
const TIME_GRID_STEP = 10;

export interface ProfileCanvasMetrics {
	dpr: number;
	cw: number;
	ch: number;
	pl: number;
	pr: number;
	pt: number;
	pb: number;
	plotW: number;
	plotH: number;
}

export interface ProfileCanvasViewport {
	start: number;
	end: number;
	maxWeight: number;
	toX: (t: number) => number;
	toY: (weight: number) => number;
}

export interface ProfileCanvasColors {
	bg: string;
	grid: string;
	label: string;
	line: string;
	crosshair: string;
	labelBg: string;
	labelText: string;
}

interface ProfileCanvasLabels {
	weight: string;
	flow: string;
	time: string;
}

interface ProfileCanvasCrosshair {
	t: number;
	trend: BrewProfilePoint[];
	labelY: number | null;
	labels: ProfileCanvasLabels;
}

export interface ProfileCanvasPaintInput {
	ctx: CanvasRenderingContext2D;
	metrics: ProfileCanvasMetrics;
	viewport: ProfileCanvasViewport | null;
	detail: BrewProfilePoint[];
	trend: BrewProfilePoint[];
	crosshair: ProfileCanvasCrosshair | null;
	colors: ProfileCanvasColors;
}

export interface ProfileCanvasPaintResult {
	labelY: number | null;
	needsAnimationFrame: boolean;
}

export function paintProfileCanvas(input: ProfileCanvasPaintInput): ProfileCanvasPaintResult {
	const { ctx, metrics: m, viewport, detail, trend, crosshair, colors } = input;
	const result = {
		labelY: crosshair?.labelY ?? null,
		needsAnimationFrame: false,
	};

	ctx.clearRect(0, 0, m.cw, m.ch);
	ctx.fillStyle = colors.bg;
	ctx.fillRect(0, 0, m.cw, m.ch);

	if (!viewport) {
		ctx.fillStyle = colors.label;
		ctx.font = `${12 * m.dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;
		ctx.textAlign = 'center';
		ctx.fillText('⏳', m.cw / 2, m.ch / 2);
		return result;
	}

	ctx.save();
	ctx.beginPath();
	ctx.rect(m.pl, m.pt, m.plotW, m.plotH);
	ctx.clip();

	drawGrid(ctx, m, viewport, colors);
	drawLine(ctx, m.dpr, detail, viewport.toX, viewport.toY, 1, DETAIL_ALPHA, colors.line);
	drawTrend(ctx, m.dpr, trend, viewport.toX, viewport.toY, colors.line);

	if (crosshair) {
		const crosshairResult = drawCrosshair(ctx, m, viewport, crosshair, colors);
		result.labelY = crosshairResult.labelY;
		result.needsAnimationFrame = crosshairResult.needsAnimationFrame;
	}

	ctx.restore();

	drawXAxis(ctx, m, viewport, colors.label);
	drawYAxis(ctx, m, viewport, colors.label);
	return result;
}

function drawCrosshair(
	ctx: CanvasRenderingContext2D,
	m: ProfileCanvasMetrics,
	viewport: ProfileCanvasViewport,
	crosshair: ProfileCanvasCrosshair,
	colors: ProfileCanvasColors,
): ProfileCanvasPaintResult {
	const result = { labelY: crosshair.labelY, needsAnimationFrame: false };
	if (crosshair.trend.length < 2) return result;
	const t = Math.max(0, Math.min(crosshair.t, crosshair.trend[crosshair.trend.length - 1].t));
	const x = viewport.toX(t);
	if (x < m.pl || x > m.pl + m.plotW) return result;

	const weight = interpolateWeight(crosshair.trend, t);

	ctx.beginPath();
	ctx.moveTo(x, m.pt);
	ctx.lineTo(x, m.pt + m.plotH);
	ctx.strokeStyle = colors.crosshair;
	ctx.lineWidth = m.dpr;
	ctx.setLineDash([4 * m.dpr, 4 * m.dpr]);
	ctx.stroke();
	ctx.setLineDash([]);

	const dotY = viewport.toY(weight);
	ctx.beginPath();
	ctx.arc(x, dotY, 3 * m.dpr, 0, Math.PI * 2);
	ctx.fillStyle = colors.line;
	ctx.fill();

	const flow = flowRateAt(crosshair.trend, t);
	return drawCrosshairLabel(ctx, m, x, dotY, weight, flow, t, crosshair, colors);
}

function drawCrosshairLabel(
	ctx: CanvasRenderingContext2D,
	m: ProfileCanvasMetrics,
	x: number,
	dotY: number,
	weight: number,
	flow: number | undefined,
	t: number,
	crosshair: ProfileCanvasCrosshair,
	colors: ProfileCanvasColors,
): ProfileCanvasPaintResult {
	const tSec = Math.round(t);
	const tLabel = tSec >= 60 ? `${Math.floor(tSec / 60)}m ${tSec % 60}s` : `${tSec}s`;
	const lines = [`${crosshair.labels.weight}: ${weight.toFixed(1)}g`];
	if (flow !== undefined) lines.push(`${crosshair.labels.flow}: ${flow.toFixed(1)}g/s`);
	lines.push(`${crosshair.labels.time}: ${tLabel}`);
	ctx.font = `${11 * m.dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;
	const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 8 * m.dpr;
	const lineHeight = 16 * m.dpr;
	const textHeight = lineHeight * lines.length + 4 * m.dpr;

	let labelX = x + 8 * m.dpr;
	if (labelX + textWidth > m.pl + m.plotW) labelX = x - textWidth - 4 * m.dpr;
	let targetY = dotY - textHeight - 6 * m.dpr;
	if (targetY < m.pt) targetY = dotY + 6 * m.dpr;
	let labelY: number;
	let needsAnimationFrame = false;
	if (crosshair.labelY === null || Math.abs(targetY - crosshair.labelY) < 0.5) {
		labelY = targetY;
	} else {
		labelY = crosshair.labelY + (targetY - crosshair.labelY) * 0.12;
		needsAnimationFrame = true;
	}

	ctx.fillStyle = colors.labelBg;
	ctx.fillRect(labelX, labelY, textWidth, textHeight);
	ctx.fillStyle = colors.labelText;
	ctx.textAlign = 'left';
	lines.forEach((line, index) => {
		ctx.fillText(line, labelX + 4 * m.dpr, labelY + 13 * m.dpr + index * lineHeight);
	});
	return { labelY, needsAnimationFrame };
}

function drawGrid(
	ctx: CanvasRenderingContext2D,
	m: ProfileCanvasMetrics,
	viewport: ProfileCanvasViewport,
	colors: ProfileCanvasColors,
): void {
	ctx.strokeStyle = colors.grid;
	ctx.lineWidth = m.dpr;

	const firstT = Math.ceil(viewport.start / TIME_GRID_STEP) * TIME_GRID_STEP;
	for (let t = firstT; t <= viewport.end; t += TIME_GRID_STEP) {
		const x = viewport.toX(t);
		ctx.beginPath();
		ctx.moveTo(x, m.pt);
		ctx.lineTo(x, m.pt + m.plotH);
		ctx.stroke();
	}

	const weightStep = niceStep(viewport.maxWeight, 4);
	for (let weight = weightStep; weight < viewport.maxWeight; weight += weightStep) {
		const y = viewport.toY(weight);
		ctx.beginPath();
		ctx.moveTo(m.pl, y);
		ctx.lineTo(m.pl + m.plotW, y);
		ctx.stroke();
	}
}

function drawXAxis(
	ctx: CanvasRenderingContext2D,
	m: ProfileCanvasMetrics,
	viewport: ProfileCanvasViewport,
	labelColor: string,
): void {
	ctx.fillStyle = labelColor;
	ctx.font = `${10 * m.dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;
	ctx.textAlign = 'center';

	const firstT = Math.ceil(viewport.start / TIME_GRID_STEP) * TIME_GRID_STEP;
	for (let t = firstT; t <= viewport.end; t += TIME_GRID_STEP) {
		const x = viewport.toX(t);
		if (x >= m.pl && x <= m.pl + m.plotW) {
			const label =
				t >= 60 ? `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}` : `${Math.round(t)}s`;
			ctx.fillText(label, x, m.pt + m.plotH + 14 * m.dpr);
		}
	}
}

function drawYAxis(
	ctx: CanvasRenderingContext2D,
	m: ProfileCanvasMetrics,
	viewport: ProfileCanvasViewport,
	labelColor: string,
): void {
	ctx.fillStyle = labelColor;
	ctx.font = `${10 * m.dpr}px -apple-system, BlinkMacSystemFont, sans-serif`;
	ctx.textAlign = 'right';

	const weightStep = niceStep(viewport.maxWeight, 4);
	for (let weight = weightStep; weight < viewport.maxWeight; weight += weightStep) {
		ctx.fillText(`${Math.round(weight)}`, m.pl - 4 * m.dpr, viewport.toY(weight) + 3 * m.dpr);
	}
}

function drawLine(
	ctx: CanvasRenderingContext2D,
	dpr: number,
	points: BrewProfilePoint[],
	toX: (t: number) => number,
	toY: (weight: number) => number,
	width: number,
	alpha: number,
	lineColor: string,
): void {
	if (points.length < 2) return;
	ctx.beginPath();
	ctx.moveTo(toX(points[0].t), toY(points[0].w));
	for (let index = 1; index < points.length; index++) {
		ctx.lineTo(toX(points[index].t), toY(points[index].w));
	}
	ctx.strokeStyle = lineColor;
	ctx.lineWidth = width * dpr;
	ctx.lineJoin = 'round';
	ctx.globalAlpha = alpha;
	ctx.stroke();
	ctx.globalAlpha = 1;
}

function drawTrend(
	ctx: CanvasRenderingContext2D,
	dpr: number,
	points: BrewProfilePoint[],
	toX: (t: number) => number,
	toY: (weight: number) => number,
	lineColor: string,
): void {
	if (points.length < 2) return;

	ctx.beginPath();
	ctx.moveTo(toX(points[0].t), toY(points[0].w));
	for (let index = 1; index < points.length; index++) {
		ctx.lineTo(toX(points[index].t), toY(points[index].w));
	}

	ctx.strokeStyle = lineColor;
	ctx.lineWidth = 2 * dpr;
	ctx.lineJoin = 'round';
	ctx.stroke();
}
