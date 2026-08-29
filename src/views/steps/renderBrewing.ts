import { Notice } from 'obsidian';
import { estimateYield } from '../../brew/yieldEstimator';
import { BrewProfileChart } from '../BrewProfileChart';
import { BrewProfileModal } from '../BrewProfileModal';
import { t } from '../../i18n/index';
import type { StepRenderContext } from '../StepRenderers';

export function renderBrewing(container: HTMLElement, ctx: StepRenderContext): void {
	container.addClass('brew-flow-active-brew');
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
			ctx.accordion.expand('saving');
			ctx.accordion.update();
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

	let chart: BrewProfileChart | null = null;
	const hasProfile = ctx.recorder.getPoints().length > 0;

	if (ctx.flowState.brewingStarted && scaleConnected) {
		const chartContainer = container.createDiv({ cls: 'brew-profile-container' });
		const liveChart = new BrewProfileChart(chartContainer);
		chart = liveChart;
		ctx.registerCleanup(() => liveChart.destroy());
		liveChart.startLive(ctx.recorder);
	} else if (!ctx.flowState.brewingStarted && hasProfile) {
		const chartWrapper = container.createDiv({ cls: 'brew-profile-wrapper' });
		const expandBtn = chartWrapper.createEl('button', { text: '⛶', cls: 'brew-profile-expand-btn' });
		expandBtn.setAttribute('aria-label', t('brew.expand'));
		expandBtn.addEventListener('click', () => {
			const pts = ctx.recorder.getPoints();
			const bean = ctx.flowState.selection.bean?.name ?? '';
			new BrewProfileModal(ctx.plugin.app, bean, { type: 'expand', points: pts }).open();
		});
		const chartContainer = chartWrapper.createDiv({ cls: 'brew-profile-container' });
		const staticChart = new BrewProfileChart(chartContainer);
		ctx.registerCleanup(() => staticChart.destroy());
		staticChart.renderStatic(ctx.recorder.getPoints());
	}

	if (ctx.flowState.brewingStarted) {
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
				ctx.accordion.expand('saving');
				ctx.accordion.update();
			} catch (err) {
				console.error('[StepRenderers] brew stop failed:', err);
				new Notice(t('brew.unexpectedError'));
			}
		};
		stopBtn.addEventListener('click', () => {
			void stopBrewing();
		});
	} else if (!hasProfile) {
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
