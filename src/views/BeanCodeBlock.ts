import { type App, type MarkdownPostProcessorContext } from 'obsidian';
import type { VaultDataService } from '../services/VaultDataService';
import type { BeanInfo } from '../brew/types';
import { BEAN_NOTE_EXTRA } from '../brew/constants';
import { renderActiveBeanRow, renderFinishedBeanRow } from './BeanRowRenderer';

export class BeanCodeBlock {
	private containers: WeakRef<HTMLElement>[] = [];
	private getScaleWeight: (() => number | null) | null = null;

	constructor(
		private app: App,
		private vaultData: VaultDataService,
	) {}

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
		const newBtn = header.createEl('button', { text: '+ 새 원두', cls: 'cb-bean-btn cb-bean-new-btn' });
		newBtn.addEventListener('click', () => this.createNewBean());

		const beans = this.vaultData.getAllBeans();
		const active = [...this.vaultData.getActiveBeans()].sort((a, b) => a.name.localeCompare(b.name));
		const finished = [...beans.filter((b) => b.status === 'finished')].sort((a, b) => a.name.localeCompare(b.name));

		const deps = {
			vaultData: this.vaultData,
			onNameClick: (bean: BeanInfo) => this.app.workspace.openLinkText(bean.path, ''),
			onStatusChange: () => this.refreshAll(),
			onWeightClick: (anchor: HTMLElement, bean: BeanInfo) =>
				openWeightPopover(anchor, bean, this.vaultData, () => this.refreshAll(), this.getScaleWeight),
		};

		if (active.length > 0) {
			el.createDiv({ cls: 'cb-bean-section-title', text: '현재 보유 원두' });
			for (const bean of active) renderActiveBeanRow(el, bean, deps);
		}

		if (finished.length > 0) {
			el.createDiv({ cls: 'cb-bean-section-title cb-bean-section-past', text: '과거 원두' });
			for (const bean of finished) renderFinishedBeanRow(el, bean, deps);
		}

		if (beans.length === 0) {
			el.createDiv({ cls: 'cb-bean-empty', text: 'type: bean frontmatter가 있는 노트가 없어요' });
		}
	}

	private async createNewBean(): Promise<void> {
		const path = await this.vaultData.createBeanNote(BEAN_NOTE_EXTRA);
		await this.app.workspace.openLinkText(path, '');
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

	if (bean.weight != null) {
		popover.createDiv({ cls: 'bwp-current', text: `${bean.weight}g` });
	}

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
			attr: { 'aria-label': '저울 무게 가져오기' },
		});
		autoBtn.addEventListener('click', () => {
			const w = getScaleWeight?.();
			if (w != null) input.value = String(w);
		});
	}

	const actions = popover.createDiv({ cls: 'bwp-actions' });
	const actionDefs: { label: string; calc: (val: number, cur: number) => number; cls?: string }[] = [
		{ label: '설정', calc: (val) => val },
		{ label: '추가', calc: (val, cur) => Math.round((cur + val) * 10) / 10 },
		{ label: '사용', calc: (val, cur) => Math.max(0, Math.round((cur - val) * 10) / 10), cls: 'is-muted' },
	];
	for (const def of actionDefs) {
		const btn = actions.createEl('button', {
			text: def.label,
			cls: `bwp-action${def.cls ? ` ${def.cls}` : ''}`,
		});
		btn.addEventListener('click', () => applyAction(def.calc));
	}

	const close = () => {
		popover.remove();
		document.removeEventListener('pointerdown', onOutside);
	};

	const applyAction = async (calc: (val: number, cur: number) => number) => {
		const val = parseFloat(input.value);
		if (isNaN(val) || val < 0) return;
		const newWeight = calc(val, bean.weight ?? 0);
		await vaultData.setWeight(bean.path, newWeight);
		bean.weight = newWeight;
		onSave();
		close();
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
