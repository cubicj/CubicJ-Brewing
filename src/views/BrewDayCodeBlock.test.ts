// @vitest-environment jsdom
import type { MarkdownPostProcessorContext } from 'obsidian';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { installPolyfills, createContainer } from '../test/obsidian-dom-polyfill';
import type { FilterRecord } from '../brew/types';

vi.mock('../i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

import { BrewDayCodeBlock } from './BrewDayCodeBlock';

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

describe('BrewDayCodeBlock', () => {
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
});
