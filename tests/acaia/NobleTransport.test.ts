import { describe, expect, it, vi } from 'vitest';
import { NobleTransport } from '../../src/acaia/NobleTransport';
import { normalizeScaleAddress } from '../../src/acaia/types';
import type { Noble, NobleCharacteristic, NoblePeripheral } from '../../src/acaia/types';

vi.stubGlobal('window', globalThis);

function createPeripheral(
	localName: string,
	address = `${localName}-address`,
): NoblePeripheral & { disconnect: ReturnType<typeof vi.fn> } {
	return {
		uuid: `${localName}-uuid`,
		id: `${localName}-id`,
		address,
		state: 'disconnected',
		advertisement: { localName },
		connectAsync: vi.fn().mockResolvedValue(undefined),
		disconnectAsync: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn<() => void>(),
		discoverSomeServicesAndCharacteristicsAsync: vi.fn().mockResolvedValue({ characteristics: [] }),
		on: vi.fn(),
		once: vi.fn(),
		removeAllListeners: vi.fn(),
	};
}

function createNoble(initialListeners: Record<string, ((...args: unknown[]) => void)[]> = {}) {
	let listeners = { ...initialListeners };
	const stopScanning = vi.fn();
	const noble = {
		state: 'poweredOn',
		on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
			(listeners[event] ??= []).push(listener);
			return noble;
		}),
		removeListener: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
			listeners[event] = (listeners[event] ?? []).filter((candidate) => candidate !== listener);
			return noble;
		}),
		removeAllListeners: vi.fn(() => {
			listeners = {};
			return noble;
		}),
		startScanning: vi.fn(),
		startScanningAsync: vi.fn().mockResolvedValue(undefined),
		stopScanning,
		stopScanningAsync: vi.fn().mockResolvedValue(undefined),
		emit(event: string, ...args: unknown[]) {
			for (const listener of listeners[event] ?? []) listener(...args);
		},
	} as unknown as Noble & {
		emit(event: string, ...args: unknown[]): void;
		startScanning: ReturnType<typeof vi.fn>;
		stopScanning: ReturnType<typeof vi.fn>;
	};
	return noble;
}

describe('NobleTransport', () => {
	it('normalizes scale addresses', () => {
		expect(normalizeScaleAddress('AA:BB-cc dd')).toBe('aabbccdd');
	});

	it('resets the process-wide noble singleton before subscribing to state changes', () => {
		const stalePoweredOff = vi.fn();
		const poweredOff = vi.fn();
		const noble = createNoble({ stateChange: [stalePoweredOff] });
		const transport = new NobleTransport({
			nobleFactory: () => noble,
			onPoweredOff: poweredOff,
			onDisconnect: vi.fn(),
			onData: vi.fn(),
		});

		transport.initialize();
		noble.emit('stateChange', 'poweredOff');

		expect(noble.removeAllListeners).toHaveBeenCalledOnce();
		expect(noble.stopScanning).toHaveBeenCalledOnce();
		expect(stalePoweredOff).not.toHaveBeenCalled();
		expect(poweredOff).toHaveBeenCalledOnce();
	});

	it('discovers only a targeted scale and stops scanning', async () => {
		const unsupported = createPeripheral('OTHER');
		const scale = createPeripheral('PEARLS-TEST');
		const noble = createNoble();
		const transport = new NobleTransport({
			nobleFactory: () => noble,
			onPoweredOff: vi.fn(),
			onDisconnect: vi.fn(),
			onData: vi.fn(),
		});
		transport.initialize();
		noble.stopScanning.mockClear();
		noble.startScanning.mockImplementation(() => {
			noble.emit('discover', unsupported);
			noble.emit('discover', scale);
		});

		await expect(transport.scanForScale(['PEARLS-TEST-address'])).resolves.toEqual({
			id: 'PEARLS-TEST-id',
			localName: 'PEARLS-TEST',
			address: 'PEARLS-TEST-address',
		});
		expect(noble.stopScanning).toHaveBeenCalledOnce();
	});

	it('targeted scan resolves on address match without waiting for localName', async () => {
		const scale = createPeripheral('', 'AA:BB:CC:DD:EE:FF');
		scale.advertisement = {};
		const noble = createNoble();
		const transport = new NobleTransport({
			nobleFactory: () => noble,
			onPoweredOff: vi.fn(),
			onDisconnect: vi.fn(),
			onData: vi.fn(),
		});
		transport.initialize();
		noble.startScanning.mockImplementation(() => noble.emit('discover', scale));

		await expect(transport.scanForScale(['aabbccddeeff'])).resolves.toMatchObject({
			address: 'AA:BB:CC:DD:EE:FF',
		});
	});

	it('targeted scan skips a prefix-matching scale whose address is not registered', async () => {
		const other = createPeripheral('PEARLS-OTHER', '11:11:11:11:11:11');
		const mine = createPeripheral('PEARLS-MINE', '22:22:22:22:22:22');
		const noble = createNoble();
		const transport = new NobleTransport({
			nobleFactory: () => noble,
			onPoweredOff: vi.fn(),
			onDisconnect: vi.fn(),
			onData: vi.fn(),
		});
		transport.initialize();
		noble.startScanning.mockImplementation(() => {
			noble.emit('discover', other);
			noble.emit('discover', mine);
		});

		await expect(transport.scanForScale(['22:22:22:22:22:22'])).resolves.toMatchObject({
			localName: 'PEARLS-MINE',
		});
	});

	it('collect scan emits each prefix-matching scale once and selectScale picks it', () => {
		const scale = createPeripheral('PEARLS-TEST');
		const noise = createPeripheral('OTHER');
		const noble = createNoble();
		const transport = new NobleTransport({
			nobleFactory: () => noble,
			onPoweredOff: vi.fn(),
			onDisconnect: vi.fn(),
			onData: vi.fn(),
		});
		transport.initialize();
		const seen: unknown[] = [];

		expect(transport.startCollectScan((discovered) => seen.push(discovered))).toBe(true);
		noble.emit('discover', scale);
		noble.emit('discover', scale);
		noble.emit('discover', noise);
		expect(seen).toHaveLength(1);
		transport.stopCollectScan();
		expect(transport.selectScale((seen[0] as { id: string }).id)).toBe(true);
		expect(transport.selectScale('missing')).toBe(false);
	});

	it('does not retain a collected scale discovered after synchronous cleanup', () => {
		const scale = createPeripheral('PEARLS-TEST');
		const noble = createNoble();
		const transport = new NobleTransport({
			nobleFactory: () => noble,
			onPoweredOff: vi.fn(),
			onDisconnect: vi.fn(),
			onData: vi.fn(),
		});
		transport.initialize();
		expect(transport.startCollectScan(vi.fn())).toBe(true);

		transport.disconnectSync();
		noble.emit('discover', scale);

		expect(transport.selectScale(scale.id!)).toBe(false);
	});

	it('disconnects the owned peripheral synchronously', async () => {
		const scale = createPeripheral('PEARLS-TEST');
		const noble = createNoble();
		const transport = new NobleTransport({
			nobleFactory: () => noble,
			onPoweredOff: vi.fn(),
			onDisconnect: vi.fn(),
			onData: vi.fn(),
		});
		transport.initialize();
		noble.startScanning.mockImplementation(() => noble.emit('discover', scale));
		await transport.scanForScale(['PEARLS-TEST-address']);

		transport.disconnectSync();

		expect(scale.disconnect).toHaveBeenCalledOnce();
		expect(scale.removeAllListeners).toHaveBeenCalledWith('disconnect');
	});

	it('does not retain a scale discovered after synchronous cleanup', async () => {
		const scale = createPeripheral('PEARLS-TEST');
		const noble = createNoble();
		const transport = new NobleTransport({
			nobleFactory: () => noble,
			onPoweredOff: vi.fn(),
			onDisconnect: vi.fn(),
			onData: vi.fn(),
		});
		transport.initialize();
		const scanPromise = transport.scanForScale(['PEARLS-TEST-address']);

		transport.disconnectSync();
		noble.emit('discover', scale);

		await expect(scanPromise).resolves.toBeNull();
		expect(transport.peripheralState).toBeNull();
	});

	it('does not retain characteristics discovered after synchronous cleanup', async () => {
		const scale = createPeripheral('PEARLS-TEST');
		const noble = createNoble();
		const transport = new NobleTransport({
			nobleFactory: () => noble,
			onPoweredOff: vi.fn(),
			onDisconnect: vi.fn(),
			onData: vi.fn(),
		});
		transport.initialize();
		noble.startScanning.mockImplementation(() => noble.emit('discover', scale));
		await transport.scanForScale(['PEARLS-TEST-address']);

		let resolveDiscovery!: (value: { characteristics: NobleCharacteristic[] }) => void;
		const writeChar = {
			uuid: '49535343884143f4a8d4ecbe34729bb3',
			on: vi.fn(),
			removeAllListeners: vi.fn(),
			subscribeAsync: vi.fn().mockResolvedValue(undefined),
			writeAsync: vi.fn().mockResolvedValue(undefined),
		};
		const notifyChar = { ...writeChar, uuid: '495353431e4d4bd9ba6123c647249616' };
		scale.discoverSomeServicesAndCharacteristicsAsync = vi.fn(
			() =>
				new Promise<{ characteristics: NobleCharacteristic[] }>((resolve) => {
					resolveDiscovery = resolve;
				}),
		);
		const discoveryPromise = transport.discoverCharacteristics(10000);

		transport.disconnectSync();
		resolveDiscovery({ characteristics: [writeChar, notifyChar] });

		await expect(discoveryPromise).resolves.toMatchObject({ ready: false });
		expect(transport.canWrite).toBe(false);
	});
});
