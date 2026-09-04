import { type App, setIcon } from 'obsidian';
import type { BrewRecord, EquipmentSettings } from '../brew/types';
import { getDrinkLabel, getMethodLabel, getTempLabel } from '../brew/constants';
import type { BrewProfileStorage } from '../services/BrewProfileStorage';
import type { BrewRecordService } from '../services/BrewRecordService';
import { t } from '../i18n/index';
import { formatBrewDate } from '../utils/format';
import type { BeanWeightService } from '../services/BeanWeightService';
import { BrewProfileModal } from './BrewProfileModal';

export interface BrewRecordTableOptions {
	app: App;
	recordService: BrewRecordService;
	profileStorage: BrewProfileStorage;
	getEquipment: () => EquipmentSettings;
	vaultData?: BeanWeightService;
}

export interface BrewDayTableGroup {
	beanName: string;
	records: BrewRecord[];
	beanPath?: string;
}

interface ExpandState {
	current: {
		tr: HTMLTableRowElement;
		noteCell: HTMLTableCellElement;
		id: string;
	} | null;
}

export function renderBrewRecordTable(
	el: HTMLElement,
	records: BrewRecord[],
	beanName: string,
	options: BrewRecordTableOptions,
): void {
	el.empty();
	el.addClass('brew-records');

	el.createEl('h3', { text: t('record.header'), cls: 'brew-records-header' });

	if (records.length === 0) {
		el.createDiv({ text: t('record.empty'), cls: 'brew-records-empty' });
		return;
	}

	const table = el.createEl('table', { cls: 'brew-record-table' });
	renderTableHeader(table);
	const expandState: ExpandState = { current: null };
	const tbody = table.createEl('tbody');
	renderRecordRows(tbody, records, beanName, options, expandState);
}

export function renderBrewDayTable(
	el: HTMLElement,
	groups: BrewDayTableGroup[],
	options: BrewRecordTableOptions,
): void {
	el.empty();
	el.addClass('brew-records');

	const table = el.createEl('table', { cls: 'brew-record-table' });
	renderTableHeader(table);
	const expandState: ExpandState = { current: null };

	for (const group of groups) {
		const tbody = table.createEl('tbody', { cls: 'brew-day-record-group' });
		const headerRow = tbody.createEl('tr', { cls: 'brew-day-group-row' });
		const header = headerRow.createEl('th', {
			cls: 'brew-records-header',
			text: group.beanPath === undefined ? group.beanName : undefined,
		});
		header.colSpan = 5;
		if (group.beanPath !== undefined) {
			header.createEl('a', {
				text: group.beanName,
				cls: 'internal-link',
				attr: { href: group.beanPath, 'data-href': group.beanPath, target: '_blank', rel: 'noopener' },
			});
		}
		renderRecordRows(tbody, group.records, group.beanName, options, expandState);
	}
}

function renderTableHeader(table: HTMLTableElement): void {
	const thead = table.createEl('thead');
	const headerRow = thead.createEl('tr');
	for (const col of [
		t('record.date'),
		t('record.roastDays'),
		t('record.method'),
		t('record.memo'),
		t('record.detail'),
	]) {
		headerRow.createEl('th', { text: col });
	}
}

function renderRecordRows(
	tbody: HTMLTableSectionElement,
	records: BrewRecord[],
	beanName: string,
	options: BrewRecordTableOptions,
	expandState: ExpandState,
): void {
	for (const record of records) {
		const tr = tbody.createEl('tr');
		const dateTd = tr.createEl('td', { cls: 'brew-record-date' });
		const { date, time } = formatBrewDate(record.timestamp);
		dateTd.createDiv({ text: date });
		dateTd.createDiv({ text: time });
		tr.createEl('td', {
			text: record.roastDays != null ? t('bean.roastDays', { n: record.roastDays }) : '-',
			cls: 'brew-record-roast',
		});
		const method = record.method === 'espresso' ? getDrinkLabel(record.drink ?? 'shot') : getMethodLabel('filter');
		const temp = getTempLabel(record.temp);
		tr.createEl('td', { text: `${method}(${temp})`, cls: 'brew-record-method' });

		const noteTd = tr.createEl('td', { cls: 'brew-record-note' });
		noteTd.createSpan({ text: record.note || '-' });
		noteTd.addEventListener('click', () => {
			if (expandState.current?.id === record.id) {
				collapseExpand(expandState);
				return;
			}
			collapseExpand(expandState);
			noteTd.addClass('is-expanded');
			const expandTr = createEl('tr');
			expandTr.addClass('brew-record-expand');
			tr.after(expandTr);
			const expandTd = expandTr.createEl('td');
			expandTd.colSpan = 5;
			renderNoteExpand(expandTd, record, options.recordService);
			expandState.current = { tr: expandTr, noteCell: noteTd, id: record.id };
		});

		const actionTd = tr.createEl('td');
		const btn = actionTd.createEl('button', { cls: 'brew-record-chart-btn' });
		setIcon(btn, 'list');
		btn.addEventListener('click', () => {
			const title = `${beanName} — ${formatDate(record.timestamp)}`;
			new BrewProfileModal(options.app, title, {
				type: 'detail',
				record,
				recordService: options.recordService,
				profileStorage: options.profileStorage,
				equipment: options.getEquipment(),
				vaultData: options.vaultData,
			}).open();
		});
	}
}

function collapseExpand(expandState: ExpandState): void {
	if (!expandState.current) return;
	expandState.current.noteCell.removeClass('is-expanded');
	expandState.current.tr.remove();
	expandState.current = null;
}

function renderNoteExpand(container: HTMLElement, record: BrewRecord, recordService: BrewRecordService): void {
	const renderView = () => {
		container.empty();
		const content = container.createDiv({ cls: 'brew-note-expand' });
		if (record.note) {
			content.createDiv({ cls: 'brew-note-expand-text', text: record.note });
		}
		const editBtn = content.createEl('button', { cls: 'brew-note-edit-btn clickable-icon' });
		setIcon(editBtn, 'pencil');
		editBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			renderEdit();
		});
	};

	const renderEdit = () => {
		container.empty();
		const form = container.createDiv({ cls: 'brew-note-edit-form' });
		const textarea = form.createEl('textarea', { cls: 'brew-note-edit-textarea' });
		textarea.value = record.note ?? '';
		textarea.rows = 3;
		const actions = form.createDiv({ cls: 'brew-note-edit-actions' });
		const cancelBtn = actions.createEl('button', { text: t('common.cancel') });
		cancelBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			renderView();
		});
		const saveBtn = actions.createEl('button', { text: t('form.save'), cls: 'mod-cta' });
		const saveNote = async (): Promise<void> => {
			const newNote = textarea.value.trim() || undefined;
			await recordService.update(record.id, { note: newNote });
		};
		saveBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			void saveNote().catch((error: unknown) => {
				console.error('[BrewRecordTable] note update failed:', error);
			});
		});
		window.requestAnimationFrame(() => textarea.focus());
	};

	renderView();
}

function formatDate(iso: string): string {
	const { date, time } = formatBrewDate(iso);
	return `${date} · ${time}`;
}
