// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { AcaiaService } from '../../src/acaia/AcaiaService';
import type { DiscoveredScale } from '../../src/acaia/NobleTransport';
import { createContainer, installPolyfills } from '../helpers/obsidian-dom-polyfill';

vi.mock('../../src/i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

import { ScalePickerModal } from '../../src/views/ScalePickerModal';

beforeAll(() => installPolyfills());

const appStub = { scope: {} } as App;

function createServiceStub() {
	let onScale: ((scale: DiscoveredScale) => void) | null = null;
	return {
		startPickerScan: vi.fn((cb: (scale: DiscoveredScale) => void) => {
			onScale = cb;
			return Promise.resolve(true);
		}),
		cancelPickerScan: vi.fn(),
		connectToScale: vi.fn().mockResolvedValue(undefined),
		emitScale(scale: DiscoveredScale) {
			onScale?.(scale);
		},
	};
}

function wireContentEl(modal: ScalePickerModal): void {
	Object.defineProperty(modal, 'contentEl', { value: createContainer() });
}

describe('ScalePickerModal', () => {
	it('lists discovered scales with a registered badge and custom name', async () => {
		const service = createServiceStub();
		const registered = [
			{ name: 'Kitchen scale', address: 'aa:bb', lastConnectedAt: '2026-08-01T00:00:00.000Z' },
		];
		const modal = new ScalePickerModal(appStub, service as unknown as AcaiaService, registered);
		wireContentEl(modal);
		modal.onOpen();
		await Promise.resolve();
		service.emitScale({ id: 'p1', localName: 'PEARLS-X', address: 'AA:BB' });
		service.emitScale({ id: 'p2', localName: 'LUNAR-Y', address: 'CC:DD' });
		const rows = modal.contentEl.querySelectorAll('.scale-picker-row');
		expect(rows).toHaveLength(2);
		expect(rows[0].textContent).toContain('Kitchen scale');
		expect(rows[0].querySelector('.scale-picker-badge')).not.toBeNull();
		expect(rows[1].textContent).toContain('Acaia Lunar');
		expect(rows[1].querySelector('.scale-picker-badge')).toBeNull();
	});

	it('connects on row click and skips cancel; cancels when closed without a pick', async () => {
		const service = createServiceStub();
		const modal = new ScalePickerModal(appStub, service as unknown as AcaiaService, []);
		wireContentEl(modal);
		modal.onOpen();
		await Promise.resolve();
		service.emitScale({ id: 'p1', localName: 'PEARLS-X', address: 'AA:BB' });
		(modal.contentEl.querySelector('.scale-picker-row') as HTMLButtonElement).click();
		modal.onClose();
		expect(service.connectToScale).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
		expect(service.cancelPickerScan).not.toHaveBeenCalled();

		const modal2 = new ScalePickerModal(appStub, service as unknown as AcaiaService, []);
		wireContentEl(modal2);
		modal2.onOpen();
		await Promise.resolve();
		modal2.onClose();
		expect(service.cancelPickerScan).toHaveBeenCalledOnce();
	});
});
