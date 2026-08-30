// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { EquipmentSettings } from '../../../src/brew/types';
import { EquipmentManagePanel } from '../../../src/views/dataManage/EquipmentManagePanel';
import { createContainer, installPolyfills } from '../../helpers/obsidian-dom-polyfill';

vi.mock('../../../src/i18n/index', () => ({ t: (key: string) => key, initI18n: vi.fn() }));

beforeAll(() => installPolyfills());

function equipment(): EquipmentSettings {
	return { grinders: [], drippers: [], filters: [], baskets: [], accessories: [], scales: [] };
}

function findList(container: HTMLElement, label: string): HTMLElement {
	const lists = Array.from(container.querySelectorAll<HTMLElement>('.dm-equip-list'));
	return lists.find((list) => list.querySelector('.dm-equip-list-header span')?.textContent === label)!;
}

async function flushPromises(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe('EquipmentManagePanel', () => {
	it('adds and deletes a string item in the injected equipment object', async () => {
		const injected = equipment();
		const drippers = injected.drippers;
		const saveEquipment = vi.fn().mockResolvedValue(undefined);
		const container = createContainer();
		const panel = new EquipmentManagePanel({ equipment: injected, saveEquipment });
		panel.render(container);
		const list = findList(container, 'equipment.dripper');

		list.querySelector<HTMLButtonElement>('.dm-equip-add-btn')!.click();
		const input = list.querySelector<HTMLInputElement>('.dm-equip-input')!;
		input.value = 'V60';
		list.querySelector<HTMLButtonElement>('.dm-btn-accent')!.click();
		await flushPromises();

		expect(injected.drippers).toBe(drippers);
		expect(injected.drippers).toEqual(['V60']);
		expect(saveEquipment).toHaveBeenCalledTimes(1);

		list.querySelector<HTMLButtonElement>('.dm-equip-del-btn')!.click();
		await flushPromises();

		expect(injected.drippers).toBe(drippers);
		expect(injected.drippers).toEqual([]);
		expect(saveEquipment).toHaveBeenCalledTimes(2);
		panel.dispose();
	});

	it('adds, edits, and deletes a grinder', async () => {
		const injected = equipment();
		const grinders = injected.grinders;
		const saveEquipment = vi.fn().mockResolvedValue(undefined);
		const container = createContainer();
		const panel = new EquipmentManagePanel({ equipment: injected, saveEquipment });
		panel.render(container);
		const list = findList(container, 'equipment.grinder');

		list.querySelector<HTMLButtonElement>('.dm-equip-add-btn')!.click();
		list.querySelector<HTMLInputElement>('input[type="text"]')!.value = 'C40';
		list.querySelector<HTMLButtonElement>('.dm-btn-accent')!.click();
		await flushPromises();

		expect(injected.grinders).toBe(grinders);
		expect(injected.grinders).toEqual([{ name: 'C40', step: 0.1, min: 0, max: 50 }]);
		const added = injected.grinders[0];

		list.querySelector<HTMLButtonElement>('.dm-equip-edit-btn')!.click();
		const editInput = list.querySelector<HTMLInputElement>('input[type="text"]')!;
		editInput.value = 'C40 MK4';
		list.querySelector<HTMLButtonElement>('.dm-btn-accent')!.click();
		await flushPromises();

		expect(injected.grinders[0]).toBe(added);
		expect(injected.grinders[0].name).toBe('C40 MK4');

		list.querySelector<HTMLButtonElement>('.dm-equip-del-btn')!.click();
		await flushPromises();

		expect(injected.grinders).toBe(grinders);
		expect(injected.grinders).toEqual([]);
		expect(saveEquipment).toHaveBeenCalledTimes(3);
		panel.dispose();
	});

	it('renames a registered scale in place and persists', async () => {
		const injected = equipment();
		injected.scales.push({
			name: 'Acaia Pearl S',
			address: 'aa:bb',
			lastConnectedAt: '2026-08-30T00:00:00.000Z',
		});
		const scale = injected.scales[0];
		const saveEquipment = vi.fn().mockResolvedValue(undefined);
		const container = createContainer();
		const panel = new EquipmentManagePanel({ equipment: injected, saveEquipment });
		panel.render(container);
		const list = findList(container, 'equipment.scale');

		list.querySelector<HTMLButtonElement>('.dm-scale-edit-btn')!.click();
		const input = list.querySelector<HTMLInputElement>('.dm-equip-input')!;
		input.value = 'Kitchen Pearl';
		list.querySelector<HTMLButtonElement>('.dm-btn-accent')!.click();
		await flushPromises();

		expect(injected.scales[0]).toBe(scale);
		expect(injected.scales[0].name).toBe('Kitchen Pearl');
		expect(saveEquipment).toHaveBeenCalledOnce();
		panel.dispose();
	});

	it('keeps the old name when the rename input is emptied', async () => {
		const injected = equipment();
		injected.scales.push({
			name: 'Acaia Pearl S',
			address: 'aa:bb',
			lastConnectedAt: '2026-08-30T00:00:00.000Z',
		});
		const saveEquipment = vi.fn().mockResolvedValue(undefined);
		const container = createContainer();
		const panel = new EquipmentManagePanel({ equipment: injected, saveEquipment });
		panel.render(container);
		const list = findList(container, 'equipment.scale');

		list.querySelector<HTMLButtonElement>('.dm-scale-edit-btn')!.click();
		const input = list.querySelector<HTMLInputElement>('.dm-equip-input')!;
		input.value = '   ';
		list.querySelector<HTMLButtonElement>('.dm-btn-accent')!.click();
		await flushPromises();

		expect(injected.scales[0].name).toBe('Acaia Pearl S');
		expect(saveEquipment).not.toHaveBeenCalled();
		panel.dispose();
	});

	it('deletes a registered scale', async () => {
		const injected = equipment();
		const scales = injected.scales;
		injected.scales.push({
			name: 'Acaia Pearl S',
			address: 'aa:bb',
			lastConnectedAt: '2026-08-30T00:00:00.000Z',
		});
		const saveEquipment = vi.fn().mockResolvedValue(undefined);
		const container = createContainer();
		const panel = new EquipmentManagePanel({ equipment: injected, saveEquipment });
		panel.render(container);
		const list = findList(container, 'equipment.scale');

		list.querySelector<HTMLButtonElement>('.dm-scale-del-btn')!.click();
		await flushPromises();

		expect(injected.scales).toBe(scales);
		expect(injected.scales).toHaveLength(0);
		expect(saveEquipment).toHaveBeenCalledOnce();
		panel.dispose();
	});
});
