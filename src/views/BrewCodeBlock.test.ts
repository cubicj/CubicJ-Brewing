// @vitest-environment jsdom
import type { App, MarkdownPostProcessorContext } from 'obsidian';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { installPolyfills, createContainer } from '../test/obsidian-dom-polyfill';

vi.mock('../i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

import { BrewCodeBlock } from './BrewCodeBlock';

beforeAll(() => installPolyfills());

const emptyEquipment = () => ({ grinders: [], drippers: [], filters: [], baskets: [], accessories: [] });

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
