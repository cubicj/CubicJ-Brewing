// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createContainer, installPolyfills } from '../../helpers/obsidian-dom-polyfill';
import { SortableListController } from '../../../src/views/dataManage/SortableListController';

vi.mock('../../../src/i18n/index', () => ({ t: (key: string) => key, initI18n: vi.fn() }));

beforeAll(() => installPolyfills());

function renderRows(listEl: HTMLElement, items: string[]): void {
	listEl.empty();
	for (let i = 0; i < items.length; i++) {
		const row = listEl.createDiv({ cls: 'dm-equip-row', text: items[i] });
		row.getBoundingClientRect = () =>
			({ top: i * 20, bottom: i * 20 + 10, height: 10, width: 100, left: 0, right: 100, x: 0, y: i * 20, toJSON: () => ({}) }) as DOMRect;
	}
}

function pointer(target: EventTarget, type: string, clientY: number): void {
	target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientY }));
}

async function flushPromises(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe('SortableListController', () => {
	it('reorders items and persists after a completed drag', async () => {
		const listEl = createContainer();
		document.body.appendChild(listEl);
		const items = ['first', 'second', 'third'];
		const saveEquipment = vi.fn().mockResolvedValue(undefined);
		const renderItems = vi.fn(() => renderRows(listEl, items));
		renderRows(listEl, items);
		const controller = new SortableListController({ listEl, items, renderItems, saveEquipment });

		pointer(listEl.querySelectorAll('.dm-equip-row')[0], 'pointerdown', 0);
		pointer(document, 'pointermove', 40);
		pointer(document, 'pointerup', 40);
		await flushPromises();

		expect(items).toEqual(['second', 'third', 'first']);
		expect(saveEquipment).toHaveBeenCalledTimes(1);

		controller.dispose();
		listEl.remove();
	});

	it('cancels an in-flight drag on dispose without persisting later document events', async () => {
		const listEl = createContainer();
		document.body.appendChild(listEl);
		const items = ['first', 'second', 'third'];
		const saveEquipment = vi.fn().mockResolvedValue(undefined);
		const renderItems = vi.fn(() => renderRows(listEl, items));
		renderRows(listEl, items);
		const controller = new SortableListController({ listEl, items, renderItems, saveEquipment });
		const firstRow = listEl.querySelectorAll<HTMLElement>('.dm-equip-row')[0];

		pointer(firstRow, 'pointerdown', 0);
		pointer(document, 'pointermove', 40);
		expect(firstRow.hasClass('is-dragging')).toBe(true);

		controller.dispose();
		pointer(document, 'pointermove', 20);
		pointer(document, 'pointerup', 20);
		await flushPromises();

		expect(items).toEqual(['first', 'second', 'third']);
		expect(saveEquipment).not.toHaveBeenCalled();
		expect(firstRow.hasClass('is-dragging')).toBe(false);
		expect(Array.from(listEl.children).every((row) => (row as HTMLElement).style.transform === '')).toBe(true);

		listEl.remove();
	});
});
