import { type App, type MarkdownPostProcessorContext } from 'obsidian';
import type { VaultDataService } from '../services/VaultDataService';
import type { BeanInfo } from '../brew/types';
import { BEAN_NOTE_EXTRA } from '../brew/constants';
import { t } from '../i18n/index';
import { renderActiveBeanRow, renderFinishedBeanRow } from './BeanRowRenderer';

export class BeanCodeBlock {
	private containers: WeakRef<HTMLElement>[] = [];
	private getScaleWeight: (() => number | null) | null = null;

	constructor(
		private app: App,
		private vaultData: VaultDataService,
	) {}

	updateVaultData(vaultData: VaultDataService): void {
		this.vaultData = vaultData;
	}

	setScaleWeightGetter(fn: () => number | null): void {
		this.getScaleWeight = fn;
	}

	register(
		registerFn: (
			lang: string,
			handler: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void,
		) => void,
	): void {
		registerFn('beans', (_source, el, _ctx) => {
			this.containers.push(new WeakRef(el));
			this.render(el);
		});
	}

	refreshAll(): void {
		this.containers = this.containers.filter((ref) => {
			const el = ref.deref();
			if (!el || !el.isConnected) return false;
			this.render(el);
			return true;
		});
	}

	render(el: HTMLElement): void {
		el.empty();
		el.addClass('cb-bean-hub');

		const header = el.createDiv({ cls: 'cb-bean-header' });
		const newBtn = header.createEl('button', { text: t('bean.new'), cls: 'cb-bean-btn cb-bean-new-btn' });
		newBtn.addEventListener('click', () => this.createNewBean());

		const beans = this.vaultData.getAllBeans();
		const active = beans.filter((b) => b.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
		const finished = beans.filter((b) => b.status === 'finished').sort((a, b) => a.name.localeCompare(b.name));

		const deps = {
			vaultData: this.vaultData,
			onNameClick: (bean: BeanInfo) => this.app.workspace.openLinkText(bean.path, ''),
			onStatusChange: () => this.refreshAll(),
			onWeightClick: (anchor: HTMLElement, bean: BeanInfo) =>
				openWeightPopover(anchor, bean, this.vaultData, () => this.refreshAll(), this.getScaleWeight),
		};

		if (active.length > 0) {
			el.createDiv({ cls: 'cb-bean-section-title', text: t('bean.activeBeans') });
			for (const bean of active) renderActiveBeanRow(el, bean, deps);
		}

		if (finished.length > 0) {
			el.createDiv({ cls: 'cb-bean-section-title cb-bean-section-past', text: t('bean.pastBeans') });
			for (const bean of finished) renderFinishedBeanRow(el, bean, deps);
		}

		if (beans.length === 0) {
			el.createDiv({ cls: 'cb-bean-empty', text: t('bean.emptyState') });
		}
	}

	private async createNewBean(): Promise<void> {
		try {
			const path = await this.vaultData.createBeanNote(BEAN_NOTE_EXTRA);
			await this.app.workspace.openLinkText(path, '');
		} catch (err) {
			console.error('[BeanCodeBlock] createNewBean failed:', err);
		}
	}
}

function openWeightPopover(
	anchor: HTMLElement,
	bean: BeanInfo,
	vaultData: VaultDataService,
	onSave: () => void,
	getScaleWeight: (() => number | null) | null,
): void {
	document.querySelector('.bean-weight-popover')?.remove();

	const popover = document.body.createDiv({ cls: 'bean-weight-popover' });

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
			text: 'auto',
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
		btn.addEventListener('click', () => applyAction(def.calc));
	}

	const depletedBtn = popover.createEl('button', {
		text: t('bean.depleted'),
		cls: 'bwp-depleted',
	});
	depletedBtn.addEventListener('click', async () => {
		try {
			await vaultData.setBeanStatus(bean.path, 'finished');
			onSave();
			close();
		} catch (err) {
			console.error('[BeanCodeBlock] depleted failed:', err);
		}
	});

	const close = () => {
		popover.remove();
		document.removeEventListener('pointerdown', onOutside);
	};

	const applyAction = async (calc: (val: number, cur: number) => number) => {
		const val = parseFloat(input.value);
		if (isNaN(val) || val < 0) return;
		try {
			const newWeight = calc(val, bean.weight ?? 0);
			await vaultData.setWeight(bean.path, newWeight);
			bean.weight = newWeight;
			onSave();
			close();
		} catch (err) {
			console.error('[BeanCodeBlock] weight update failed:', err);
		}
	};

	input.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') close();
	});

	const onOutside = (e: PointerEvent) => {
		if (!popover.contains(e.target as Node) && e.target !== anchor) close();
	};
	setTimeout(() => document.addEventListener('pointerdown', onOutside), 0);

	const rect = anchor.getBoundingClientRect();
	popover.style.top = `${rect.top}px`;
	popover.style.left = `${rect.right}px`;

	requestAnimationFrame(() => {
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
