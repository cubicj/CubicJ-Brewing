import type { AcaiaEvents, Buffer } from './types';
import { AcaiaState, Noble, resolveModelName } from './types';
import {
	encodeIdentify,
	encodeHeartbeat,
	encodeNotificationRequest,
	encodeTare,
	encodeTimerControl,
	encodeGetSettings,
	encodePowerOff,
	PacketBuffer,
} from './protocol';
import { NobleTransport } from './NobleTransport';
import type { DiscoveredScale } from './NobleTransport';
import { TypedEmitter } from './TypedEmitter';
import { decodePacket } from './packetDecoder';

export const MAX_RECONNECT_ATTEMPTS = 6;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 15000;

type WriteKind = 'command' | 'heartbeat';

interface QueuedWrite {
	data: Buffer;
	kind: WriteKind;
}

export interface BleLogger {
	log(message: string): void;
}

export interface AcaiaServiceOptions {
	nobleFactory?: () => Noble | null;
	noblePath?: string;
	logger?: BleLogger;
}

class StaleConnectionError extends Error {
	constructor() {
		super('Connection aborted (stale)');
	}
}

export class AcaiaService extends TypedEmitter<AcaiaEvents> {
	private _state: AcaiaState = 'idle';
	private transport: NobleTransport;
	private heartbeatTimer: number | null = null;
	private lastPacketTime = 0;
	private packetBuffer = new PacketBuffer();
	private writeQueue: QueuedWrite[] = [];
	private currentWrite: QueuedWrite | null = null;
	private writing = false;
	private queueGeneration = 0;
	private scaleTimerRunning = false;
	private connecting = false;
	private connectAborted = false;
	private disconnecting = false;
	private consecutiveWriteFailures = 0;
	private static readonly MAX_WRITE_FAILURES = 6;
	private static readonly SILENCE_WARN_MS = 5000;
	private static readonly SILENCE_DEAD_MS = 8000;
	private userDisconnected = false;
	private reconnectAttempt = 0;
	private reconnectTimer: number | null = null;
	private connectId = 0;
	private _scaleName: string | null = null;
	private targetAddresses: string[] = [];
	private _scaleAddress: string | null = null;
	private pickerOperation = 0;
	private logger?: BleLogger;
	private _lastWeight = 0;

	constructor(options?: AcaiaServiceOptions) {
		super();
		this.on('error', () => {});
		this.logger = options?.logger;
		this.transport = new NobleTransport({
			nobleFactory: options?.nobleFactory,
			noblePath: options?.noblePath,
			log: (message) => this.log(message),
			onPoweredOff: () => {
				this.log('Bluetooth adapter powered off — cleaning up');
				this.emitError('Bluetooth adapter turned off');
				this.disconnect();
			},
			onDisconnect: () => this.handleDisconnect(),
			onData: (data) => {
				this.lastPacketTime = Date.now();
				this.packetBuffer.push(data);
			},
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

	get scaleAddress(): string | null {
		return this._scaleAddress;
	}

	get lastWeight(): number {
		return this._lastWeight;
	}

	get currentReconnectAttempt(): number {
		return this.reconnectAttempt;
	}

	async connect(targetAddresses?: string[]): Promise<void> {
		this.pickerOperation++;
		if (this.connecting) {
			this.log('connect() skipped — already connecting');
			return;
		}
		if (this._state !== 'idle' && this._state !== 'disconnected' && this._state !== 'reconnecting') {
			this.log(`connect() skipped — state=${this._state}`);
			return;
		}
		if (targetAddresses && targetAddresses.length > 0) this.targetAddresses = [...targetAddresses];
		if (this.targetAddresses.length === 0) {
			this.log('connect() skipped — no registered scale');
			this.emitError('No registered scale');
			return;
		}

		this.connecting = true;
		this.connectAborted = false;
		const myId = ++this.connectId;
		this.log(`connect() start — id=${myId}, state=${this._state}, reconnectAttempt=${this.reconnectAttempt}`);

		try {
			this.initNoble();
			this.setState('scanning');

			await this.waitForPoweredOnOrThrow(myId);
			const scale = await this.scanForScaleOrThrow(myId);
			await this.finalizeConnection(myId, scale);
		} catch (err: unknown) {
			if (err instanceof StaleConnectionError && this.connectId !== myId) {
				this.log(`stale connect (id=${myId}, current=${this.connectId})`);
				return;
			}
			if (!(err instanceof StaleConnectionError)) {
				const msg = err instanceof Error ? err.message : String(err);
				this.log(`connect() caught: ${msg}`);
				this.emitError(msg || 'Connection failed');
				this.cleanupConnection();
				this.setState('idle');
			}
			this.maybeRetryReconnect();
		} finally {
			if (this.connectId === myId) this.connecting = false;
			this.log(`connect() finally — id=${myId}, current=${this.connectId}, state=${this._state}`);
		}
	}

	private async finalizeConnection(myId: number, scale: DiscoveredScale): Promise<void> {
		this._scaleName = scale.localName ? resolveModelName(scale.localName) : null;
		this._scaleAddress = scale.address;
		this.setState('connecting');
		await this.establishConnection(myId);
		await this.setupNotifications(myId);
		await this.performHandshake(myId);
		this.startHeartbeat();
		this.reconnectAttempt = 0;
		this.userDisconnected = false;
		this.targetAddresses = [scale.address, scale.id];
		this.setState('connected');
		this.log('connection complete');
	}

	private initNoble(): void {
		if (!this.transport.initialize()) {
			this.log('noble factory returned null');
			this.emitError('Failed to load noble BLE library');
			throw new Error('Noble unavailable');
		}
		this.log(`noble.state=${this.transport.adapterState}`);
	}

	private async waitForPoweredOnOrThrow(myId: number): Promise<void> {
		if (this.transport.adapterState === 'poweredOn') {
			this.log('already poweredOn');
			return;
		}
		this.log('waiting for poweredOn...');
		const ready = await this.transport.waitForPoweredOn();
		this.assertNotStale(myId);
		if (!ready) {
			this.emitError('BLE adapter not ready');
			this.setState('idle');
			throw new StaleConnectionError();
		}
		this.log('poweredOn ready');
	}

	private async scanForScaleOrThrow(myId: number): Promise<DiscoveredScale> {
		this.log('scanning for scale...');
		const scale = await this.transport.scanForScale(this.targetAddresses);
		this.assertNotStale(myId);
		if (!scale) {
			this.log('scan done — no scale found');
			this.emitError('Registered scale not found (10s timeout)');
			this.setState('idle');
			throw new StaleConnectionError();
		}
		this.log(`scale found: ${scale.localName} (${scale.address})`);
		return scale;
	}

	async startPickerScan(onScale: (scale: DiscoveredScale) => void): Promise<boolean> {
		if (this.connecting) return false;
		if (this._state !== 'idle' && this._state !== 'disconnected') return false;
		const operation = ++this.pickerOperation;
		try {
			this.initNoble();
		} catch {
			return false;
		}
		this.setState('scanning');
		const ready = await this.transport.waitForPoweredOn();
		if (operation !== this.pickerOperation) return false;
		if (!ready) {
			this.emitError('BLE adapter not ready');
			this.setState('idle');
			return false;
		}
		if (!this.transport.startCollectScan(onScale)) {
			this.setState('idle');
			return false;
		}
		return true;
	}

	cancelPickerScan(): void {
		this.pickerOperation++;
		this.transport.stopCollectScan();
		if (this._state === 'scanning') this.setState('idle');
	}

	async connectToScale(scale: DiscoveredScale): Promise<void> {
		this.pickerOperation++;
		if (this.connecting) return;
		this.transport.stopCollectScan();
		if (!this.transport.selectScale(scale.id)) {
			this.emitError('Selected scale unavailable');
			this.setState('idle');
			return;
		}
		this.connecting = true;
		this.connectAborted = false;
		const myId = ++this.connectId;
		this.log(`connectToScale() start — id=${myId}, scale=${scale.localName} (${scale.address})`);
		try {
			await this.finalizeConnection(myId, scale);
		} catch (err: unknown) {
			if (err instanceof StaleConnectionError && this.connectId !== myId) return;
			if (!(err instanceof StaleConnectionError)) {
				const msg = err instanceof Error ? err.message : String(err);
				this.log(`connectToScale() caught: ${msg}`);
				this.emitError(msg || 'Connection failed');
				this.cleanupConnection();
				this.setState('idle');
			}
		} finally {
			if (this.connectId === myId) this.connecting = false;
		}
	}

	private async establishConnection(myId: number): Promise<void> {
		if (this.transport.peripheralState === 'connected') {
			this.log('peripheral already connected at BLE level, disconnecting first...');
			await this.transport.disconnectPeripheralAsync().catch(() => undefined);
		}

		this.log('connectAsync...');
		await this.transport.connectPeripheral(10000);
		this.assertNotStale(myId);
		this.log('connectAsync done');

		this.transport.watchDisconnect();

		let characteristics: {
			count: number;
			writeAvailable: boolean;
			notifyAvailable: boolean;
			ready: boolean;
		};
		for (let attempt = 0; ; attempt++) {
			try {
				this.log(`discoverAsync... (attempt ${attempt + 1})`);
				characteristics = await this.transport.discoverCharacteristics(10000);
				break;
			} catch (discoverErr: unknown) {
				this.assertNotStale(myId);
				if (attempt >= 1) throw discoverErr;
				const msg = discoverErr instanceof Error ? discoverErr.message : String(discoverErr);
				this.log(`discover failed (attempt ${attempt + 1}): ${msg} — retrying after reconnect`);
				await this.transport.disconnectPeripheralAsync().catch(() => undefined);
				await new Promise((r) => window.setTimeout(r, 500));
				this.assertNotStale(myId);
				this.log('reconnecting for discover retry...');
				await this.transport.connectPeripheral(10000);
				this.assertNotStale(myId);
			}
		}
		this.assertNotStale(myId);
		this.log(`discover done — ${characteristics.count} characteristics`);

		if (!characteristics.ready) {
			this.log(
				`chars missing — write=${characteristics.writeAvailable}, notify=${characteristics.notifyAvailable}`,
			);
			this.emitError('Required BLE characteristics not found');
			await this.transport.disconnectPeripheralAsync().catch(() => undefined);
			this.cleanupConnection();
			this.setState('idle');
			throw new StaleConnectionError();
		}
	}

	private async setupNotifications(myId: number): Promise<void> {
		this.packetBuffer.onPacket = (packet) => this.handlePacket(packet);
		this.log('subscribing to notify...');
		await this.transport.subscribe(5000);
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
		this.transport.stopScanning();
		this.cleanupConnection(false);
		await this.transport.cancelConnection();
		this.setState('idle');
	}

	disconnect(): void {
		this.log(`disconnect() — user-initiated, state=${this._state}`);
		this.userDisconnected = true;
		this.cancelReconnect();
		this.cleanupConnection();
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

	async powerOff(): Promise<void> {
		if (this._state !== 'connected') return;
		this.log('powerOff() — stopping heartbeat, sending power off command');
		this.userDisconnected = true;
		this.cancelReconnect();
		this.stopTimers();
		this.writeQueue = [];
		if (this.transport.canWrite) {
			try {
				await this.transport.write(encodePowerOff());
				this.log('powerOff command written (msgType=24)');
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				this.log(`powerOff write failed: ${message}`);
			}
		}
		await new Promise((r) => window.setTimeout(r, 500));
		this.disconnect();
	}

	destroy(): void {
		this.log(`destroy() — state=${this._state}, id=${this.connectId}`);
		this.connectId++;
		this.connectAborted = true;
		this.cancelReconnect();
		this.cleanupConnection();
		this.transport.dispose();
		this.removeAllListeners();
		this._state = 'idle';
		this._scaleAddress = null;
	}

	private handlePacket(packet: Buffer): void {
		for (const event of decodePacket(packet)) {
			if (event.type === 'weight') {
				this.emit('weight', event.weight, event.stable);
				this._lastWeight = event.weight;
			} else if (event.type === 'timer') {
				this.emit('timer', event.seconds);
			} else if (event.type === 'button') {
				this.emit('button', event.event);
			} else {
				this.emit('battery', event.settings.battery);
				if (event.settings.timerRunning !== this.scaleTimerRunning) {
					this.scaleTimerRunning = event.settings.timerRunning;
					this.emit('button', { type: event.settings.timerRunning ? 'timer_start' : 'timer_stop' });
				}
			}
		}
	}

	private startHeartbeat(): void {
		this.log('startHeartbeat()');
		this.lastPacketTime = Date.now();
		this.heartbeatTimer = window.setInterval(() => {
			void this.runHeartbeatCycle();
		}, 1000);
	}

	private async runHeartbeatCycle(): Promise<void> {
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

		if (this.writeQueue.some((entry) => entry.kind === 'heartbeat')) {
			this.log('heartbeat cycle skipped — previous cycle still queued');
			return;
		}
		this.pushWrite(encodeIdentify(), 'heartbeat');
		this.pushWrite(encodeHeartbeat(), 'heartbeat');
		this.pushWrite(encodeGetSettings(), 'heartbeat');
		if (!this.writing) await this.processQueue();
	}

	private stopTimers(): void {
		if (this.heartbeatTimer) {
			window.clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	private handleDisconnect(): void {
		this.log(`handleDisconnect() — state=${this._state}, disconnecting=${this.disconnecting}`);
		if (this._state !== 'connected' && this._state !== 'reconnecting') {
			this.log('handleDisconnect() skipped — not connected/reconnecting');
			return;
		}
		if (this.disconnecting) {
			this.log('handleDisconnect() skipped — already disconnecting');
			return;
		}
		this.disconnecting = true;
		this.cleanupConnection();
		this.setState('disconnected');
		this.disconnecting = false;
		this.maybeReconnect();
	}

	private maybeRetryReconnect(): void {
		if (this.reconnectAttempt === 0) return;
		if (this.userDisconnected || this.connectAborted) return;
		this.maybeReconnect();
	}

	private maybeReconnect(): void {
		if (this.userDisconnected) {
			this.log('maybeReconnect() skipped — user disconnected');
			return;
		}
		if (this.connectAborted) {
			this.log('maybeReconnect() skipped — connect aborted');
			return;
		}
		if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
			this.log(`maybeReconnect() giving up — ${this.reconnectAttempt} attempts exhausted`);
			this.reconnectAttempt = 0;
			this.emitError(`Reconnect failed after ${MAX_RECONNECT_ATTEMPTS} attempts`);
			return;
		}

		const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt), RECONNECT_MAX_DELAY_MS);
		this.reconnectAttempt++;
		this.log(
			`maybeReconnect() attempt ${this.reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS}, delay=${delay}ms`,
		);
		this.setState('reconnecting');

		this.reconnectTimer = window.setTimeout(() => {
			this.reconnectTimer = null;
			if (this.connectAborted || this.userDisconnected) {
				this.log('reconnect timer fired but aborted/user-disconnected');
				return;
			}
			void this.connect();
		}, delay);
	}

	private cancelReconnect(): void {
		if (this.reconnectTimer) {
			window.clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.reconnectAttempt = 0;
	}

	private cleanupConnection(disconnectTransport = true): void {
		this.log('cleanupConnection()');
		this.pickerOperation++;
		this.stopTimers();
		this.packetBuffer.reset();
		this.queueGeneration++;
		this.writeQueue = [];
		this.currentWrite = null;
		this.writing = false;
		this.scaleTimerRunning = false;
		this.disconnecting = false;
		this.consecutiveWriteFailures = 0;
		if (disconnectTransport) this.transport.disconnectSync();
	}

	private pushWrite(data: Buffer, kind: WriteKind): void {
		if (this.currentWrite?.data.equals(data) || this.writeQueue.some((entry) => entry.data.equals(data))) {
			this.log(`write skipped — duplicate ${kind} payload pending`);
			return;
		}
		if (kind === 'command') {
			const firstHeartbeat = this.writeQueue.findIndex((entry) => entry.kind === 'heartbeat');
			if (firstHeartbeat === -1) this.writeQueue.push({ data, kind });
			else this.writeQueue.splice(firstHeartbeat, 0, { data, kind });
		} else {
			this.writeQueue.push({ data, kind });
		}
	}

	private async enqueueWrite(data: Buffer, kind: WriteKind = 'command'): Promise<void> {
		this.pushWrite(data, kind);
		if (!this.writing) await this.processQueue();
	}

	private async processQueue(): Promise<void> {
		const generation = this.queueGeneration;
		this.writing = true;
		while (this.writeQueue.length > 0) {
			const entry = this.writeQueue.shift()!;
			if (!this.transport.canWrite) break;
			this.currentWrite = entry;
			try {
				await this.transport.write(entry.data);
				if (generation !== this.queueGeneration) return;
				this.currentWrite = null;
				this.consecutiveWriteFailures = 0;
			} catch (err: unknown) {
				if (generation !== this.queueGeneration) return;
				this.currentWrite = null;
				const flushedHeartbeatFailures = this.writeQueue.filter((queued) => queued.kind === 'heartbeat').length;
				this.consecutiveWriteFailures += 1 + flushedHeartbeatFailures;
				const msg = err instanceof Error ? err.message : String(err);
				this.log(`write fail #${this.consecutiveWriteFailures} — ${msg}`);
				this.writeQueue = [];
				if (this.consecutiveWriteFailures >= AcaiaService.MAX_WRITE_FAILURES) {
					this.log(`write health threshold reached (${AcaiaService.MAX_WRITE_FAILURES}), disconnecting`);
					this.handleDisconnect();
				}
				break;
			}
			await new Promise((r) => window.setTimeout(r, 50));
			if (generation !== this.queueGeneration) return;
		}
		if (generation !== this.queueGeneration) return;
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
