// @vitest-environment jsdom
import type { App, MarkdownPostProcessorContext } from 'obsidian';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { installPolyfills, createContainer } from '../helpers/obsidian-dom-polyfill';
import type { FilterRecord } from '../../src/brew/types';

vi.mock('../../src/i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

import { BrewCodeBlock } from '../../src/views/BrewCodeBlock';

beforeAll(() => installPolyfills());

const emptyEquipment = () => ({ grinders: [], drippers: [], filters: [], baskets: [], accessories: [] });

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

function makeBlock(app: App) {
	const block = new BrewCodeBlock(
		app,
		{ getByBean: vi.fn(async () => ({ ok: true, data: [] })) } as never,
		{} as never,
		emptyEquipment,
	);
	let handler!: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void;
	block.register((_lang, registeredHandler) => {
		handler = registeredHandler;
	});
	return { block, handler };
}

describe('BrewCodeBlock bean resolution', () => {
	it('refreshes detached blocks and keeps them tracked', async () => {
		const app = {
			metadataCache: {
				getFileCache: vi.fn(() => ({ frontmatter: { type: 'bean', name: 'A Bean' } })),
			},
			vault: {
				getAbstractFileByPath: vi.fn(() => ({ extension: 'md', name: 'A.md' })),
			},
		} as unknown as App;
		let records = [makeFilter({ note: 'Old note' })];
		const recordService = {
			getByBean: vi.fn(async () => ({ ok: true as const, data: records })),
		};
		const block = new BrewCodeBlock(app, recordService as never, {} as never, emptyEquipment);
		let handler!: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void;
		block.register((_lang, registeredHandler) => {
			handler = registeredHandler;
		});
		const el = createContainer();
		document.body.appendChild(el);

		handler('', el, { sourcePath: 'A.md' } as MarkdownPostProcessorContext);
		await vi.waitFor(() => expect(el.textContent).toContain('Old note'));

		el.remove();
		records = [makeFilter({ id: 'record-2', note: 'New note' })];
		block.refreshAll();
		await vi.waitFor(() => expect(el.textContent).toContain('New note'));
		expect(recordService.getByBean).toHaveBeenCalledTimes(2);

		block.refreshAll();
		expect(recordService.getByBean).toHaveBeenCalledTimes(3);
	});

	it('keeps the newer output when an older render resolves last', async () => {
		const app = {
			metadataCache: {
				getFileCache: vi.fn(() => ({ frontmatter: { type: 'bean', name: 'A Bean' } })),
			},
			vault: {
				getAbstractFileByPath: vi.fn(() => ({ extension: 'md', name: 'A.md' })),
			},
		} as unknown as App;
		let resolveOlder!: (value: { ok: true; data: FilterRecord[] }) => void;
		let resolveNewer!: (value: { ok: true; data: FilterRecord[] }) => void;
		const older = new Promise<{ ok: true; data: FilterRecord[] }>((resolve) => {
			resolveOlder = resolve;
		});
		const newer = new Promise<{ ok: true; data: FilterRecord[] }>((resolve) => {
			resolveNewer = resolve;
		});
		const recordService = {
			getByBean: vi.fn().mockReturnValueOnce(older).mockReturnValueOnce(newer),
		};
		const block = new BrewCodeBlock(app, recordService as never, {} as never, emptyEquipment);
		let handler!: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void;
		block.register((_lang, registeredHandler) => {
			handler = registeredHandler;
		});
		const el = createContainer();

		handler('', el, { sourcePath: 'A.md' } as MarkdownPostProcessorContext);
		block.refreshAll();
		resolveNewer({ ok: true, data: [makeFilter({ id: 'newer', note: 'Newer output' })] });
		await vi.waitFor(() => expect(el.textContent).toContain('Newer output'));

		resolveOlder({ ok: true, data: [makeFilter({ id: 'older', note: 'Older output' })] });
		await Promise.resolve();

		expect(el.textContent).toContain('Newer output');
		expect(el.textContent).not.toContain('Older output');
	});

	it('abandons an older render immediately after its metadata wait', async () => {
		let resolvedCallback: (() => void) | null = null;
		let pendingReady = false;
		const app = {
			metadataCache: {
				on: vi.fn((_name: string, cb: () => void) => {
					resolvedCallback = cb;
					return { e: true };
				}),
				offref: vi.fn(),
				getFileCache: vi.fn((file: { name: string }) => ({
					frontmatter: {
						type: 'bean',
						name: file.name === 'Pending.md' ? 'Pending Bean' : 'Fresh Bean',
					},
				})),
			},
			vault: {
				getAbstractFileByPath: vi.fn((path: string) =>
					path === 'Pending.md' && !pendingReady ? null : { extension: 'md', name: path },
				),
			},
		} as unknown as App;
		const recordService = {
			getByBean: vi.fn(async (beanName: string) => ({
				ok: true as const,
				data: [makeFilter({ id: beanName, note: `${beanName} output` })],
			})),
		};
		const block = new BrewCodeBlock(app, recordService as never, {} as never, emptyEquipment);
		let handler!: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void;
		block.register((_lang, registeredHandler) => {
			handler = registeredHandler;
		});
		const el = createContainer();

		handler('', el, { sourcePath: 'Pending.md' } as MarkdownPostProcessorContext);
		handler('', el, { sourcePath: 'Fresh.md' } as MarkdownPostProcessorContext);
		await vi.waitFor(() => expect(el.textContent).toContain('Fresh Bean output'));

		pendingReady = true;
		resolvedCallback!();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));

		expect(el.textContent).toContain('Fresh Bean output');
		expect(el.textContent).not.toContain('Pending Bean output');
		expect(recordService.getByBean).toHaveBeenCalledTimes(1);
	});

	it('falls back to the placeholder when metadata never resolves', async () => {
		vi.useFakeTimers();
		try {
			const app = {
				metadataCache: {
					on: vi.fn(() => ({ e: true })),
					offref: vi.fn(),
					getFileCache: vi.fn(() => null),
				},
				vault: { getAbstractFileByPath: vi.fn(() => null) },
			} as unknown as App;
			const { handler } = makeBlock(app);
			const el = createContainer();

			handler('', el, { sourcePath: 'Daily/2026-07-08.md' } as MarkdownPostProcessorContext);
			await vi.advanceTimersByTimeAsync(3500);

			expect(el.textContent).toContain('record.beanOnly');
		} finally {
			vi.useRealTimers();
		}
	});

	it('retries bean resolution when metadata resolves', async () => {
		let resolvedCallback: (() => void) | null = null;
		let cacheReady = false;
		const app = {
			metadataCache: {
				on: vi.fn((_name: string, cb: () => void) => {
					resolvedCallback = cb;
					return { e: true };
				}),
				offref: vi.fn(),
				getFileCache: vi.fn(() => (cacheReady ? { frontmatter: { type: 'bean' } } : null)),
			},
			vault: {
				getAbstractFileByPath: vi.fn(() => (cacheReady ? { extension: 'md', name: 'A.md' } : null)),
			},
		} as unknown as App;
		const { handler } = makeBlock(app);
		const el = createContainer();

		handler('', el, { sourcePath: 'A.md' } as MarkdownPostProcessorContext);
		await Promise.resolve();
		expect(resolvedCallback).not.toBeNull();

		cacheReady = true;
		resolvedCallback!();
		await vi.waitFor(() => expect(el.textContent).toContain('record.empty'));
	});
});
