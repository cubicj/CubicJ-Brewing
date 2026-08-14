import type { BrewRecord } from '../../../brew/types';
import { t } from '../../../i18n/index';
import { formatTimer } from '../../TimerController';

export interface RecordCardControls {
	updateCard: (record: BrewRecord | undefined) => void;
	updateNav: (index: number, total: number) => void;
}

export function renderLastRecordCard(
	container: HTMLElement,
	onNavigate: (index: number) => void,
	getNavState: () => { index: number; total: number },
): RecordCardControls {
	const cardWrapper = container.createDiv();

	let navContainer: HTMLElement | null = null;
	let prevBtn: HTMLButtonElement;
	let nextBtn: HTMLButtonElement;
	let counterEl: HTMLElement;

	const updateCard = (record: BrewRecord | undefined) => {
		cardWrapper.empty();
		const card = cardWrapper.createDiv({ cls: 'brew-flow-last-record' });

		const titleRow = card.createDiv({ cls: 'brew-flow-last-record-header' });
		titleRow.createDiv({ cls: 'brew-flow-last-record-title', text: t('brew.lastRecord') });

		navContainer = titleRow.createDiv({ cls: 'brew-flow-record-nav' });
		prevBtn = navContainer.createEl('button', { cls: 'brew-flow-record-nav-btn', text: '\u25C0' });
		counterEl = navContainer.createSpan({ cls: 'brew-flow-record-nav-counter' });
		nextBtn = navContainer.createEl('button', { cls: 'brew-flow-record-nav-btn', text: '\u25B6' });

		counterEl.addEventListener('click', () => {
			if (getNavState().index !== 0) onNavigate(0);
		});
		prevBtn.addEventListener('click', () => {
			const idx = getNavState().index;
			if (idx > 0) onNavigate(idx - 1);
		});
		nextBtn.addEventListener('click', () => {
			const { index, total } = getNavState();
			if (index < total - 1) onNavigate(index + 1);
		});

		if (!record) {
			card.createDiv({ cls: 'brew-flow-last-record-meta', text: '-' });
			navContainer.setCssProps({ display: 'none' });
			return;
		}
		const parts: string[] = [];
		if (record.roastDays != null) parts.push(`${t('modal.roasting')} ${t('bean.roastDays', { n: record.roastDays })}`);
		parts.push(`${t('summary.grindSize')} ${record.grindSize}`, `${t('summary.dose')} ${record.dose}g`);
		if (record.method === 'filter') parts.push(`${t('summary.waterTemp')} ${record.waterTemp}\u00B0C`);
		if (record.method === 'espresso') parts.push(`${t('summary.basket')} ${record.basket}`);
		card.createDiv({ cls: 'brew-flow-last-record-meta', text: parts.join(' \u00B7 ') });

		const extra: string[] = [];
		if (record.method === 'filter') {
			if (record.waterWeight) extra.push(`${t('form.addition')} ${record.waterWeight}g`);
		}
		if (record.method === 'espresso') {
			if (record.time) extra.push(`${t('modal.extractionTime')} ${formatTimer(record.time)}`);
			if (record.yield) extra.push(`${t('modal.extractionYield')} ${record.yield}g`);
			if (record.waterWeight) extra.push(`${t('form.addition')} ${record.waterWeight}g`);
			if (record.milkWeight) extra.push(`${t('form.milk')} ${record.milkWeight}g`);
		}
		if (extra.length > 0) card.createDiv({ cls: 'brew-flow-last-record-meta', text: extra.join(' \u00B7 ') });
		card.createDiv({ cls: 'brew-flow-last-record-note', text: record.note || '-' });
	};

	const updateNav = (index: number, total: number) => {
		if (!navContainer) return;
		if (total <= 1) {
			navContainer.setCssProps({ display: 'none' });
			return;
		}
		navContainer.setCssProps({ display: '' });
		counterEl.textContent = `${index + 1} / ${total}`;
		prevBtn.disabled = index <= 0;
		nextBtn.disabled = index >= total - 1;
	};

	return { updateCard, updateNav };
}
