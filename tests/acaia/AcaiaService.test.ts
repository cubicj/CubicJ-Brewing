import { describe, it, expect, vi } from 'vitest';
import { AcaiaService } from '../../src/acaia/AcaiaService';
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
	return {
		state: 'poweredOn',
		on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
			if (!listeners[event]) listeners[event] = [];
			listeners[event].push(cb);
		}),
		startScanning: vi.fn(function () {
			const cbs = listeners['discover'] || [];
			cbs.forEach((cb) => cb(peripheral));
		}),
		stopScanning: vi.fn(),
		startScanningAsync: vi.fn().mockResolvedValue(undefined),
		stopScanningAsync: vi.fn().mockResolvedValue(undefined),
		removeAllListeners: vi.fn(),
		removeListener: vi.fn(),
		_listeners: listeners,
	} as unknown as Noble & { _listeners: Record<string, ((...args: unknown[]) => void)[]> };
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

describe('AcaiaService connect', () => {
	it('transitions idle → scanning → connecting → connected', async () => {
		const peripheral = createMockPeripheral();
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });
		const states = collectStates(service);

		await service.connect();

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

		await service.connect();
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

		await service.connect();

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

		await service.connect();
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

		await service.connect();
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
			const connectPromise = service.connect();
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

	it('gives up with an error after three failed reconnect attempts', async () => {
		vi.useFakeTimers();
		const peripheral = createMockPeripheral();
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });
		try {
			const connectPromise = service.connect();
			await vi.advanceTimersByTimeAsync(200);
			await connectPromise;

			const errors: string[] = [];
			service.on('error', (err: Error) => errors.push(err.message));

			(noble as unknown as { startScanning: () => void }).startScanning = vi.fn();
			triggerDisconnect(peripheral);

			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(10000);
			await vi.advanceTimersByTimeAsync(2000);
			await vi.advanceTimersByTimeAsync(10000);
			await vi.advanceTimersByTimeAsync(4000);
			await vi.advanceTimersByTimeAsync(10000);

			expect(errors).toContain('Reconnect failed after 3 attempts');
			expect(service.state).toBe('idle');
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
			const connectPromise = service.connect();
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
			const connectPromise = service.connect();
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
			const connectPromise = service.connect();
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
			const connectPromise = service.connect();
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
			const connectPromise = service.connect();
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
	it('triggers disconnect after 6 consecutive write failures', async () => {
		const writeChar = createMockWriteChar();
		const notifyChar = createMockNotifyChar();
		const peripheral = createMockPeripheral(writeChar, notifyChar);
		const noble = createMockNoble(peripheral);
		const service = new AcaiaService({ nobleFactory: () => noble });

		await service.connect();
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

		await service.connect();

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
		const service = createQueueService();
		const internals = service as unknown as QueueInternals;
		internals.writing = true;
		await service.tare();
		await service.tare();
		expect(internals.writeQueue.filter((entry) => entry.data.equals(encodeTare()))).toHaveLength(1);
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
