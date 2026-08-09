// @vitest-environment jsdom
import type { MarkdownPostProcessorContext } from 'obsidian';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { installPolyfills, createContainer } from '../helpers/obsidian-dom-polyfill';
import type { FilterRecord } from '../../src/brew/types';

vi.mock('../../src/i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

import { BrewDayCodeBlock } from '../../src/views/BrewDayCodeBlock';

beforeAll(() => installPolyfills());

const makeFilter = (overrides: Partial<FilterRecord> = {}): FilterRecord => ({
	id: 'record-1',
	timestamp: '2026-07-01T10:00:00',
	bean: 'A Bean',
	roastDate: '2026-06-20',
	roastDays: 11,
	method: 'filter',
	temp: 'hot',
	grindSize: 2.5,
	dose: 18,
	waterTemp: 93,
	...overrides,
});

const emptyEquipment = () => ({
	grinders: [],
	drippers: [],
	filters: [],
	baskets: [],
	accessories: [],
});

async function renderRecords(records: FilterRecord[]): Promise<HTMLElement> {
	const recordService = {
		getAll: vi.fn().mockResolvedValue({ ok: true, data: records }),
	};
	const block = new BrewDayCodeBlock({} as any, recordService as any, {} as any, emptyEquipment);
	let handler!: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void;
	block.register((_lang, registeredHandler) => {
		handler = registeredHandler;
	});
	const el = createContainer();

	handler('', el, { sourcePath: 'Daily/2026-07-01.md' } as MarkdownPostProcessorContext);
	await Promise.resolve();

	return el;
}

describe('BrewDayCodeBlock', () => {
	it('refreshes detached blocks and keeps them tracked', async () => {
		let records = [makeFilter({ bean: 'Old Bean' })];
		const recordService = {
			getAll: vi.fn(async () => ({ ok: true as const, data: records })),
		};
		const block = new BrewDayCodeBlock({} as any, recordService as any, {} as any, emptyEquipment);
		let handler!: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void;
		block.register((_lang, registeredHandler) => {
			handler = registeredHandler;
		});
		const el = createContainer();
		document.body.appendChild(el);

		handler('', el, { sourcePath: 'Daily/2026-07-01.md' } as MarkdownPostProcessorContext);
		await vi.waitFor(() => expect(el.textContent).toContain('Old Bean'));

		el.remove();
		records = [makeFilter({ id: 'record-2', bean: 'New Bean' })];
		block.refreshAll();
		await vi.waitFor(() => expect(el.textContent).toContain('New Bean'));
		expect(recordService.getAll).toHaveBeenCalledTimes(2);

		block.refreshAll();
		expect(recordService.getAll).toHaveBeenCalledTimes(3);
	});

	it('keeps only the latest render when refreshes overlap', async () => {
		const record = makeFilter();
		let resolveRecords!: (value: { ok: true; data: FilterRecord[] }) => void;
		const pendingRecords = new Promise<{ ok: true; data: FilterRecord[] }>((resolve) => {
			resolveRecords = resolve;
		});
		const recordService = {
			getAll: vi.fn(() => pendingRecords),
		};
		const block = new BrewDayCodeBlock({} as any, recordService as any, {} as any, () => ({
			grinders: [],
			drippers: [],
			filters: [],
			baskets: [],
			accessories: [],
		}));
		let handler!: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void;
		block.register((_lang, registeredHandler) => {
			handler = registeredHandler;
		});
		const el = createContainer();
		document.body.appendChild(el);

		handler('', el, { sourcePath: 'Daily/2026-07-01.md' } as MarkdownPostProcessorContext);
		block.refreshAll();
		block.refreshAll();
		resolveRecords({ ok: true, data: [record] });
		await Promise.resolve();

		expect(el.querySelectorAll('.brew-day-record-group')).toHaveLength(1);
		expect(el.querySelectorAll('.brew-record-table tbody tr')).toHaveLength(1);
	});

	it('renders roast age between the date and method columns', async () => {
		const el = await renderRecords([
			makeFilter({ id: 'roast-set', roastDays: 11 }),
			makeFilter({ id: 'roast-null', timestamp: '2026-07-01T09:00:00', roastDays: null }),
		]);
		const headers = el.querySelectorAll('.brew-record-table thead th');
		const roastCells = el.querySelectorAll('.brew-record-roast');

		expect(headers).toHaveLength(5);
		expect(headers[1]?.textContent).toBe('record.roastDays');
		expect(Array.from(roastCells, (cell) => cell.textContent)).toEqual(['bean.roastDays', '-']);
	});

	it('spans the note expansion across all five columns', async () => {
		const el = await renderRecords([makeFilter({ note: 'Tasting note' })]);

		el.querySelector<HTMLElement>('.brew-record-note')?.click();

		expect(el.querySelector<HTMLTableCellElement>('.brew-record-expand td')?.colSpan).toBe(5);
	});
});
