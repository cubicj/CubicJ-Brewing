// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { installPolyfills, createContainer } from '../helpers/obsidian-dom-polyfill';
import { ScaleDisplayManager } from '../../src/views/ScaleDisplayManager';
import { MAX_RECONNECT_ATTEMPTS } from '../../src/acaia/AcaiaService';

const { tMock } = vi.hoisted(() => ({
	tMock: vi.fn((key: string) => key),
}));

vi.mock('../../src/i18n/index', () => ({
	t: tMock,
	initI18n: vi.fn(),
}));

beforeAll(() => installPolyfills());

function buildManager(reconnectAttempt = 0): {
	manager: ScaleDisplayManager;
	findOtherBtn: HTMLButtonElement;
} {
	const host = createContainer();
	const connectBtn = host.createEl('button');
	const powerOffBtn = host.createEl('button');
	const findOtherBtn = host.createEl('button');
	const manager = new ScaleDisplayManager(connectBtn, powerOffBtn, findOtherBtn, {
		onTimerClick: vi.fn(),
		onTare: vi.fn(),
		isConnected: () => true,
		getReconnectAttempt: () => reconnectAttempt,
	});
	manager.buildHeader(host.createDiv());
	manager.buildData(host.createDiv());
	return { manager, findOtherBtn };
}

describe('ScaleDisplayManager stale weight clearing', () => {
	it('clears the weight sample on disconnect', () => {
		const { manager } = buildManager();
		manager.updateWeight(15.4, true);
		expect(manager.getWeightText()).toBe('15.4');
		manager.updateControls('disconnected', vi.fn());
		expect(manager.getWeightText()).toBe('--');
	});

	it('clears the weight sample when reconnecting starts', () => {
		const { manager } = buildManager();
		manager.updateWeight(21.0, true);
		manager.updateControls('reconnecting', vi.fn());
		expect(manager.getWeightText()).toBe('--');
	});
});

describe('ScaleDisplayManager reconnect status', () => {
	it('passes the current attempt and maximum attempt count to i18n', () => {
		const { manager } = buildManager(4);
		tMock.mockClear();

		manager.updateHeader('reconnecting');

		expect(tMock).toHaveBeenCalledWith('scale.reconnecting', {
			attempt: 4,
			max: MAX_RECONNECT_ATTEMPTS,
		});
	});
});

describe('ScaleDisplayManager find-other visibility', () => {
	it('shows the find-other button only while scanning or reconnecting', () => {
		const { manager, findOtherBtn } = buildManager();
		manager.updateHeader('scanning');
		expect(findOtherBtn.style.display).not.toBe('none');
		manager.updateHeader('reconnecting');
		expect(findOtherBtn.style.display).not.toBe('none');
		for (const state of ['idle', 'connecting', 'connected', 'disconnected'] as const) {
			manager.updateHeader(state);
			expect(findOtherBtn.style.display).toBe('none');
		}
	});
});
