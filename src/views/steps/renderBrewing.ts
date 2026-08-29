import { Notice } from 'obsidian';
import { estimateYield } from '../../brew/yieldEstimator';
import { BrewProfileChart } from '../BrewProfileChart';
import { BrewProfileModal } from '../BrewProfileModal';
import { createStepper } from '../Stepper';
import { t } from '../../i18n/index';
import type { StepRenderContext } from '../StepRenderers';

export function renderBrewing(container: HTMLElement, ctx: StepRenderContext): void {
	container.addClass('brew-flow-active-brew');
	if (ctx.flowState.phase === 'review') {
		renderReview(container, ctx);
		return;
	}
	const isEspresso = ctx.flowState.selection.method === 'espresso';
	const scaleConnected = ctx.plugin.acaiaService?.state === 'connected';

	if (isEspresso) {
		container.createDiv({ cls: 'brew-flow-espresso-msg', text: t('brew.espressoMsg') });
		const controls = container.createDiv({ cls: 'brewing-controls' });
		const doneBtn = controls.createEl('button', {
			text: t('brew.extractionDone'),
			cls: 'brewing-ctrl-btn brew-flow-stop-btn',
		});
		doneBtn.addEventListener('click', () => {
			ctx.flowState.finishBrewing(undefined, undefined);
			ctx.renderContent();
		});
		return;
	}

	const recipe = ctx.flowState.selection.recipe;
	if (recipe && recipe.steps.length > 0) {
		const stepsEl = container.createDiv({ cls: 'brew-flow-recipe-steps' });
		stepsEl.createEl('h4', { text: recipe.name });
		for (const step of recipe.steps) {
			const stepEl = stepsEl.createDiv({ cls: 'brew-flow-recipe-step' });
			const parts = [step.time];
			if (step.target) parts.push(`→ ${step.target}g`);
			if (step.note) parts.push(step.note);
			stepEl.textContent = parts.join(' ');
		}
	}

	if (ctx.flowState.brewingStarted) {
		let chart: BrewProfileChart | null = null;
		if (scaleConnected) {
			const chartContainer = container.createDiv({ cls: 'brew-profile-container' });
			const liveChart = new BrewProfileChart(chartContainer);
			chart = liveChart;
			ctx.registerCleanup(() => liveChart.destroy());
			liveChart.startLive(ctx.recorder);
		}
		const controls = container.createDiv({ cls: 'brewing-controls' });
		const stopBtn = controls.createEl('button', { text: t('brew.done'), cls: 'brewing-ctrl-btn brew-flow-stop-btn' });
		const stopBrewing = async () => {
			try {
				if (chart) chart.stopLive();
				if (scaleConnected) {
					ctx.recorder.stop();
					await ctx.timerController.freeze();
					const totalSeconds = ctx.timerController.getElapsedSeconds();
					const yieldGrams =
						(ctx.flowState.selection.method === 'filter' ? estimateYield(ctx.recorder.getPoints()) : undefined) ??
						(parseFloat(ctx.getWeightText()) || undefined);
					ctx.flowState.finishBrewing(totalSeconds || undefined, yieldGrams);
				} else {
					ctx.flowState.finishBrewing(undefined, undefined);
				}
				ctx.renderContent();
			} catch (err) {
				console.error('[StepRenderers] brew stop failed:', err);
				new Notice(t('brew.unexpectedError'));
			}
		};
		stopBtn.addEventListener('click', () => {
			void stopBrewing();
		});
		const cancelBtn = controls.createEl('button', {
			text: t('common.cancel'),
			cls: 'brewing-ctrl-btn brew-flow-cancel-btn',
		});
		let cancelPending = false;
		const cancelBrewing = async () => {
			if (cancelPending) return;
			cancelPending = true;
			stopBtn.disabled = true;
			cancelBtn.disabled = true;
			try {
				if (chart) chart.stopLive();
				ctx.recorder.reset();
				ctx.flowState.cancelBrewingRun();
				if (scaleConnected) await ctx.timerController.cancelRun();
				else ctx.timerController.resetToIdle();
			} catch (err) {
				console.error('[StepRenderers] brew cancel failed:', err);
				new Notice(t('brew.unexpectedError'));
			} finally {
				ctx.renderContent('brewing');
			}
		};
		cancelBtn.addEventListener('click', () => {
			void cancelBrewing();
		});
	} else {
		const controls = container.createDiv({ cls: 'brewing-controls' });
		const startBtn = controls.createEl('button', {
			text: t('brew.startBrewing'),
			cls: 'brewing-ctrl-btn brew-flow-start-btn',
		});
		const startBrewing = async () => {
			try {
				ctx.flowState.beginBrewingRun();
				if (scaleConnected) {
					ctx.recorder.start();
					await ctx.timerController.handleTimerClick();
				}
				ctx.accordion.update();
				ctx.accordion.scrollToStep('brewing');
			} catch (err) {
				console.error('[StepRenderers] brew start failed:', err);
				new Notice(t('brew.unexpectedError'));
			}
		};
		startBtn.addEventListener('click', () => {
			void startBrewing();
		});
	}
}

function renderReview(container: HTMLElement, ctx: StepRenderContext): void {
	const sel = ctx.flowState.selection;
	const points = ctx.recorder.getPoints();

	if (points.length > 0) {
		const chartWrapper = container.createDiv({ cls: 'brew-profile-wrapper' });
		const expandBtn = chartWrapper.createEl('button', { text: '⛶', cls: 'brew-profile-expand-btn' });
		expandBtn.setAttribute('aria-label', t('brew.expand'));
		expandBtn.addEventListener('click', () => {
			const pts = ctx.recorder.getPoints();
			const bean = sel.bean?.name ?? '';
			new BrewProfileModal(ctx.plugin.app, bean, { type: 'expand', points: pts }).open();
		});
		const chartContainer = chartWrapper.createDiv({ cls: 'brew-profile-container' });
		const staticChart = new BrewProfileChart(chartContainer);
		ctx.registerCleanup(() => staticChart.destroy());
		staticChart.renderStatic(points);
	} else {
		const manualForm = container.createDiv({ cls: 'brew-flow-form' });
		createStepper(manualForm, {
			label: t('modal.time'),
			initial: sel.time ?? 0,
			min: 0,
			max: 600,
			step: 1,
			format: (v) => t('modal.seconds', { n: v }),
			pxPerStep: 6,
			onChange: (v) => {
				ctx.flowState.updateVariables({ time: v || undefined });
				ctx.accordion.updateSummaries();
			},
		});
		createStepper(manualForm, {
			label: t('modal.extractionYield'),
			initial: sel.yield ?? 0,
			min: 0,
			max: 1000,
			step: 0.1,
			format: (v) => `${v.toFixed(1)}g`,
			pxPerStep: 12,
			onChange: (v) => {
				ctx.flowState.updateVariables({ yield: v || undefined });
				ctx.accordion.updateSummaries();
			},
		});
	}

	const controls = container.createDiv({ cls: 'brewing-controls' });
	const redoBtn = controls.createEl('button', { text: t('brew.redoBrew'), cls: 'brewing-ctrl-btn brew-flow-redo-btn' });
	redoBtn.addEventListener('click', () => {
		ctx.flowState.redoBrewing();
		ctx.recorder.reset();
		ctx.renderContent();
	});
}
