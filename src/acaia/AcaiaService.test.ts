import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AcaiaService } from './AcaiaService';
import { AcaiaState } from './types';

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
  const onceCallbacks: Record<string, Function> = {};
  return {
    advertisement: { localName: 'PEARLS-TEST' },
    connectAsync: vi.fn().mockResolvedValue(undefined),
    disconnectAsync: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    discoverSomeServicesAndCharacteristicsAsync: vi.fn().mockResolvedValue({
      characteristics: [writeChar, notifyChar],
    }),
    once: vi.fn((event: string, cb: Function) => { onceCallbacks[event] = cb; }),
    removeAllListeners: vi.fn(),
    _onceCallbacks: onceCallbacks,
    _writeChar: writeChar,
    _notifyChar: notifyChar,
  };
}

function createMockNoble(peripheral: ReturnType<typeof createMockPeripheral>) {
  const listeners: Record<string, Function[]> = {};
  return {
    state: 'poweredOn',
    on: vi.fn((event: string, cb: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    startScanning: vi.fn(function () {
      const cbs = listeners['discover'] || [];
      cbs.forEach(cb => cb(peripheral));
    }),
    stopScanning: vi.fn(),
    removeAllListeners: vi.fn(),
    removeListener: vi.fn(),
    _listeners: listeners,
  };
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

    (service as any).stopTimers();

    writeChar.writeAsync = vi.fn().mockRejectedValue(new Error('write failed'));

    for (let i = 0; i < 6; i++) {
      (service as any).writeQueue.push(Buffer.from([0x01]));
      await (service as any).processQueue();
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

    (service as any).stopTimers();

    let callCount = 0;
    writeChar.writeAsync = vi.fn(() => {
      callCount++;
      if (callCount === 1 || callCount === 2) return Promise.reject(new Error('fail'));
      return Promise.resolve(undefined);
    });

    (service as any).writeQueue.push(
      Buffer.from([0x01]), Buffer.from([0x02]),
      Buffer.from([0x03]),
      Buffer.from([0x04]), Buffer.from([0x05]),
    );
    await (service as any).processQueue();

    expect(service.state).toBe('connected');

    service.destroy();
  });
});
