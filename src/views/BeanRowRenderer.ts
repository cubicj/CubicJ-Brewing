import type { BeanInfo } from '../brew/types';
import type { VaultDataService } from '../services/VaultDataService';

interface BeanRowDeps {
	vaultData: VaultDataService;
	onNameClick: (bean: BeanInfo) => void;
	onStatusChange: () => void;
}

interface ActiveRowDeps extends BeanRowDeps {
	onWeightClick?: (anchor: HTMLElement, bean: BeanInfo) => void;
}

export function renderActiveBeanRow(container: HTMLElement, bean: BeanInfo, deps: ActiveRowDeps): HTMLElement {
	const row = container.createDiv({ cls: 'cb-bean-row' });

	const nameEl = row.createEl('a', { cls: 'cb-bean-name', text: bean.name });
	nameEl.addEventListener('click', (e) => {
		e.preventDefault();
		deps.onNameClick(bean);
	});

	const days = deps.vaultData.getDaysSinceRoast(bean);
	row.createSpan({ cls: 'cb-bean-days', text: days !== null ? `로스팅 ${days}일차` : '' });

	const weightText = bean.weight != null ? `남은 원두 ${bean.weight}g` : '';
	const weightEl = row.createSpan({ cls: 'cb-bean-weight', text: weightText });
	if (deps.onWeightClick) {
		const handler = deps.onWeightClick;
		weightEl.addEventListener('click', (e) => {
			e.stopPropagation();
			handler(weightEl, bean);
		});
	}

	const statusBtn = row.createEl('button', { text: '소진', cls: 'cb-bean-btn cb-bean-status-btn' });
	statusBtn.addEventListener('click', async (e) => {
		e.stopPropagation();
		try {
			await deps.vaultData.setBeanStatus(bean.path, 'finished');
			deps.onStatusChange();
		} catch (err) {
			console.error('[BeanRow] status change failed:', err);
		}
	});

	return row;
}

export function renderFinishedBeanRow(container: HTMLElement, bean: BeanInfo, deps: BeanRowDeps): HTMLElement {
	const row = container.createDiv({ cls: 'cb-bean-row is-finished' });

	const nameEl = row.createEl('a', { cls: 'cb-bean-name', text: bean.name });
	nameEl.addEventListener('click', (e) => {
		e.preventDefault();
		deps.onNameClick(bean);
	});

	const statusBtn = row.createEl('button', { text: '재구매', cls: 'cb-bean-btn cb-bean-repurchase-btn' });
	statusBtn.addEventListener('click', (e) => {
		e.stopPropagation();
		statusBtn.style.display = 'none';

		const dateRow = row.createDiv({ cls: 'cb-bean-date-row' });
		const input = dateRow.createEl('input', { type: 'date' });
		input.value = new Date().toISOString().slice(0, 10);

		const btns = dateRow.createDiv({ cls: 'cb-bean-date-btns' });

		const confirmBtn = btns.createEl('button', { text: '확인', cls: 'cb-bean-btn cb-bean-confirm-btn' });
		confirmBtn.addEventListener('click', async () => {
			if (!input.value) return;
			try {
				await deps.vaultData.setRoastDate(bean.path, input.value);
				await deps.vaultData.setBeanStatus(bean.path, 'active');
				deps.onStatusChange();
			} catch (err) {
				console.error('[BeanRow] repurchase failed:', err);
			}
		});

		const cancelBtn = btns.createEl('button', { text: '취소', cls: 'cb-bean-btn' });
		cancelBtn.addEventListener('click', () => {
			dateRow.remove();
			statusBtn.style.display = '';
		});
	});

	return row;
}
