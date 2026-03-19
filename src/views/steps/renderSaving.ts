import { Notice } from 'obsidian';
import { t } from '../../i18n/index';
import { createStepper } from '../Stepper';
import { attachScaleAutoBtn } from '../FormHelpers';
import type { StepRenderContext } from '../StepRenderers';

let activeSavingRo: ResizeObserver | null = null;

export function cleanupSavingRo(): void {
	if (activeSavingRo) {
		activeSavingRo.disconnect();
		activeSavingRo = null;
	}
}

export function renderSaving(container: HTMLElement, ctx: StepRenderContext): void {
	container.addClass('brew-flow-saving');
	const sel = ctx.flowState.selection;

	if (!sel.time && sel.method === 'espresso') {
		const manualForm = container.createDiv({ cls: 'brew-flow-form' });
		createStepper(manualForm, {
			label: t('modal.time'),
			initial: 0,
			min: 0,
			max: 120,
			step: 1,
			format: (v) => t('modal.seconds', { n: v }),
			pxPerStep: 6,
			onChange: (v) => {
				ctx.flowState.updateVariables({ time: v || undefined });
			},
		});
		createStepper(manualForm, {
			label: t('modal.extractionYield'),
			initial: 0,
			min: 0,
			max: 200,
			step: 0.1,
			format: (v) => `${v.toFixed(1)}g`,
			pxPerStep: 12,
			onChange: (v) => {
				ctx.flowState.updateVariables({ yield: v || undefined });
			},
		});
	}

	const needsWater = sel.method === 'filter' || (sel.method === 'espresso' && sel.drink === 'americano');
	const needsMilk = sel.method === 'espresso' && sel.drink === 'latte';
	if (needsWater || needsMilk) {
		const weightForm = container.createDiv({ cls: 'brew-flow-form' });
		const label = needsMilk ? t('form.milk') : t('form.addition');
		const weightStepper = createStepper(weightForm, {
			label,
			initial: 0,
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

	cleanupSavingRo();
	let roReady = false;
	activeSavingRo = new ResizeObserver(() => {
		if (!roReady) {
			roReady = true;
			return;
		}
		const body = noteEl.closest('.brew-accordion-body') as HTMLElement | null;
		if (body?.classList.contains('is-open') && body.style.maxHeight !== '0px') {
			body.style.transition = 'none';
			body.style.maxHeight = body.scrollHeight + 'px';
			void body.offsetHeight;
			body.style.transition = '';
		}
	});
	activeSavingRo.observe(noteEl);

	const btnRow = container.createDiv({ cls: 'brewing-controls' });
	const doneBtn = btnRow.createEl('button', { text: t('form.save'), cls: 'brewing-ctrl-btn brew-flow-save-btn' });

	doneBtn.addEventListener('click', async () => {
		doneBtn.disabled = true;
		doneBtn.textContent = t('brew.saving');
		try {
			const note = noteEl.value.trim() || undefined;
			const points = ctx.recorder.getPoints();
			let profilePath: string | undefined;
			if (points.length > 0) {
				const timestamp = new Date().toISOString();
				const saveResult = await ctx.profileStorage.save(timestamp, points);
				if (!saveResult.ok) throw new Error(saveResult.error.message);
				profilePath = saveResult.data;
			}
			const record = ctx.flowState.buildRecord(note, profilePath);
			const addResult = await ctx.plugin.recordService.add(record);
			if (!addResult.ok) throw new Error(addResult.error.message);
			ctx.plugin.pluginLogger?.log('FLOW', `record saved — ${record.method} ${record.bean}`);
			const bean = ctx.flowState.selection.bean;
			if (bean?.weight != null) {
				const newWeight = Math.max(0, Math.round((bean.weight - record.dose) * 10) / 10);
				try {
					await ctx.plugin.vaultData.setWeight(bean.path, newWeight);
					bean.weight = newWeight;
				} catch (weightErr) {
					ctx.plugin.pluginLogger?.log('FLOW', `weight update failed: ${weightErr}`);
					new Notice(t('brew.weightUpdateFailed'));
				}
			}
			new Notice(t('brew.saved'));
			ctx.resetFlow();
		} catch (err) {
			ctx.plugin.pluginLogger?.log('FLOW', `record save failed: ${err}`);
			new Notice(t('brew.saveFailed'));
			doneBtn.disabled = false;
			doneBtn.textContent = t('form.save');
		}
	});
}
