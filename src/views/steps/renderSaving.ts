import { Notice } from 'obsidian';
import { t } from '../../i18n/index';
import { createStepper } from '../Stepper';
import { attachScaleAutoBtn } from '../FormHelpers';
import type { StepRenderContext } from '../StepRenderers';

export function renderSaving(container: HTMLElement, ctx: StepRenderContext): void {
	container.addClass('brew-flow-saving');
	const sel = ctx.flowState.selection;
	const isReview = ctx.flowState.phase === 'review';

	const needsWater = sel.method === 'filter' || (sel.method === 'espresso' && sel.drink === 'americano');
	const needsMilk = sel.method === 'espresso' && sel.drink === 'latte';
	if (isReview && (needsWater || needsMilk)) {
		const weightForm = container.createDiv({ cls: 'brew-flow-form' });
		const label = needsMilk ? t('form.milk') : t('form.addition');
		const weightStepper = createStepper(weightForm, {
			label,
			initial: (needsMilk ? sel.milkWeight : sel.waterWeight) ?? 0,
			min: 0,
			max: 1000,
			step: 0.1,
			format: (v) => `${v.toFixed(1)}g`,
			pxPerStep: 12,
			onChange: (v) => {
				if (needsMilk) sel.milkWeight = v;
				else sel.waterWeight = v;
			},
		});
		attachScaleAutoBtn(weightStepper, ctx.getWeightText);
	}

	container.createEl('h4', { text: t('form.memo'), cls: 'brew-flow-section-label' });
	const noteEl = container.createEl('textarea', { cls: 'brew-flow-note', attr: { spellcheck: 'false' } });
	noteEl.placeholder = '';
	if (sel.note) noteEl.value = sel.note;
	noteEl.addEventListener('input', () => {
		sel.note = noteEl.value;
	});

	let roReady = false;
	const ro = new ResizeObserver(() => {
		if (!roReady) {
			roReady = true;
			return;
		}
		const body = noteEl.closest<HTMLElement>('.brew-accordion-body');
		if (body?.classList.contains('is-open') && body.style.maxHeight !== '0px') {
			body.setCssStyles({ transition: 'none', maxHeight: body.scrollHeight + 'px' });
			void body.offsetHeight;
			body.setCssProps({ transition: '' });
		}
	});
	ro.observe(noteEl);
	ctx.registerCleanup(() => ro.disconnect());

	if (!isReview) return;

	const btnRow = container.createDiv({ cls: 'brewing-controls' });
	const doneBtn = btnRow.createEl('button', { text: t('form.save'), cls: 'brewing-ctrl-btn brew-flow-save-btn' });

	const setRedoDisabled = (disabled: boolean) => {
		const redoBtn = ctx.accordion.getStepPanel('brewing')?.querySelector<HTMLButtonElement>('.brew-flow-redo-btn');
		if (redoBtn) redoBtn.disabled = disabled;
	};

	const saveRecord = async () => {
		if (!ctx.runCoordinator.beginSave()) return;
		const gen = ctx.runCoordinator.getGeneration();
		doneBtn.disabled = true;
		doneBtn.textContent = t('brew.saving');
		setRedoDisabled(true);
		try {
			const note = noteEl.value.trim() || undefined;
			const points = [...ctx.recorder.getPoints()];
			const bean = sel.bean;
			const record = ctx.flowState.buildRecord(note, undefined);
			let profilePath: string | undefined;
			if (points.length > 0) {
				const saveResult = await ctx.profileStorage.save(record.timestamp, points);
				if (!saveResult.ok) throw new Error(saveResult.error.message);
				profilePath = saveResult.data;
			}
			const finalRecord = profilePath ? { ...record, profilePath } : record;
			const addResult = await ctx.plugin.recordService.add(finalRecord);
			if (!addResult.ok) throw new Error(addResult.error.message);
			ctx.plugin.pluginLogger?.log('FLOW', `record saved — ${finalRecord.method} ${finalRecord.bean}`);
			if (bean?.weight != null) {
				const newWeight = Math.max(0, Math.round((bean.weight - finalRecord.dose) * 10) / 10);
				const weightResult = await ctx.plugin.vaultData.setWeight(bean.path, newWeight);
				if (weightResult.ok) {
					bean.weight = newWeight;
				} else {
					ctx.plugin.pluginLogger?.log(
						'FLOW',
						`weight update failed: [${weightResult.error.code}] ${weightResult.error.message}`,
					);
					new Notice(t('brew.weightUpdateFailed'));
				}
			}
			new Notice(t('brew.saved'));
			if (ctx.runCoordinator.getGeneration() === gen) ctx.resetFlow();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			ctx.plugin.pluginLogger?.log('FLOW', `record save failed: ${message}`);
			new Notice(t('brew.saveFailed'));
			doneBtn.disabled = false;
			doneBtn.textContent = t('form.save');
		} finally {
			ctx.runCoordinator.endSave();
			setRedoDisabled(false);
		}
	};
	doneBtn.addEventListener('click', () => {
		void saveRecord();
	});
}
