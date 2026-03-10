import { type App, type MarkdownPostProcessorContext } from 'obsidian';
import type { VaultDataService } from '../services/VaultDataService';
import type { BeanInfo } from '../brew/types';
import { BEAN_NOTE_EXTRA } from '../brew/constants';

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
		el.addClass('bean-hub');

		const header = el.createDiv({ cls: 'bean-hub-header' });
		const newBtn = header.createEl('button', { text: '+ 새 원두', cls: 'bean-hub-btn bean-hub-new-btn' });
		newBtn.addEventListener('click', () => this.createNewBean());

		const beans = this.vaultData.getAllBeans();
		const active = [...this.vaultData.getActiveBeans()].sort((a, b) => a.name.localeCompare(b.name));
		const finished = [...beans.filter((b) => b.status === 'finished')].sort((a, b) => a.name.localeCompare(b.name));

		if (active.length > 0) {
			el.createDiv({ cls: 'bean-hub-section-title', text: '현재 보유 원두' });
			for (const bean of active) this.renderActiveRow(el, bean);
		}

		if (finished.length > 0) {
			el.createDiv({ cls: 'bean-hub-section-title bean-hub-section-past', text: '과거 원두' });
			for (const bean of finished) this.renderFinishedRow(el, bean);
		}

		if (beans.length === 0) {
			el.createDiv({ cls: 'bean-hub-empty', text: 'type: bean frontmatter가 있는 노트가 없어요' });
		}
	}

	private renderActiveRow(container: HTMLElement, bean: BeanInfo): void {
		const row = container.createDiv({ cls: 'bean-hub-row' });

		const nameEl = row.createEl('a', { cls: 'bean-hub-name', text: bean.name });
		nameEl.addEventListener('click', (e) => {
			e.preventDefault();
			this.app.workspace.openLinkText(bean.path, '');
		});

		const days = this.vaultData.getDaysSinceRoast(bean);
		row.createSpan({ cls: 'bean-hub-days', text: days !== null ? `로스팅 ${days}일차` : '' });

		const weightText = bean.weight != null ? `남은 원두 ${bean.weight}g` : '디개싱 중';
		const weightEl = row.createSpan({ cls: 'bean-hub-weight', text: weightText });
		weightEl.addEventListener('click', (e) => {
			e.stopPropagation();
			openWeightPopover(weightEl, bean, this.vaultData, () => this.refreshAll(), this.getScaleWeight);
		});

		const statusBtn = row.createEl('button', { text: '소진', cls: 'bean-hub-btn bean-hub-status-btn' });
		statusBtn.addEventListener('click', async () => {
			await this.vaultData.setBeanStatus(bean.path, 'finished');
		});
	}

	private renderFinishedRow(container: HTMLElement, bean: BeanInfo): void {
		const row = container.createDiv({ cls: 'bean-hub-row is-finished' });

		const nameEl = row.createEl('a', { cls: 'bean-hub-name', text: bean.name });
		nameEl.addEventListener('click', (e) => {
			e.preventDefault();
			this.app.workspace.openLinkText(bean.path, '');
		});

		const statusBtn = row.createEl('button', { text: '재구매', cls: 'bean-hub-btn bean-hub-status-btn' });
		statusBtn.addEventListener('click', () => {
			statusBtn.style.display = 'none';

			const dateRow = row.createDiv({ cls: 'bean-hub-date-row' });
			const input = dateRow.createEl('input', { type: 'date' });
			input.value = new Date().toISOString().slice(0, 10);

			const btns = dateRow.createDiv({ cls: 'bean-hub-date-btns' });

			const confirmBtn = btns.createEl('button', { text: '확인', cls: 'bean-hub-btn bean-hub-add-btn' });
			confirmBtn.addEventListener('click', async () => {
				if (!input.value) return;
				await this.vaultData.setRoastDate(bean.path, input.value);
				await this.vaultData.setBeanStatus(bean.path, 'active');
			});

			const cancelBtn = btns.createEl('button', { text: '취소', cls: 'bean-hub-btn' });
			cancelBtn.addEventListener('click', () => {
				dateRow.remove();
				statusBtn.style.display = '';
			});
		});
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
