import type { GrinderConfig, GrinderRpmConfig } from '../brew/types';
import { t } from '../i18n/index';

export interface GrinderFormOptions {
	initial?: GrinderConfig;
	submitLabel: string;
	onSubmit: (grinder: GrinderConfig) => void | Promise<void>;
}

export function renderGrinderForm(container: HTMLElement, options: GrinderFormOptions): HTMLElement {
	const formEl = container.createDiv({ cls: 'dm-equip-grinder-form' });
	const nameInput = formEl.createEl('input', {
		type: 'text',
		cls: 'dm-equip-input',
		placeholder: t('equip.name'),
		attr: { spellcheck: 'false' },
	});
	nameInput.value = options.initial?.name ?? '';

	const rangeRow = formEl.createDiv({ cls: 'dm-equip-grinder-row' });
	rangeRow.createSpan({ text: t('equip.grindRange') });
	const minInput = rangeRow.createEl('input', {
		type: 'number',
		cls: 'dm-equip-input dm-equip-num',
		placeholder: 'min',
	});
	rangeRow.createSpan({ text: '~' });
	const maxInput = rangeRow.createEl('input', {
		type: 'number',
		cls: 'dm-equip-input dm-equip-num',
		placeholder: 'max',
	});

	const stepRow = formEl.createDiv({ cls: 'dm-equip-grinder-row' });
	stepRow.createSpan({ text: t('equip.stepSize') });
	const stepSelect = stepRow.createEl('select', { cls: 'dm-equip-select' });
	for (const s of [0.01, 0.1, 1]) {
		stepSelect.createEl('option', { text: String(s), value: String(s) });
	}
	stepSelect.value = String(options.initial?.step ?? 0.1);
	minInput.value = String(options.initial?.min ?? 0);
	maxInput.value = String(options.initial?.max ?? 50);

	const rpmToggleRow = formEl.createDiv({ cls: 'dm-equip-grinder-row' });
	const rpmLabel = rpmToggleRow.createEl('label', { cls: 'dm-equip-rpm-toggle' });
	const rpmCheckbox = rpmLabel.createEl('input', { type: 'checkbox' });
	rpmLabel.createSpan({ text: t('equip.rpmVariable') });

	const rpmFields = formEl.createDiv({ cls: 'dm-equip-rpm-fields' });
	const rpmRangeRow = rpmFields.createDiv({ cls: 'dm-equip-grinder-row' });
	rpmRangeRow.createSpan({ text: t('equip.rpmRange') });
	const rpmMinInput = rpmRangeRow.createEl('input', {
		type: 'number',
		cls: 'dm-equip-input dm-equip-num',
		placeholder: 'min',
	});
	rpmRangeRow.createSpan({ text: '~' });
	const rpmMaxInput = rpmRangeRow.createEl('input', {
		type: 'number',
		cls: 'dm-equip-input dm-equip-num',
		placeholder: 'max',
	});

	const rpmStepRow = rpmFields.createDiv({ cls: 'dm-equip-grinder-row' });
	rpmStepRow.createSpan({ text: t('equip.stepSize') });
	const rpmStepInput = rpmStepRow.createEl('input', { type: 'number', cls: 'dm-equip-input dm-equip-num' });

	const rpmCurrentRow = rpmFields.createDiv({ cls: 'dm-equip-grinder-row' });
	rpmCurrentRow.createSpan({ text: t('equip.rpmCurrent') });
	const rpmCurrentInput = rpmCurrentRow.createEl('input', { type: 'number', cls: 'dm-equip-input dm-equip-num' });

	const initialRpm = options.initial?.rpm;
	rpmCheckbox.checked = initialRpm != null;
	rpmMinInput.value = String(initialRpm?.min ?? 300);
	rpmMaxInput.value = String(initialRpm?.max ?? 2000);
	rpmStepInput.value = String(initialRpm?.step ?? 10);
	rpmCurrentInput.value = String(initialRpm?.current ?? 1000);

	const syncRpmVisibility = () => {
		rpmFields.style.display = rpmCheckbox.checked ? '' : 'none';
	};
	rpmCheckbox.addEventListener('change', syncRpmVisibility);
	syncRpmVisibility();

	const btnRow = formEl.createDiv({ cls: 'dm-equip-grinder-actions' });
	const saveBtn = btnRow.createEl('button', { text: options.submitLabel, cls: 'dm-btn dm-btn-accent' });
	const cancelBtn = btnRow.createEl('button', { text: t('common.cancel'), cls: 'dm-btn dm-btn-muted' });

	nameInput.focus();

	const readRpm = (): GrinderRpmConfig | undefined => {
		if (!rpmCheckbox.checked) return undefined;
		const min = parseFloat(rpmMinInput.value) || 0;
		const max = Math.max(min, parseFloat(rpmMaxInput.value) || min);
		const step = parseFloat(rpmStepInput.value) || 10;
		const parsed = parseFloat(rpmCurrentInput.value);
		const current = isNaN(parsed) ? min : Math.max(min, Math.min(max, parsed));
		return { min, max, step, current };
	};

	saveBtn.addEventListener('click', () => {
		const name = nameInput.value.trim();
		if (!name) return;
		const grinder: GrinderConfig = {
			name,
			step: parseFloat(stepSelect.value),
			min: parseFloat(minInput.value) || 0,
			max: parseFloat(maxInput.value) || 50,
		};
		const rpm = readRpm();
		if (rpm) grinder.rpm = rpm;
		void options.onSubmit(grinder);
	});
	cancelBtn.addEventListener('click', () => formEl.remove());
	nameInput.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') saveBtn.click();
		if (e.key === 'Escape') formEl.remove();
	});
	return formEl;
}
