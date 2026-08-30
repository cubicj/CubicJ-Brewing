import { describe, it, expect, vi } from 'vitest';
import { AcaiaService } from '../../src/acaia/AcaiaService';
import type { DiscoveredScale } from '../../src/acaia/NobleTransport';
import { encodeTare, encodeHeartbeat, encodeIdentify, encodeGetSettings } from '../../src/acaia/protocol';
import { AcaiaState, Noble } from '../../src/acaia/types';

vi.stubGlobal('window', globalThis);

type PacketHandlingService = {
	_state: AcaiaState;
	handlePacket(packet: Buffer): void;
	scaleTimerRunning: boolean;
};

type QueueInternals = {
	writing: boolean;
	writeQueue: { data: Buffer; kind: 'command' | 'heartbeat' }[];
	lastPacketTime: number;
	consecutiveWriteFailures: number;
	pushWrite(data: Buffer, kind: 'command' | 'heartbeat'): void;
	processQueue(): Promise<void>;
	runHeartbeatCycle(): Promise<void>;
	stopTimers(): void;
};

function createMockWriteChar() {
	return {
		uuid: '49535343884143f4a8d4ecbe34729bb3',
		writeAsync: vi.fn().mockResolvedValue(undefined),
		on: vi.fn(),
		removeAllListeners: vi.fn(),
	};
}

function createMockNotifyChar() {
	return {
		uuid: '495353431e4d4bd9ba6123c647249616',
		subscribeAsync: vi.fn().mockResolvedValue(undefined),
		on: vi.fn(),
		removeAllListeners: vi.fn(),
	};
}

function createMockPeripheral(writeChar = createMockWriteChar(), notifyChar = createMockNotifyChar()) {
	const onceCallbacks: Record<string, (...args: unknown[]) => void> = {};
	return {
		uuid: 'test-uuid',
		address: '00:00:00:00:00:00',
		state: 'disconnected',
		advertisement: { localName: 'PEARLS-TEST' },
		connectAsync: vi.fn().mockResolvedValue(undefined),
		disconnectAsync: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn(),
		discoverSomeServicesAndCharacteristicsAsync: vi.fn().mockResolvedValue({
			characteristics: [writeChar, notifyChar],
		}),
		once: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
			onceCallbacks[event] = cb;
		}),
		removeAllListeners: vi.fn(),
		_onceCallbacks: onceCallbacks,
		_writeChar: writeChar,
		_notifyChar: notifyChar,
	};
}

function createMockNoble(peripheral: ReturnType<typeof createMockPeripheral>) {
	const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
	const noble = {
		state: 'poweredOn',
		on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
			if (!listeners[event]) listeners[event] = [];
			listeners[event].push(cb);
			return noble;
		}),
		startScanning: vi.fn(function () {
			const cbs = listeners['discover'] || [];
			cbs.forEach((cb) => cb(peripheral));
		}),
		stopScanning: vi.fn(),
		startScanningAsync: vi.fn().mockResolvedValue(undefined),
		stopScanningAsync: vi.fn().mockResolvedValue(undefined),
		removeAllListeners: vi.fn(() => {
			for (const event of Object.keys(listeners)) delete listeners[event];
			return noble;
		}),
		removeListener: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
			listeners[event] = (listeners[event] || []).filter((candidate) => candidate !== cb);
			return noble;
		}),
		_listeners: listeners,
	} as unknown as Noble & { _listeners: Record<string, ((...args: unknown[]) => void)[]> };
	return noble;
}

function collectStates(service: AcaiaService): AcaiaState[] {
	const states: AcaiaState[] = [];
	service.on('state', (s: AcaiaState) => states.push(s));
	return states;
}

function triggerDisconnect(peripheral: ReturnType<typeof createMockPeripheral>): void {
	const cb = peripheral._onceCallbacks['disconnect'];
	if (cb) cb();
}

describe('AcaiaService targeted connect', () => {
	it('emits an error and stays idle when no targets are known', async () => {
		const noble = createMockNoble(createMockPeripheral());
		const service = new AcaiaService({ nobleFactory: () => noble });
		const errors: string[] = [];
		service.on('error', (error) => errors.push(error.message));

		await service.connect();

		expect(errors).toContain('No registered scale');
		expect(service.state).toBe('idle');
		service.destroy();
	});

	it('locks reconnect to the connected scale address', async () => {
		vi.useFakeTimers();
		const mine = createMockPeripheral();
		const other = createMockPeripheral();
		other.uuid = 'other-uuid';
		other.address = '11:11:11:11:11:11';
		other.advertisement = { localName: 'PEARLS-OTHER' };
		const noble = createMockNoble(mine);
		const service = new AcaiaService({ nobleFactory: () => noble });
		try {
			const connectPromise = service.connect(['00:00:00:00:00:00', '11:11:11:11:11:11']);
			await vi.advanceTimersByTimeAsync(200);
			await connectPromise;
			expect(service.scaleAddress).toBe('00:00:00:00:00:00');

			noble.startScanning = vi.fn(function () {
				(noble._listeners['discover'] || []).forEach((callback) => callback(other));
			});
			triggerDisconnect(mine);
			await vi.advanceTimersByTimeAsync(2000);
			expect(service.state).not.toBe('connected');
		} finally {
			service.destroy();
			vi.useRealTimers();
		}
	});
});

describe('AcaiaService picker flow', () => {
	it('collects scales and connects to the selected one', async () => {
		const peripheral = createMockPeripheral();
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });
		const found: DiscoveredScale[] = [];

		await expect(service.startPickerScan((scale) => found.push(scale))).resolves.toBe(true);
		expect(service.state).toBe('scanning');
		expect(found).toHaveLength(1);
		await service.connectToScale(found[0]);
		expect(service.state).toBe('connected');
		expect(service.scaleName).toBe('Acaia Pearl S');
		service.destroy();
	});

	it('cancelPickerScan returns to idle', async () => {
		const noble = createMockNoble(createMockPeripheral());
		const service = new AcaiaService({ nobleFactory: () => noble });

		await service.startPickerScan(() => {});
		service.cancelPickerScan();

		expect(service.state).toBe('idle');
		service.destroy();
	});

	it('does not restart collection when canceled while waiting for poweredOn', async () => {
		const noble = createMockNoble(createMockPeripheral());
		(noble as unknown as { state: string }).state = 'unknown';
		const service = new AcaiaService({ nobleFactory: () => noble });
		const scanPromise = service.startPickerScan(() => {});
		expect(service.state).toBe('scanning');

		service.cancelPickerScan();
		for (const callback of noble._listeners['stateChange'] || []) callback('poweredOn');

		await expect(scanPromise).resolves.toBe(false);
		expect(noble.startScanning).not.toHaveBeenCalled();
		expect(service.state).toBe('idle');
		service.destroy();
	});

	it('does not let a canceled picker continuation interfere with targeted connect', async () => {
		const noble = createMockNoble(createMockPeripheral());
		(noble as unknown as { state: string }).state = 'unknown';
		const service = new AcaiaService({ nobleFactory: () => noble });
		const pickerPromise = service.startPickerScan(() => {});
		const staleStateListeners = [...(noble._listeners['stateChange'] || [])];

		service.cancelPickerScan();
		(noble as unknown as { state: string }).state = 'poweredOn';
		const connectPromise = service.connect(['00:00:00:00:00:00']);
		for (const callback of staleStateListeners) callback('poweredOn');

		await expect(pickerPromise).resolves.toBe(false);
		await connectPromise;
		expect(noble.startScanning).toHaveBeenCalledOnce();
		expect(service.state).toBe('connected');
		service.destroy();
	});
});

describe('AcaiaService connect', () => {
	it('transitions idle → scanning → connecting → connected', async () => {
		const peripheral = createMockPeripheral();
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });
		const states = collectStates(service);

		await service.connect(['00:00:00:00:00:00']);

		expect(states).toEqual(['scanning', 'connecting', 'connected']);
		expect(service.state).toBe('connected');

		service.destroy();
	});
});

describe('AcaiaService reconnect', () => {
	it('emits reconnecting state after unexpected disconnect', async () => {
		const peripheral = createMockPeripheral();
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });

		await service.connect(['00:00:00:00:00:00']);
		const states = collectStates(service);

		triggerDisconnect(peripheral);

		expect(states).toContain('disconnected');
		expect(states).toContain('reconnecting');
		expect(service.state).toBe('reconnecting');

		service.destroy();
	});

	it('does not reconnect after user-initiated disconnect', async () => {
		const peripheral = createMockPeripheral();
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });

		await service.connect(['00:00:00:00:00:00']);

		const states = collectStates(service);
		service.disconnect();

		expect(states).toEqual(['idle']);
		expect(service.state).toBe('idle');

		service.destroy();
	});

	it('cancelConnect cancels active reconnect', async () => {
		const peripheral = createMockPeripheral();
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });

		await service.connect(['00:00:00:00:00:00']);
		triggerDisconnect(peripheral);

		expect(service.state).toBe('reconnecting');

		await service.cancelConnect();
		expect(service.state).toBe('idle');

		service.destroy();
	});

	it('sets reconnectAttempt counter on each retry', async () => {
		const peripheral = createMockPeripheral();
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });

		await service.connect(['00:00:00:00:00:00']);
		triggerDisconnect(peripheral);

		expect(service.state).toBe('reconnecting');
		expect(service.currentReconnectAttempt).toBe(1);

		service.destroy();
	});

	it('schedules the next attempt after a failed reconnect scan', async () => {
		vi.useFakeTimers();
		const peripheral = createMockPeripheral();
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });
		try {
			const connectPromise = service.connect(['00:00:00:00:00:00']);
			await vi.advanceTimersByTimeAsync(200);
			await connectPromise;
			expect(service.state).toBe('connected');

			(noble as unknown as { startScanning: () => void }).startScanning = vi.fn();
			triggerDisconnect(peripheral);
			expect(service.currentReconnectAttempt).toBe(1);

			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(10000);

			expect(service.currentReconnectAttempt).toBe(2);
			expect(service.state).toBe('reconnecting');
		} finally {
			service.destroy();
			vi.useRealTimers();
		}
	});

	it('gives up with an error after six failed reconnect attempts', async () => {
		vi.useFakeTimers();
		const peripheral = createMockPeripheral();
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });
		try {
			const connectPromise = service.connect(['00:00:00:00:00:00']);
			await vi.advanceTimersByTimeAsync(200);
			await connectPromise;

			const errors: string[] = [];
			service.on('error', (err: Error) => errors.push(err.message));

			(noble as unknown as { startScanning: () => void }).startScanning = vi.fn();
			triggerDisconnect(peripheral);

			for (const delay of [1000, 2000, 4000, 8000, 15000, 15000]) {
				await vi.advanceTimersByTimeAsync(delay);
				await vi.advanceTimersByTimeAsync(10000);
			}

			expect(errors).toContain('Reconnect failed after 6 attempts');
			expect(service.state).toBe('idle');
		} finally {
			service.destroy();
			vi.useRealTimers();
		}
	});

	it('caps the reconnect delay at 15 seconds', async () => {
		vi.useFakeTimers();
		const peripheral = createMockPeripheral();
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });
		try {
			const connectPromise = service.connect(['00:00:00:00:00:00']);
			await vi.advanceTimersByTimeAsync(200);
			await connectPromise;

			(noble as unknown as { startScanning: () => void }).startScanning = vi.fn();
			triggerDisconnect(peripheral);

			for (const delay of [1000, 2000, 4000, 8000]) {
				await vi.advanceTimersByTimeAsync(delay);
				await vi.advanceTimersByTimeAsync(10000);
			}
			expect(service.currentReconnectAttempt).toBe(5);
			expect(service.state).toBe('reconnecting');

			await vi.advanceTimersByTimeAsync(14999);
			expect(service.state).toBe('reconnecting');
			await vi.advanceTimersByTimeAsync(1);
			expect(service.state).toBe('scanning');
		} finally {
			service.destroy();
			vi.useRealTimers();
		}
	});

	it('does not auto-retry a failed manual connect', async () => {
		vi.useFakeTimers();
		const peripheral = createMockPeripheral();
		const noble = createMockNoble(peripheral);
		(noble as unknown as { startScanning: () => void }).startScanning = vi.fn();
		const service = new AcaiaService({ nobleFactory: () => noble });
		try {
			const connectPromise = service.connect(['00:00:00:00:00:00']);
			await vi.advanceTimersByTimeAsync(10000);
			await connectPromise;

			expect(service.state).toBe('idle');
			expect(service.currentReconnectAttempt).toBe(0);
			await vi.advanceTimersByTimeAsync(20000);
			expect(service.state).toBe('idle');
		} finally {
			service.destroy();
			vi.useRealTimers();
		}
	});
});

describe('AcaiaService destroy during connect', () => {
	it('does not throw when destroyed while waiting for poweredOn', async () => {
		vi.useFakeTimers();
		const peripheral = createMockPeripheral();
		const noble = createMockNoble(peripheral);
		(noble as unknown as { state: string }).state = 'unknown';
		const service = new AcaiaService({ nobleFactory: () => noble });
		try {
			const connectPromise = service.connect(['00:00:00:00:00:00']);
			service.destroy();
			await vi.advanceTimersByTimeAsync(11000);
			await connectPromise;
			expect(service.state).toBe('idle');
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not throw when destroyed during scanning', async () => {
		vi.useFakeTimers();
		const peripheral = createMockPeripheral();
		const noble = createMockNoble(peripheral);
		(noble as unknown as { startScanning: () => void }).startScanning = vi.fn();
		const service = new AcaiaService({ nobleFactory: () => noble });
		try {
			const connectPromise = service.connect(['00:00:00:00:00:00']);
			service.destroy();
			await vi.advanceTimersByTimeAsync(11000);
			await connectPromise;
			expect(service.state).toBe('idle');
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('AcaiaService heartbeat silence', () => {
	it('does not declare the connection dead right after connect before any packet', async () => {
		vi.useFakeTimers();
		const peripheral = createMockPeripheral();
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });
		try {
			const connectPromise = service.connect(['00:00:00:00:00:00']);
			await vi.advanceTimersByTimeAsync(200);
			await connectPromise;
			expect(service.state).toBe('connected');

			await vi.advanceTimersByTimeAsync(1500);
			expect(service.state).toBe('connected');
		} finally {
			service.destroy();
			vi.useRealTimers();
		}
	});

	it('declares the connection dead after sustained silence', async () => {
		vi.useFakeTimers();
		const peripheral = createMockPeripheral();
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });
		try {
			const connectPromise = service.connect(['00:00:00:00:00:00']);
			await vi.advanceTimersByTimeAsync(200);
			await connectPromise;
			expect(service.state).toBe('connected');

			await vi.advanceTimersByTimeAsync(9500);
			expect(service.state).toBe('reconnecting');
		} finally {
			service.destroy();
			vi.useRealTimers();
		}
	});
});

describe('AcaiaService handlePacket routing', () => {
	function buildCompoundPacket(innerPayload: number[]): Buffer {
		const payloadLen = innerPayload.length;
		const buf = Buffer.alloc(5 + payloadLen);
		buf[0] = 0xef;
		buf[1] = 0xdd;
		buf[2] = 12;
		buf[3] = payloadLen;
		for (let i = 0; i < payloadLen; i++) buf[4 + i] = innerPayload[i];
		return buf;
	}

	function buildSettingsPacket(
		battery: number,
		timerRunning: number,
		units: number,
		autoOff: number,
		beep: number,
	): Buffer {
		const payload = [battery, timerRunning, units, 0, autoOff, 0, 0, 0, beep];
		const buf = Buffer.alloc(5 + payload.length);
		buf[0] = 0xef;
		buf[1] = 0xdd;
		buf[2] = 8;
		buf[3] = payload.length;
		for (let i = 0; i < payload.length; i++) buf[4 + i] = payload[i];
		return buf;
	}

	function createConnectedService(): AcaiaService {
		const peripheral = createMockPeripheral();
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });
		(service as unknown as PacketHandlingService)._state = 'connected';
		return service;
	}

	it('emits weight from compound packet', () => {
		const service = createConnectedService();
		const weights: { grams: number; stable: boolean }[] = [];
		service.on('weight', (grams: number, stable: boolean) => weights.push({ grams, stable }));

		const innerPayload = [5, 0xe8, 0x03, 0, 0, 1, 0x00];
		const packet = buildCompoundPacket(innerPayload);
		(service as unknown as PacketHandlingService).handlePacket(packet);

		expect(weights).toHaveLength(1);
		expect(weights[0].grams).toBeCloseTo(100.0);
		expect(weights[0].stable).toBe(true);

		service.destroy();
	});

	it('emits weight with negative and unstable flags', () => {
		const service = createConnectedService();
		const weights: { grams: number; stable: boolean }[] = [];
		service.on('weight', (grams: number, stable: boolean) => weights.push({ grams, stable }));

		const innerPayload = [5, 0xe8, 0x03, 0, 0, 1, 0x03];
		const packet = buildCompoundPacket(innerPayload);
		(service as unknown as PacketHandlingService).handlePacket(packet);

		expect(weights[0].grams).toBeCloseTo(-100.0);
		expect(weights[0].stable).toBe(false);

		service.destroy();
	});

	it('emits timer from compound packet', () => {
		const service = createConnectedService();
		const timers: number[] = [];
		service.on('timer', (seconds: number) => timers.push(seconds));

		const innerPayload = [7, 2, 30, 5];
		const packet = buildCompoundPacket(innerPayload);
		(service as unknown as PacketHandlingService).handlePacket(packet);

		expect(timers).toHaveLength(1);
		expect(timers[0]).toBeCloseTo(2 * 60 + 30 + 0.5);

		service.destroy();
	});

	it('emits battery and timer_start on settings state change', () => {
		const service = createConnectedService();
		(service as unknown as PacketHandlingService).scaleTimerRunning = false;

		const batteries: number[] = [];
		const buttons: { type: string }[] = [];
		service.on('battery', (pct: number) => batteries.push(pct));
		service.on('button', (evt: { type: string }) => buttons.push(evt));

		const packet = buildSettingsPacket(85, 1, 2, 1, 0);
		(service as unknown as PacketHandlingService).handlePacket(packet);

		expect(batteries).toEqual([85]);
		expect(buttons).toEqual([{ type: 'timer_start' }]);

		service.destroy();
	});

	it('emits timer_stop on settings timer state change', () => {
		const service = createConnectedService();
		(service as unknown as PacketHandlingService).scaleTimerRunning = true;

		const buttons: { type: string }[] = [];
		service.on('button', (evt: { type: string }) => buttons.push(evt));

		const packet = buildSettingsPacket(90, 0, 2, 1, 0);
		(service as unknown as PacketHandlingService).handlePacket(packet);

		expect(buttons).toEqual([{ type: 'timer_stop' }]);

		service.destroy();
	});

	it('does not emit button when timer state unchanged', () => {
		const service = createConnectedService();
		(service as unknown as PacketHandlingService).scaleTimerRunning = false;

		const buttons: { type: string }[] = [];
		service.on('button', (evt: { type: string }) => buttons.push(evt));

		const packet = buildSettingsPacket(90, 0, 2, 1, 0);
		(service as unknown as PacketHandlingService).handlePacket(packet);

		expect(buttons).toEqual([]);

		service.destroy();
	});

	it('ignores packets with invalid header', () => {
		const service = createConnectedService();
		const weights: number[] = [];
		service.on('weight', (g: number) => weights.push(g));

		const packet = Buffer.from([0xaa, 0xbb, 12, 7, 5, 0xe8, 0x03, 0, 0, 2, 0x00, 0, 0]);
		(service as unknown as PacketHandlingService).handlePacket(packet);

		expect(weights).toEqual([]);

		service.destroy();
	});
});

describe('AcaiaService write health', () => {
	it('disconnects after two completely failed heartbeat cycles', async () => {
		const writeChar = createMockWriteChar();
		const notifyChar = createMockNotifyChar();
		const peripheral = createMockPeripheral(writeChar, notifyChar);
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });

		await service.connect(['00:00:00:00:00:00']);
		expect(service.state).toBe('connected');

		const internals = service as unknown as QueueInternals;
		internals.stopTimers();
		writeChar.writeAsync = vi.fn().mockRejectedValue(new Error('write failed'));

		internals.lastPacketTime = Date.now();
		await internals.runHeartbeatCycle();
		expect(internals.consecutiveWriteFailures).toBe(3);
		expect(service.state).toBe('connected');

		internals.lastPacketTime = Date.now();
		await internals.runHeartbeatCycle();
		expect(service.state).toBe('reconnecting');

		service.destroy();
	});

	it('triggers disconnect after 6 consecutive write failures', async () => {
		const writeChar = createMockWriteChar();
		const notifyChar = createMockNotifyChar();
		const peripheral = createMockPeripheral(writeChar, notifyChar);
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });

		await service.connect(['00:00:00:00:00:00']);
		expect(service.state).toBe('connected');

		(service as unknown as QueueInternals).stopTimers();

		writeChar.writeAsync = vi.fn().mockRejectedValue(new Error('write failed'));

		for (let i = 0; i < 6; i++) {
			(service as unknown as QueueInternals).writeQueue.push({ data: Buffer.from([0x01]), kind: 'command' });
			await (service as unknown as QueueInternals).processQueue();
		}

		expect(service.state).not.toBe('connected');

		service.destroy();
	});

	it('resets failure count on successful write', async () => {
		const writeChar = createMockWriteChar();
		const notifyChar = createMockNotifyChar();
		const peripheral = createMockPeripheral(writeChar, notifyChar);
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });

		await service.connect(['00:00:00:00:00:00']);

		(service as unknown as QueueInternals).stopTimers();

		let callCount = 0;
		writeChar.writeAsync = vi.fn(() => {
			callCount++;
			if (callCount === 1 || callCount === 2) return Promise.reject(new Error('fail'));
			return Promise.resolve(undefined);
		});

		(service as unknown as QueueInternals).writeQueue.push(
			{ data: Buffer.from([0x01]), kind: 'command' },
			{ data: Buffer.from([0x02]), kind: 'command' },
			{ data: Buffer.from([0x03]), kind: 'command' },
			{ data: Buffer.from([0x04]), kind: 'command' },
			{ data: Buffer.from([0x05]), kind: 'command' },
		);
		await (service as unknown as QueueInternals).processQueue();

		expect(service.state).toBe('connected');

		service.destroy();
	});

	it('times out a stalled write and counts it as a failure', async () => {
		vi.useFakeTimers();
		const writeChar = createMockWriteChar();
		const notifyChar = createMockNotifyChar();
		const peripheral = createMockPeripheral(writeChar, notifyChar);
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });
		try {
			const connectPromise = service.connect(['00:00:00:00:00:00']);
			await vi.advanceTimersByTimeAsync(200);
			await connectPromise;
			expect(service.state).toBe('connected');
			(service as unknown as QueueInternals).stopTimers();

			writeChar.writeAsync = vi.fn(() => new Promise<void>(() => undefined));
			const internals = service as unknown as QueueInternals;
			internals.writeQueue.push({ data: Buffer.from([0x01]), kind: 'command' });
			const pending = internals.processQueue();
			await vi.advanceTimersByTimeAsync(3000);
			await pending;

			expect(internals.consecutiveWriteFailures).toBe(1);
			expect(service.state).toBe('connected');
		} finally {
			service.destroy();
			vi.useRealTimers();
		}
	});
});

describe('AcaiaService write queue', () => {
	function createQueueService(): AcaiaService {
		const peripheral = createMockPeripheral();
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });
		(service as unknown as { _state: AcaiaState })._state = 'connected';
		return service;
	}

	it('inserts a command ahead of queued heartbeat packets', () => {
		const service = createQueueService();
		const internals = service as unknown as QueueInternals;
		internals.writing = true;
		internals.pushWrite(encodeIdentify(), 'heartbeat');
		internals.pushWrite(encodeGetSettings(), 'heartbeat');
		internals.pushWrite(encodeTare(), 'command');
		expect(internals.writeQueue.map((entry) => entry.kind)).toEqual(['command', 'heartbeat', 'heartbeat']);
		expect(internals.writeQueue[0].data.equals(encodeTare())).toBe(true);
		service.destroy();
	});

	it('drops a duplicate pending payload', () => {
		const service = createQueueService();
		const internals = service as unknown as QueueInternals;
		internals.writing = true;
		internals.pushWrite(encodeTare(), 'command');
		internals.pushWrite(encodeTare(), 'command');
		expect(internals.writeQueue).toHaveLength(1);
		service.destroy();
	});

	it('absorbs a second tare pressed while the first is still pending', async () => {
		let resolveWrite!: () => void;
		const writeChar = createMockWriteChar();
		const peripheral = createMockPeripheral(writeChar);
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });
		await service.connect(['00:00:00:00:00:00']);
		(service as unknown as QueueInternals).stopTimers();

		writeChar.writeAsync = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise<void>((resolve) => {
						resolveWrite = resolve;
					}),
			)
			.mockResolvedValue(undefined);

		const firstTare = service.tare();
		await vi.waitFor(() => expect(writeChar.writeAsync).toHaveBeenCalledTimes(1));
		await service.tare();

		resolveWrite();
		await firstTare;

		const tareWrites = writeChar.writeAsync.mock.calls.filter(([data]) => data.equals(encodeTare()));
		expect(tareWrites).toHaveLength(1);
		service.destroy();
	});

	it('ignores a stale queue processor after connection cleanup', async () => {
		let rejectWrite!: (reason: Error) => void;
		const writeChar = createMockWriteChar();
		const peripheral = createMockPeripheral(writeChar);
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });
		await service.connect(['00:00:00:00:00:00']);
		const internals = service as unknown as QueueInternals;
		internals.stopTimers();

		writeChar.writeAsync = vi.fn(
			() =>
				new Promise<void>((_, reject) => {
					rejectWrite = reject;
				}),
		);

		const stalledTare = service.tare();
		await vi.waitFor(() => expect(writeChar.writeAsync).toHaveBeenCalledTimes(1));
		service.disconnect();

		const newEntry = { data: encodeHeartbeat(), kind: 'heartbeat' as const };
		internals.writeQueue.push(newEntry);
		internals.consecutiveWriteFailures = 4;
		internals.writing = true;

		rejectWrite(new Error('old write failed'));
		await stalledTare;

		expect(internals.writeQueue).toEqual([newEntry]);
		expect(internals.consecutiveWriteFailures).toBe(4);
		expect(internals.writing).toBe(true);

		service.destroy();
	});

	it('skips a heartbeat cycle while the previous cycle is still queued', async () => {
		const service = createQueueService();
		const internals = service as unknown as QueueInternals;
		internals.writing = true;
		internals.lastPacketTime = Date.now();
		internals.pushWrite(encodeHeartbeat(), 'heartbeat');
		await internals.runHeartbeatCycle();
		expect(internals.writeQueue).toHaveLength(1);
		service.destroy();
	});

	it('queues a fresh heartbeat cycle when no heartbeat backlog exists', async () => {
		const service = createQueueService();
		const internals = service as unknown as QueueInternals;
		internals.writing = true;
		internals.lastPacketTime = Date.now();
		await internals.runHeartbeatCycle();
		expect(internals.writeQueue.map((entry) => entry.kind)).toEqual(['heartbeat', 'heartbeat', 'heartbeat']);
		service.destroy();
	});
});
