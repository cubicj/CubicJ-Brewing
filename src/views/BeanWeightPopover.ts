import { Notice } from 'obsidian';
import type { BeanInfo } from '../brew/types';
import type { VaultDataService } from '../services/VaultDataService';
import { t } from '../i18n/index';

export interface WeightPopoverOptions {
	inModal?: boolean;
}

export function openWeightPopover(
	anchor: HTMLElement,
	bean: BeanInfo,
	vaultData: VaultDataService,
	onSave: () => void,
	getScaleWeight: (() => number | null) | null,
	options: WeightPopoverOptions = {},
): void {
	document.querySelector('.bean-weight-popover')?.remove();

	const popover = document.body.createDiv({ cls: 'bean-weight-popover' });
	if (options.inModal) popover.addClass('is-in-modal');

	const currentRow = popover.createDiv({ cls: 'bwp-current' });
	currentRow.createSpan({ text: t('bean.remainingLabel') });
	currentRow.createSpan({ text: bean.weight != null ? `${bean.weight}g` : 'N/A' });

	const inputRow = popover.createDiv({ cls: 'bwp-input-row' });
	const input = inputRow.createEl('input', {
		type: 'number',
		cls: 'bwp-input',
		attr: { placeholder: '0', step: '0.1', min: '0' },
	});
	inputRow.createSpan({ cls: 'bwp-unit', text: 'g' });

	const scaleWeight = getScaleWeight?.();
	if (scaleWeight != null) {
		const autoBtn = inputRow.createEl('button', {
			text: 'Auto',
			cls: 'bwp-auto',
			attr: { 'aria-label': t('bean.getScaleWeight') },
		});
		autoBtn.addEventListener('click', () => {
			const w = getScaleWeight?.();
			if (w != null) input.value = String(w);
		});
	}

	const actions = popover.createDiv({ cls: 'bwp-actions' });
	const actionDefs: { label: string; calc: (val: number, cur: number) => number; cls?: string }[] = [
		{ label: t('bean.settings'), calc: (val) => val },
		{ label: t('bean.add'), calc: (val, cur) => Math.round((cur + val) * 10) / 10 },
		{ label: t('bean.use'), calc: (val, cur) => Math.max(0, Math.round((cur - val) * 10) / 10), cls: 'is-muted' },
	];
	for (const def of actionDefs) {
		const btn = actions.createEl('button', {
			text: def.label,
			cls: `bwp-action${def.cls ? ` ${def.cls}` : ''}`,
		});
		btn.addEventListener('click', () => void applyAction(def.calc));
	}

	const depletedBtn = popover.createEl('button', {
		text: t('bean.depleted'),
		cls: 'bwp-depleted',
	});
	depletedBtn.addEventListener('click', () => {
		void (async () => {
			const statusResult = await vaultData.setBeanStatus(bean.path, 'finished');
			if (!statusResult.ok) {
				console.error(`[BeanWeightPopover] depleted failed: [${statusResult.error.code}] ${statusResult.error.message}`);
				new Notice(t('error.beanUpdate'));
				return;
			}
			const weightResult = await vaultData.setWeight(bean.path, null);
			if (weightResult.ok) {
				bean.weight = null;
			} else {
				console.error(`[BeanWeightPopover] weight clear failed: [${weightResult.error.code}] ${weightResult.error.message}`);
			}
			onSave();
			close();
		})();
	});

	const close = () => {
		popover.remove();
		document.removeEventListener('pointerdown', onOutside);
	};

	const applyAction = async (calc: (val: number, cur: number) => number) => {
		const val = parseFloat(input.value);
		if (isNaN(val) || val < 0) return;
		const newWeight = calc(val, bean.weight ?? 0);
		const weightResult = await vaultData.setWeight(bean.path, newWeight);
		if (weightResult.ok) {
			bean.weight = newWeight;
			onSave();
			close();
		} else {
			console.error(`[BeanWeightPopover] weight update failed: [${weightResult.error.code}] ${weightResult.error.message}`);
			new Notice(t('error.beanUpdate'));
		}
	};

	input.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') close();
	});

	const onOutside = (e: PointerEvent) => {
		const target = e.target instanceof Node ? e.target : null;
		if (!popover.contains(target) && target !== anchor) close();
	};
	window.setTimeout(() => document.addEventListener('pointerdown', onOutside), 0);

	const rect = anchor.getBoundingClientRect();
	popover.style.top = `${rect.top}px`;
	popover.style.left = `${rect.right}px`;

	window.requestAnimationFrame(() => {
		const popRect = popover.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;

		let top = rect.top - popRect.height - 6;
		let left = rect.left + rect.width / 2 - popRect.width / 2;

		if (top < 4) top = rect.bottom + 6;
		if (left < 4) left = 4;
		if (left + popRect.width > vw - 4) left = vw - popRect.width - 4;
		if (top + popRect.height > vh - 4) top = vh - popRect.height - 4;

		popover.style.top = `${top}px`;
		popover.style.left = `${left}px`;
		popover.classList.add('is-positioned');
		input.focus();
	});
}
