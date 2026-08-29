// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { installPolyfills, createContainer } from '../helpers/obsidian-dom-polyfill';
import { ScaleDisplayManager } from '../../src/views/ScaleDisplayManager';

vi.mock('../../src/i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

beforeAll(() => installPolyfills());

function buildManager(): ScaleDisplayManager {
	const host = createContainer();
	const connectBtn = host.createEl('button');
	const powerOffBtn = host.createEl('button');
	const manager = new ScaleDisplayManager(connectBtn, powerOffBtn, {
		onTimerClick: vi.fn(),
		onTare: vi.fn(),
		isConnected: () => true,
		getReconnectAttempt: () => 0,
	});
	manager.buildHeader(host.createDiv());
	manager.buildData(host.createDiv());
	return manager;
}

describe('ScaleDisplayManager stale weight clearing', () => {
	it('clears the weight sample on disconnect', () => {
		const manager = buildManager();
		manager.updateWeight(15.4, true);
		expect(manager.getWeightText()).toBe('15.4');
		manager.updateControls('disconnected', vi.fn());
		expect(manager.getWeightText()).toBe('--');
	});

	it('clears the weight sample when reconnecting starts', () => {
		const manager = buildManager();
		manager.updateWeight(21.0, true);
		manager.updateControls('reconnecting', vi.fn());
		expect(manager.getWeightText()).toBe('--');
	});
});
