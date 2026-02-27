import { EventEmitter } from 'events';
import { AcaiaState, AcaiaEvents, ButtonEvent, NOBLE_PATH, SCALE_PREFIXES, WRITE_UUID, NOTIFY_UUID } from './types';
import {
  encodeIdentify, encodeHeartbeat, encodeNotificationRequest,
  encodeTare, encodeTimerControl, encodeGetSettings,
  decodeWeight, decodeTimer, decodeSettings, PacketBuffer,
} from './protocol';

export class AcaiaService extends EventEmitter {
  private _state: AcaiaState = 'idle';
  private noble: any = null;
  private peripheral: any = null;
  private writeChar: any = null;
  private notifyChar: any = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private settingsTimer: ReturnType<typeof setInterval> | null = null;
  private lastPacketTime = 0;
  private packetBuffer = new PacketBuffer();
  private writeQueue: Buffer[] = [];
  private writing = false;
  private scaleTimerRunning = false;
  private connecting = false;
  private connectAborted = false;

  get state(): AcaiaState {
    return this._state;
  }

  async connect(): Promise<void> {
    if (this.connecting) return;
    if (this._state !== 'idle' && this._state !== 'disconnected') return;

    this.connecting = true;
    this.connectAborted = false;

    try {
      this.noble = this.loadNoble();
      if (!this.noble) {
        this.emitError('Failed to load noble BLE library');
        return;
      }

      this.setState('scanning');

      if (this.noble.state !== 'poweredOn') {
        const ready = await this.waitForPoweredOn();
        if (!ready || this.connectAborted) {
          if (!this.connectAborted) this.emitError('BLE adapter not ready');
          this.setState('idle');
          return;
        }
      }

      const peripheral = await this.scanForScale();
      if (!peripheral || this.connectAborted) {
        if (!this.connectAborted) this.emitError('No scale found (10s timeout)');
        if (!this.connectAborted) this.setState('idle');
        return;
      }

      this.peripheral = peripheral;
      this.setState('connecting');

      await this.withTimeout(peripheral.connectAsync(), 10000, 'BLE connect');
      if (this.connectAborted) return;

      peripheral.once('disconnect', () => {
        this.handleDisconnect();
      });

      const { characteristics } = await this.withTimeout(
        peripheral.discoverSomeServicesAndCharacteristicsAsync([], [WRITE_UUID, NOTIFY_UUID]),
        10000, 'Service discovery'
      );
      if (this.connectAborted) return;

      this.writeChar = characteristics.find((c: any) => c.uuid === WRITE_UUID);
      this.notifyChar = characteristics.find((c: any) => c.uuid === NOTIFY_UUID);

      if (!this.writeChar || !this.notifyChar) {
        this.emitError('Required BLE characteristics not found');
        try { await peripheral.disconnectAsync(); } catch {}
        this.cleanupConnection();
        this.setState('idle');
        return;
      }

      this.packetBuffer.onPacket = (packet) => this.handlePacket(packet);
      this.notifyChar.on('data', (data: Buffer) => {
        this.lastPacketTime = Date.now();
        this.packetBuffer.push(data);
      });
      await this.withTimeout(this.notifyChar.subscribeAsync(), 5000, 'Notify subscribe');
      if (this.connectAborted) return;

      await this.enqueueWrite(encodeIdentify());
      await this.enqueueWrite(encodeNotificationRequest());
      await this.enqueueWrite(encodeGetSettings());

      this.startHeartbeat();
      this.setState('connected');
    } catch (err: any) {
      if (!this.connectAborted) {
        this.emitError(err.message || 'Connection failed');
      }
      this.cleanupConnection();
      if (this.peripheral) {
        try { await this.peripheral.disconnectAsync(); } catch {}
        this.peripheral = null;
      }
      if (!this.connectAborted) this.setState('idle');
    } finally {
      this.connecting = false;
    }
  }

  async cancelConnect(): Promise<void> {
    this.connectAborted = true;
    this.connecting = false;
    try { if (this.noble) this.noble.stopScanning(); } catch {}
    const peripheral = this.peripheral;
    this.cleanupConnection();
    if (peripheral) {
      try { await peripheral.disconnectAsync(); } catch {}
    }
    this.setState('idle');
  }

  disconnect(): void {
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

  async sendNotificationRequest(weightArg?: number): Promise<void> {
    await this.enqueueWrite(encodeNotificationRequest(weightArg));
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
    this.connectAborted = true;
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

  private loadNoble(): any {
    try {
      const noble = require(NOBLE_PATH);
      noble.removeAllListeners();
      try { noble.stopScanning(); } catch {}
      return noble;
    }
    catch { return null; }
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

  private scanForScale(timeoutMs = 10000): Promise<any> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.noble.stopScanning();
        this.noble.removeListener('discover', onDiscover);
        resolve(null);
      }, timeoutMs);

      const onDiscover = (p: any) => {
        const name = p.advertisement?.localName || '';
        if (SCALE_PREFIXES.includes(name.substring(0, 5).toUpperCase())) {
          clearTimeout(timer);
          this.noble.stopScanning();
          this.noble.removeListener('discover', onDiscover);
          resolve(p);
        }
      };

      this.noble.on('discover', onDiscover);
      this.noble.startScanning([], false);
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
          this.emit('weight', decodeWeight(packet, offset + 1));
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
      if (typeOffset + 9 <= packet.length) event.weight = decodeWeight(packet, typeOffset + 3);
    } else if (p0 === 8) {
      event = { type: 'timer_start' };
      if (p1 === 5 && typeOffset + 9 <= packet.length) event.weight = decodeWeight(packet, typeOffset + 3);
    } else if (p0 === 10) {
      event = { type: 'timer_stop' };
      if (p1 === 7 && typeOffset + 7 <= packet.length) {
        event.timer = decodeTimer(packet, typeOffset + 3);
        if (typeOffset + 13 <= packet.length) event.weight = decodeWeight(packet, typeOffset + 7);
      }
    } else if (p0 === 9) {
      event = { type: 'timer_reset' };
      if (p1 === 7 && typeOffset + 7 <= packet.length) {
        event.timer = decodeTimer(packet, typeOffset + 3);
        if (typeOffset + 13 <= packet.length) event.weight = decodeWeight(packet, typeOffset + 7);
      }
    }

    if (event) this.emit('button', event);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      if (this._state !== 'connected') return;

      if (Date.now() - this.lastPacketTime > 5000) {
        this.handleDisconnect();
        return;
      }

      await this.enqueueWrite(encodeIdentify());
      await this.enqueueWrite(encodeHeartbeat());
    }, 1000);

    this.settingsTimer = setInterval(async () => {
      if (this._state !== 'connected') return;
      await this.enqueueWrite(encodeGetSettings());
    }, 400);
  }

  private stopTimers(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.settingsTimer) { clearInterval(this.settingsTimer); this.settingsTimer = null; }
  }

  private handleDisconnect(): void {
    this.cleanupConnection();
    this.setState('disconnected');
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
    this.stopTimers();
    this.packetBuffer.reset();
    this.writeQueue = [];
    this.writing = false;
    this.scaleTimerRunning = false;
    if (this.notifyChar) {
      this.notifyChar.removeAllListeners('data');
      this.notifyChar = null;
    }
    this.writeChar = null;
    if (this.peripheral) {
      this.peripheral.removeAllListeners('disconnect');
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
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    this.writing = false;
  }

  private setState(state: AcaiaState): void {
    this._state = state;
    this.emit('state', state);
  }

  private emitError(message: string): void {
    this.emit('error', new Error(message));
  }
}
