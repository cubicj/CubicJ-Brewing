// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceLeaf } from 'obsidian';
import type CubicJBrewingPlugin from '../../src/main';
import type { ScaleConfig } from '../../src/brew/types';
import { createContainer, installPolyfills } from '../helpers/obsidian-dom-polyfill';

const pickerMocks = vi.hoisted(() => ({
	opens: [] as Array<{ app: unknown; service: unknown; scales: ScaleConfig[] }>,
}));

vi.mock('../../src/i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

vi.mock('../../src/views/ScalePickerModal', () => ({
	ScalePickerModal: class {
		constructor(
			private app: unknown,
			private service: unknown,
			private scales: ScaleConfig[],
		) {}

		open(): void {
			pickerMocks.opens.push({ app: this.app, service: this.service, scales: this.scales });
		}
	},
}));

import { BrewingView } from '../../src/views/BrewingView';

beforeAll(() => installPolyfills());

beforeEach(() => {
	pickerMocks.opens.length = 0;
});

interface ServiceStub {
	state: 'idle' | 'connected';
	scaleName: string | null;
	scaleAddress: string | null;
	currentReconnectAttempt: number;
	connect: ReturnType<typeof vi.fn>;
	cancelConnect: ReturnType<typeof vi.fn>;
	disconnect: ReturnType<typeof vi.fn>;
	on(event: string, listener: (...args: unknown[]) => void): ServiceStub;
	removeListener(event: string, listener: (...args: unknown[]) => void): ServiceStub;
	emit(event: string, ...args: unknown[]): void;
}

function createService(): ServiceStub {
	const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
	const service: ServiceStub = {
		state: 'idle',
		scaleName: 'Acaia Pearl S',
		scaleAddress: null,
		currentReconnectAttempt: 0,
		connect: vi.fn().mockResolvedValue(undefined),
		cancelConnect: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn(),
		on(event, listener) {
			const current = listeners.get(event) ?? [];
			current.push(listener);
			listeners.set(event, current);
			return service;
		},
		removeListener(event, listener) {
			listeners.set(event, (listeners.get(event) ?? []).filter((candidate) => candidate !== listener));
			return service;
		},
		emit(event, ...args) {
			for (const listener of listeners.get(event) ?? []) listener(...args);
		},
	};
	return service;
}

function createView(scales: ScaleConfig[] = []): {
	view: BrewingView;
	service: ServiceStub;
	plugin: CubicJBrewingPlugin;
} {
	const app = { scope: {} };
	const service = createService();
	const plugin = {
		app,
		acaiaService: service,
		nobleInstaller: null,
		equipment: { grinders: [], drippers: [], filters: [], baskets: [], accessories: [], scales },
		pluginLogger: null,
	} as unknown as CubicJBrewingPlugin;
	const leaf = { app, containerEl: createContainer() } as unknown as WorkspaceLeaf;
	return { view: new BrewingView(leaf, plugin), service, plugin };
}

describe('BrewingView scale connection wiring', () => {
	it('routes registered addresses to connect in last-connected-first order', async () => {
		const { view, service } = createView([
			{ name: 'Older', address: '11', lastConnectedAt: '2026-08-01T00:00:00.000Z' },
			{ name: 'Newer', address: '22', lastConnectedAt: '2026-08-20T00:00:00.000Z' },
		]);

		await view.toggleConnect();

		expect(service.connect).toHaveBeenCalledWith(['22', '11']);
		expect(pickerMocks.opens).toHaveLength(0);
	});

	it('opens the picker instead of connecting when no scales are registered', async () => {
		const { view, service } = createView();

		await view.toggleConnect();

		expect(service.connect).not.toHaveBeenCalled();
		expect(pickerMocks.opens).toHaveLength(1);
	});

	it('waits for cancelConnect before opening the picker from Find other scale', async () => {
		const { view, service } = createView();
		let releaseCancel!: () => void;
		service.cancelConnect.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					releaseCancel = resolve;
				}),
		);
		const container = createContainer();
		const internals = view as unknown as { buildToolbar(container: HTMLElement): void };
		internals.buildToolbar(container);
		const findOther = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
			(button) => button.textContent === 'scale.findOther',
		)!;

		findOther.click();

		expect(service.cancelConnect).toHaveBeenCalledOnce();
		expect(pickerMocks.opens).toHaveLength(0);
		releaseCancel();
		await vi.waitFor(() => expect(pickerMocks.opens).toHaveLength(1));
	});

	it('uses a registered custom name in the connected header', () => {
		const { view, service } = createView([
			{ name: 'Kitchen scale', address: 'aa:bb', lastConnectedAt: '2026-08-20T00:00:00.000Z' },
		]);
		service.scaleAddress = 'AABB';
		const updateHeader = vi.fn();
		const internals = view as unknown as {
			runCoordinator: { handleScaleState: ReturnType<typeof vi.fn> };
			timerController: { resetToIdle: ReturnType<typeof vi.fn> };
			scaleDisplay: {
				updateHeader: ReturnType<typeof vi.fn>;
				updateControls: ReturnType<typeof vi.fn>;
			};
			bindServiceEvents(): void;
		};
		internals.runCoordinator = { handleScaleState: vi.fn() };
		internals.timerController = { resetToIdle: vi.fn() };
		internals.scaleDisplay = { updateHeader, updateControls: vi.fn() };
		internals.bindServiceEvents();

		service.emit('state', 'connected');

		expect(updateHeader).toHaveBeenCalledWith('connected', 'Kitchen scale');
	});
});
