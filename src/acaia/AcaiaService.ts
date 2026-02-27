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

  get state(): AcaiaState {
    return this._state;
  }

  async connect(): Promise<void> {
    if (this._state !== 'idle' && this._state !== 'disconnected') return;

    this.noble = this.loadNoble();
    if (!this.noble) {
      this.emitError('Failed to load noble BLE library');
      return;
    }

    this.setState('scanning');

    if (this.noble.state !== 'poweredOn') {
      const ready = await this.waitForPoweredOn();
      if (!ready) {
        this.emitError('BLE adapter not ready');
        this.setState('idle');
        return;
      }
    }

    try {
      const peripheral = await this.scanForScale();
      if (!peripheral) {
        this.emitError('No scale found (10s timeout)');
        this.setState('idle');
        return;
      }

      this.peripheral = peripheral;
      this.setState('connecting');

      await peripheral.connectAsync();

      peripheral.once('disconnect', () => {
        this.handleDisconnect();
      });

      const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
        [], [WRITE_UUID, NOTIFY_UUID]
      );

      this.writeChar = characteristics.find((c: any) => c.uuid === WRITE_UUID);
      this.notifyChar = characteristics.find((c: any) => c.uuid === NOTIFY_UUID);

      if (!this.writeChar || !this.notifyChar) {
        this.emitError('Required BLE characteristics not found');
        await peripheral.disconnectAsync();
        this.setState('idle');
        return;
      }

      this.packetBuffer.onPacket = (packet) => this.handlePacket(packet);
      this.notifyChar.on('data', (data: Buffer) => {
        this.lastPacketTime = Date.now();
        this.packetBuffer.push(data);
      });
      await this.notifyChar.subscribeAsync();

      await this.enqueueWrite(encodeIdentify());
      await this.enqueueWrite(encodeNotificationRequest());
      await this.enqueueWrite(encodeGetSettings());

      this.startHeartbeat();
      this.setState('connected');
    } catch (err: any) {
      this.emitError(err.message || 'Connection failed');
      this.setState('idle');
    }
  }

  async disconnect(): Promise<void> {
    this.stopTimers();
    this.packetBuffer.reset();
    this.writeQueue = [];
    if (this.notifyChar) {
      this.notifyChar.removeAllListeners('data');
      this.notifyChar = null;
    }
    this.writeChar = null;
    if (this.peripheral) {
      try { await this.peripheral.disconnectAsync(); } catch {}
      this.peripheral = null;
    }
    this.setState('idle');
  }

  async tare(): Promise<void> {
    if (this._state !== 'connected') return;
    await this.enqueueWrite(encodeTare());
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
    this.stopTimers();
    this.packetBuffer.reset();
    this.writeQueue = [];
    if (this.notifyChar) {
      this.notifyChar.removeAllListeners('data');
    }
    if (this.peripheral) {
      try { this.peripheral.disconnectAsync(); } catch {}
    }
    if (this.noble) {
      this.noble.removeAllListeners();
    }
    this.removeAllListeners();
    this.peripheral = null;
    this.writeChar = null;
    this.notifyChar = null;
    this.noble = null;
    this._state = 'idle';
  }

  private loadNoble(): any {
    try { return require(NOBLE_PATH); }
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

    if (cmd === 12 && packet.length > 4) {
      const innerType = packet[4];
      if (innerType === 5 && packet.length >= 11) {
        this.emit('weight', decodeWeight(packet, 5));
      } else if (innerType === 7 && packet.length >= 8) {
        this.emit('timer', decodeTimer(packet, 5));
      } else if (innerType === 8 && packet.length >= 7) {
        this.handleButtonEvent(packet);
      }
    } else if (cmd === 8 && packet.length >= 10) {
      const settings = decodeSettings(packet, 3);
      this.emit('battery', settings.battery);
    } else if (cmd === 11 && packet.length > 5) {
      if (packet[4] === 5 && packet.length >= 9) {
        this.emit('weight', decodeWeight(packet, 5));
      } else if (packet[4] === 7 && packet.length >= 8) {
        this.emit('timer', decodeTimer(packet, 5));
      }
    }
  }

  private handleButtonEvent(packet: Buffer): void {
    const p0 = packet[5];
    const p1 = packet[6];
    let event: ButtonEvent | null = null;

    if (p0 === 0 && p1 === 5) {
      event = { type: 'tare' };
      if (packet.length >= 13) event.weight = decodeWeight(packet, 7);
    } else if (p0 === 8) {
      event = { type: 'timer_start' };
      if (p1 === 5 && packet.length >= 13) event.weight = decodeWeight(packet, 7);
    } else if (p0 === 10) {
      event = { type: 'timer_stop' };
      if (p1 === 7 && packet.length >= 13) {
        event.timer = decodeTimer(packet, 7);
        if (packet.length >= 16) event.weight = decodeWeight(packet, 11);
      }
    } else if (p0 === 9) {
      event = { type: 'timer_reset' };
      if (p1 === 7 && packet.length >= 13) {
        event.timer = decodeTimer(packet, 7);
        if (packet.length >= 16) event.weight = decodeWeight(packet, 11);
      }
    }

    if (event) this.emit('button', event);
  }

  private startHeartbeat(): void {
    let settingsCounter = 0;

    this.heartbeatTimer = setInterval(async () => {
      if (this._state !== 'connected') return;

      if (Date.now() - this.lastPacketTime > 5000) {
        this.handleDisconnect();
        return;
      }

      await this.enqueueWrite(encodeIdentify());
      await this.enqueueWrite(encodeHeartbeat());

      settingsCounter++;
      if (settingsCounter >= 30) {
        await this.enqueueWrite(encodeGetSettings());
        settingsCounter = 0;
      }
    }, 1000);
  }

  private stopTimers(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.settingsTimer) { clearInterval(this.settingsTimer); this.settingsTimer = null; }
  }

  private handleDisconnect(): void {
    this.stopTimers();
    this.packetBuffer.reset();
    this.writeQueue = [];
    if (this.notifyChar) {
      this.notifyChar.removeAllListeners('data');
    }
    this.writeChar = null;
    this.notifyChar = null;
    this.peripheral = null;
    this.setState('disconnected');
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
