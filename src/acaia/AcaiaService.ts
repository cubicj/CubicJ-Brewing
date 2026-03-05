import { EventEmitter } from 'events';
import { AcaiaState, AcaiaEvents, ButtonEvent, NOBLE_PATH, SCALE_PREFIXES, WRITE_UUID, NOTIFY_UUID, Noble, NoblePeripheral, NobleCharacteristic, resolveModelName } from './types';
import {
  encodeIdentify, encodeHeartbeat, encodeNotificationRequest,
  encodeTare, encodeTimerControl, encodeGetSettings,
  decodeWeight, decodeTimer, decodeSettings, PacketBuffer,
} from './protocol';

export interface BleLogger {
  log(message: string): void;
}

export interface AcaiaServiceOptions {
  nobleFactory?: () => Noble | null;
  logger?: BleLogger;
}

class StaleConnectionError extends Error {
  constructor() { super('Connection aborted (stale)'); }
}

export class AcaiaService extends EventEmitter {
  private _state: AcaiaState = 'idle';
  private nobleFactory: () => Noble | null;
  private noble: Noble | null = null;
  private peripheral: NoblePeripheral | null = null;
  private writeChar: NobleCharacteristic | null = null;
  private notifyChar: NobleCharacteristic | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastPacketTime = 0;
  private packetBuffer = new PacketBuffer();
  private writeQueue: Buffer[] = [];
  private writing = false;
  private scaleTimerRunning = false;
  private connecting = false;
  private connectAborted = false;
  private disconnecting = false;
  private consecutiveWriteFailures = 0;
  private static readonly MAX_WRITE_FAILURES = 6;
  private static readonly SILENCE_WARN_MS = 5000;
  private static readonly SILENCE_DEAD_MS = 8000;
  private static readonly MAX_RECONNECT_ATTEMPTS = 3;
  private static readonly RECONNECT_BASE_MS = 1000;
  private userDisconnected = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectId = 0;
  private _scaleName: string | null = null;
  private logger?: BleLogger;

  constructor(options?: AcaiaServiceOptions) {
    super();
    this.on('error', () => {});
    this.logger = options?.logger;
    this.nobleFactory = options?.nobleFactory ?? (() => {
      try {
        const noble = require(NOBLE_PATH);
        noble.removeAllListeners();
        try { noble.stopScanning(); } catch {}
        return noble;
      } catch { return null; }
    });
  }

  private log(msg: string): void {
    this.logger?.log(msg);
  }



  private assertNotStale(myId: number): void {
    if (this.connectId !== myId) throw new StaleConnectionError();
  }

  get state(): AcaiaState {
    return this._state;
  }

  get scaleName(): string | null {
    return this._scaleName;
  }

  get currentReconnectAttempt(): number {
    return this.reconnectAttempt;
  }

  async connect(): Promise<void> {
    if (this.connecting) { this.log('connect() skipped — already connecting'); return; }
    if (this._state !== 'idle' && this._state !== 'disconnected' && this._state !== 'reconnecting') {
      this.log(`connect() skipped — state=${this._state}`);
      return;
    }

    this.connecting = true;
    this.connectAborted = false;
    const myId = ++this.connectId;
    this.log(`connect() start — id=${myId}, state=${this._state}, reconnectAttempt=${this.reconnectAttempt}`);

    try {
      const noble = this.initNoble();
      this.setState('scanning');

      await this.waitForPoweredOnOrThrow(noble, myId);
      const peripheral = await this.scanForScaleOrThrow(noble, myId);

      this.peripheral = peripheral;
      const localName = peripheral.advertisement?.localName ?? '';
      this._scaleName = localName ? resolveModelName(localName) : null;
      this.setState('connecting');

      await this.establishConnection(peripheral, myId);
      await this.setupNotifications(myId);
      await this.performHandshake(myId);

      this.startHeartbeat();
      this.reconnectAttempt = 0;
      this.userDisconnected = false;
      this.setState('connected');
      this.log('connection complete');
    } catch (err: unknown) {
      if (err instanceof StaleConnectionError) {
        this.log(`stale connect (id=${myId}, current=${this.connectId})`);
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`connect() caught: ${msg}`);
      this.emitError(msg || 'Connection failed');
      this.cleanupConnection();
      this.setState('idle');
    } finally {
      if (this.connectId === myId) this.connecting = false;
      this.log(`connect() finally — id=${myId}, current=${this.connectId}, state=${this._state}`);
    }
  }

  private initNoble(): Noble {
    const noble = this.nobleFactory();
    if (!noble) {
      this.log('noble factory returned null');
      this.emitError('Failed to load noble BLE library');
      throw new Error('Noble unavailable');
    }
    this.noble = noble;
    this.log(`noble.state=${noble.state}`);

    noble.on('stateChange', (state: string) => {
      this.log(`noble stateChange: ${state}`);
      if (state === 'poweredOff') {
        this.log('Bluetooth adapter powered off — cleaning up');
        this.emitError('Bluetooth adapter turned off');
        this.disconnect();
      }
    });

    return noble;
  }

  private async waitForPoweredOnOrThrow(noble: Noble, myId: number): Promise<void> {
    if (noble.state === 'poweredOn') {
      this.log('already poweredOn');
      return;
    }
    this.log('waiting for poweredOn...');
    const ready = await this.waitForPoweredOn();
    this.assertNotStale(myId);
    if (!ready) {
      this.emitError('BLE adapter not ready');
      this.setState('idle');
      throw new StaleConnectionError();
    }
    this.log('poweredOn ready');
  }

  private async scanForScaleOrThrow(noble: Noble, myId: number): Promise<NoblePeripheral> {
    this.log('scanning for scale...');
    const peripheral = await this.scanForScale();
    this.assertNotStale(myId);
    if (!peripheral) {
      this.log('scan done — no scale found');
      this.emitError('No scale found (10s timeout)');
      this.setState('idle');
      throw new StaleConnectionError();
    }
    this.log(`scale found: ${peripheral.advertisement?.localName} (${peripheral.address})`);
    return peripheral;
  }

  private async establishConnection(peripheral: NoblePeripheral, myId: number): Promise<void> {
    if (peripheral.state === 'connected') {
      this.log('peripheral already connected at BLE level, disconnecting first...');
      try { await peripheral.disconnectAsync(); } catch {}
    }

    this.log('connectAsync...');
    await this.connectWithCleanup(peripheral, 10000);
    this.assertNotStale(myId);
    this.log('connectAsync done');

    peripheral.once('disconnect', () => this.handleDisconnect());

    let characteristics: NobleCharacteristic[] | undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        this.log(`discoverAsync... (attempt ${attempt + 1})`);
        const result = await this.discoverWithCleanup(peripheral, 10000);
        characteristics = result.characteristics;
        break;
      } catch (discoverErr: unknown) {
        this.assertNotStale(myId);
        if (attempt >= 1) throw discoverErr;
        const msg = discoverErr instanceof Error ? discoverErr.message : String(discoverErr);
        this.log(`discover failed (attempt ${attempt + 1}): ${msg} — retrying after reconnect`);
        try { await peripheral.disconnectAsync(); } catch {}
        await new Promise(r => setTimeout(r, 500));
        this.assertNotStale(myId);
        this.log('reconnecting for discover retry...');
        await this.connectWithCleanup(peripheral, 10000);
        this.assertNotStale(myId);
      }
    }
    this.assertNotStale(myId);
    this.log(`discover done — ${characteristics!.length} characteristics`);

    this.writeChar = characteristics!.find((c) => c.uuid === WRITE_UUID) ?? null;
    this.notifyChar = characteristics!.find((c) => c.uuid === NOTIFY_UUID) ?? null;

    if (!this.writeChar || !this.notifyChar) {
      this.log(`chars missing — write=${!!this.writeChar}, notify=${!!this.notifyChar}`);
      this.emitError('Required BLE characteristics not found');
      try { await peripheral.disconnectAsync(); } catch {}
      this.cleanupConnection();
      this.setState('idle');
      throw new StaleConnectionError();
    }
  }

  private async setupNotifications(myId: number): Promise<void> {
    this.packetBuffer.onPacket = (packet) => this.handlePacket(packet);
    this.notifyChar!.on('data', (data: Buffer) => {
      this.lastPacketTime = Date.now();
      this.packetBuffer.push(data);
    });
    this.log('subscribing to notify...');
    await this.withTimeout(this.notifyChar!.subscribeAsync(), 5000, 'Notify subscribe');
    this.assertNotStale(myId);
    this.log('notify subscribed');
  }

  private async performHandshake(myId: number): Promise<void> {
    this.assertNotStale(myId);
    this.log('sending handshake (identify + notifReq + getSettings)...');
    await this.enqueueWrite(encodeIdentify());
    await this.enqueueWrite(encodeNotificationRequest());
    await this.enqueueWrite(encodeGetSettings());
    this.log('handshake sent');
  }

  async cancelConnect(): Promise<void> {
    this.log(`cancelConnect() — state=${this._state}, connecting=${this.connecting}, id=${this.connectId}`);
    this.connectId++;
    this.connectAborted = true;
    this.connecting = false;
    this.cancelReconnect();
    try { if (this.noble) this.noble.stopScanning(); } catch {}
    const peripheral = this.peripheral;
    this.cleanupConnection();
    if (peripheral) {
      try { await peripheral.disconnectAsync(); } catch {}
    }
    this.setState('idle');
  }

  disconnect(): void {
    this.log(`disconnect() — user-initiated, state=${this._state}`);
    this.userDisconnected = true;
    this.cancelReconnect();
    const peripheral = this.peripheral;
    this.cleanupConnection();
    if (peripheral) {
      try { peripheral.disconnect(); } catch {}
    }
    this.setState('idle');
  }

  async tare(): Promise<void> {
    if (this._state !== 'connected') return;
    await this.enqueueWrite(encodeTare());
  }

  async sendNotificationRequest(): Promise<void> {
    await this.enqueueWrite(encodeNotificationRequest());
  }

  async startTimer(): Promise<void> {
    if (this._state !== 'connected') return;
    await this.enqueueWrite(encodeTimerControl('start'));
  }

  async stopTimer(): Promise<void> {
    if (this._state !== 'connected') return;
    await this.enqueueWrite(encodeTimerControl('stop'));
  }

  async resetTimer(): Promise<void> {
    if (this._state !== 'connected') return;
    await this.enqueueWrite(encodeTimerControl('reset'));
  }

  destroy(): void {
    this.log(`destroy() — state=${this._state}, id=${this.connectId}`);
    this.connectId++;
    this.connectAborted = true;
    this.cancelReconnect();
    const peripheral = this.peripheral;
    this.cleanupConnection();
    if (peripheral) {
      try { peripheral.disconnect(); } catch {}
    }
    if (this.noble) {
      try { this.noble.stopScanning(); } catch {}
      this.noble.removeAllListeners();
      this.noble = null;
    }
    this.removeAllListeners();
    this._state = 'idle';
  }

  private waitForPoweredOn(timeoutMs = 10000): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), timeoutMs);
      const onState = (state: string) => {
        if (state === 'poweredOn') {
          clearTimeout(timer);
          this.noble.removeListener('stateChange', onState);
          resolve(true);
        }
      };
      this.noble.on('stateChange', onState);
    });
  }

  private scanForScale(timeoutMs = 10000): Promise<NoblePeripheral | null> {
    return new Promise((resolve) => {
      let discoverCount = 0;

      const cleanup = () => {
        this.noble!.removeListener('discover', onDiscover);
        this.noble!.stopScanning();
      };

      const timer = setTimeout(() => {
        cleanup();
        this.log(`scan timeout — ${discoverCount} peripherals seen, no scale`);
        resolve(null);
      }, timeoutMs);

      const onDiscover = (p: NoblePeripheral) => {
        discoverCount++;
        const name = p.advertisement?.localName || '';
        const addr = p.address || p.id || '??';
        const prefix5 = name.substring(0, 5).toUpperCase();

        if (SCALE_PREFIXES.includes(prefix5)) {
          clearTimeout(timer);
          cleanup();
          resolve(p);
        } else {
          this.log(`scan: skipped "${name}" (${addr})`);
        }
      };

      this.noble.on('discover', onDiscover);
      try {
        this.noble.startScanning([], false);
      } catch (scanErr: unknown) {
        const msg = scanErr instanceof Error ? scanErr.message : String(scanErr);
        this.log(`startScanning error: ${msg}`);
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  private handlePacket(packet: Buffer): void {
    if (packet.length < 3 || packet[0] !== 0xef || packet[1] !== 0xdd) return;

    const cmd = packet[2];

    if ((cmd === 12 || cmd === 11) && packet.length > 4) {
      const totalPayloadLen = packet[3];
      const payloadEnd = 3 + totalPayloadLen;
      let offset = 4;

      while (offset < payloadEnd) {
        const innerType = packet[offset];

        if (innerType === 5 && offset + 7 <= packet.length) {
          const w = decodeWeight(packet, offset + 1);
          this.emit('weight', w.weight, w.stable);
          offset += 7;
        } else if (innerType === 7 && offset + 4 <= packet.length) {
          this.emit('timer', decodeTimer(packet, offset + 1));
          offset += 4;
        } else if (innerType === 8 && offset + 3 <= packet.length) {
          this.handleButtonEvent(packet, offset);
          break;
        } else {
          break;
        }
      }
    } else if (cmd === 8 && packet.length >= 10) {
      const settings = decodeSettings(packet, 3);
      this.emit('battery', settings.battery);
      if (settings.timerRunning !== this.scaleTimerRunning) {
        this.scaleTimerRunning = settings.timerRunning;
        if (settings.timerRunning) {
          this.emit('button', { type: 'timer_start' });
        } else {
          this.emit('button', { type: 'timer_stop' });
        }
      }
    }
  }

  private handleButtonEvent(packet: Buffer, typeOffset: number): void {
    const p0 = packet[typeOffset + 1];
    const p1 = packet[typeOffset + 2];
    let event: ButtonEvent | null = null;

    if (p0 === 0 && p1 === 5) {
      event = { type: 'tare' };
      if (typeOffset + 9 <= packet.length) event.weight = decodeWeight(packet, typeOffset + 3).weight;
    } else if (p0 === 8) {
      event = { type: 'timer_start' };
      if (p1 === 5 && typeOffset + 9 <= packet.length) event.weight = decodeWeight(packet, typeOffset + 3).weight;
    } else if (p0 === 10) {
      event = { type: 'timer_stop' };
      if (p1 === 7 && typeOffset + 7 <= packet.length) {
        event.timer = decodeTimer(packet, typeOffset + 3);
        if (typeOffset + 13 <= packet.length) event.weight = decodeWeight(packet, typeOffset + 7).weight;
      }
    } else if (p0 === 9) {
      event = { type: 'timer_reset' };
      if (p1 === 7 && typeOffset + 7 <= packet.length) {
        event.timer = decodeTimer(packet, typeOffset + 3);
        if (typeOffset + 13 <= packet.length) event.weight = decodeWeight(packet, typeOffset + 7).weight;
      }
    }

    if (event) this.emit('button', event);
  }

  private startHeartbeat(): void {
    this.log('startHeartbeat()');
    this.heartbeatTimer = setInterval(async () => {
      if (this._state !== 'connected') return;

      const silence = Date.now() - this.lastPacketTime;
      if (silence > AcaiaService.SILENCE_DEAD_MS) {
        this.log(`silence DEAD — ${silence}ms, triggering disconnect`);
        this.handleDisconnect();
        return;
      }
      if (silence > AcaiaService.SILENCE_WARN_MS) {
        this.log(`silence WARN — ${silence}ms`);
        this.emit('error', new Error('BLE signal weak'));
      }

      await this.enqueueWrite(encodeIdentify());
      await this.enqueueWrite(encodeHeartbeat());
      await this.enqueueWrite(encodeGetSettings());
    }, 1000);
  }

  private stopTimers(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  private handleDisconnect(): void {
    this.log(`handleDisconnect() — state=${this._state}, disconnecting=${this.disconnecting}`);
    if (this._state !== 'connected' && this._state !== 'reconnecting') {
      this.log('handleDisconnect() skipped — not connected/reconnecting');
      return;
    }
    if (this.disconnecting) { this.log('handleDisconnect() skipped — already disconnecting'); return; }
    this.disconnecting = true;
    this.cleanupConnection();
    this.setState('disconnected');
    this.disconnecting = false;
    this.maybeReconnect();
  }

  private maybeReconnect(): void {
    if (this.userDisconnected) { this.log('maybeReconnect() skipped — user disconnected'); return; }
    if (this.connectAborted) { this.log('maybeReconnect() skipped — connect aborted'); return; }
    if (this.reconnectAttempt >= AcaiaService.MAX_RECONNECT_ATTEMPTS) {
      this.log(`maybeReconnect() giving up — ${this.reconnectAttempt} attempts exhausted`);
      this.emitError('Reconnect failed after 3 attempts');
      return;
    }

    const delay = AcaiaService.RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt);
    this.reconnectAttempt++;
    this.log(`maybeReconnect() attempt ${this.reconnectAttempt}/${AcaiaService.MAX_RECONNECT_ATTEMPTS}, delay=${delay}ms`);
    this.setState('reconnecting');

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.connectAborted || this.userDisconnected) {
        this.log('reconnect timer fired but aborted/user-disconnected');
        return;
      }
      await this.connect();
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempt = 0;
  }

  private connectWithCleanup(peripheral: NoblePeripheral, timeoutMs: number): Promise<void> {
    const timer = setTimeout(() => {
      try { peripheral.disconnect(); } catch {}
    }, timeoutMs);
    return peripheral.connectAsync().finally(() => clearTimeout(timer));
  }

  private discoverWithCleanup(peripheral: NoblePeripheral, timeoutMs: number): Promise<{ characteristics: NobleCharacteristic[] }> {
    const timer = setTimeout(() => {
      try { peripheral.disconnect(); } catch {}
    }, timeoutMs);
    return peripheral.discoverSomeServicesAndCharacteristicsAsync([], [WRITE_UUID, NOTIFY_UUID])
      .finally(() => clearTimeout(timer));
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out (${ms}ms)`)), ms)
      ),
    ]);
  }

  private cleanupConnection(): void {
    this.log('cleanupConnection()');
    this.stopTimers();
    this.packetBuffer.reset();
    this.writeQueue = [];
    this.writing = false;
    this.scaleTimerRunning = false;
    this.disconnecting = false;
    this.consecutiveWriteFailures = 0;
    if (this.notifyChar) {
      this.notifyChar.removeAllListeners('data');
      this.notifyChar = null;
    }
    this.writeChar = null;
    if (this.peripheral) {
      this.peripheral.removeAllListeners('disconnect');
      try { this.peripheral.disconnect(); } catch {}
      this.peripheral = null;
    }
  }

  private async enqueueWrite(data: Buffer): Promise<void> {
    this.writeQueue.push(data);
    if (!this.writing) await this.processQueue();
  }

  private async processQueue(): Promise<void> {
    this.writing = true;
    while (this.writeQueue.length > 0) {
      const data = this.writeQueue.shift()!;
      if (!this.writeChar) break;
      try {
        await this.writeChar.writeAsync(data, true);
        this.consecutiveWriteFailures = 0;
      } catch (err: unknown) {
        this.consecutiveWriteFailures++;
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`write fail #${this.consecutiveWriteFailures} — ${msg}`);
        this.writeQueue = [];
        if (this.consecutiveWriteFailures >= AcaiaService.MAX_WRITE_FAILURES) {
          this.log(`write health threshold reached (${AcaiaService.MAX_WRITE_FAILURES}), disconnecting`);
          this.handleDisconnect();
        }
        break;
      }
      await new Promise(r => setTimeout(r, 50));
    }
    this.writing = false;
  }

  private setState(state: AcaiaState): void {
    const prev = this._state;
    this._state = state;
    this.log(`state: ${prev} → ${state}`);
    this.emit('state', state);
  }

  private emitError(message: string): void {
    this.log(`ERROR: ${message}`);
    this.emit('error', new Error(message));
  }
}
