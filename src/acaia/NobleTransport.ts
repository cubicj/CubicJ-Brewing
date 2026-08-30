import type { Buffer, Noble, NobleCharacteristic, NoblePeripheral } from './types';
import { normalizeScaleAddress, NOTIFY_UUID, SCALE_PREFIXES, WRITE_UUID } from './types';
import { nodeRequire } from '../nodeRequire';

export interface NobleTransportOptions {
	nobleFactory?: () => Noble | null;
	noblePath?: string;
	log?: (message: string) => void;
	onPoweredOff: () => void;
	onDisconnect: () => void;
	onData: (data: Buffer) => void;
}

export interface DiscoveredScale {
	id: string;
	localName: string;
	address: string;
}

export interface DiscoveredCharacteristics {
	count: number;
	writeAvailable: boolean;
	notifyAvailable: boolean;
	ready: boolean;
}

export class NobleTransport {
	private static readonly WRITE_TIMEOUT_MS = 3000;
	private readonly nobleFactory: () => Noble | null;
	private readonly log: (message: string) => void;
	private readonly onPoweredOff: () => void;
	private readonly onDisconnect: () => void;
	private readonly onData: (data: Buffer) => void;
	private noble: Noble | null = null;
	private peripheral: NoblePeripheral | null = null;
	private writeChar: NobleCharacteristic | null = null;
	private notifyChar: NobleCharacteristic | null = null;
	private generation = 0;
	private targetedScanCleanup: (() => void) | null = null;
	private collectListener: ((peripheral: NoblePeripheral) => void) | null = null;
	private collected = new Map<string, NoblePeripheral>();

	constructor(options: NobleTransportOptions) {
		const noblePath = options.noblePath ?? '@stoprocent/noble';
		this.nobleFactory =
			options.nobleFactory ??
			(() => {
				try {
					return nodeRequire(noblePath) as Noble;
				} catch {
					return null;
				}
			});
		this.log = options.log ?? (() => {});
		this.onPoweredOff = options.onPoweredOff;
		this.onDisconnect = options.onDisconnect;
		this.onData = options.onData;
	}

	initialize(): boolean {
		this.stopScanning();
		this.removeCollectListener();
		this.collected.clear();
		this.generation++;
		const noble = this.nobleFactory();
		if (!noble) return false;

		noble.removeAllListeners();
		try {
			noble.stopScanning();
		} catch (error) {
			void error;
		}
		this.noble = noble;
		noble.on('stateChange', (state: string) => {
			this.log(`noble stateChange: ${state}`);
			if (state === 'poweredOff') this.onPoweredOff();
		});
		return true;
	}

	get adapterState(): string | null {
		return this.noble?.state ?? null;
	}

	get peripheralState(): string | null {
		return this.peripheral?.state ?? null;
	}

	get canWrite(): boolean {
		return this.writeChar !== null;
	}

	waitForPoweredOn(timeoutMs = 10000): Promise<boolean> {
		const noble = this.noble;
		if (!noble) return Promise.resolve(false);
		if (noble.state === 'poweredOn') return Promise.resolve(true);

		return new Promise((resolve) => {
			const onState = (state: string) => {
				if (state === 'poweredOn') {
					window.clearTimeout(timer);
					noble.removeListener('stateChange', onState);
					resolve(true);
				}
			};
			const timer = window.setTimeout(() => {
				noble.removeListener('stateChange', onState);
				resolve(false);
			}, timeoutMs);
			noble.on('stateChange', onState);
		});
	}

	scanForScale(targetAddresses: string[], timeoutMs = 10000): Promise<DiscoveredScale | null> {
		const noble = this.noble;
		if (!noble) return Promise.resolve(null);
		this.cancelTargetedScan();
		if (this.collectListener) this.stopCollectScan();
		const generation = this.generation;
		const targets = new Set(targetAddresses.map(normalizeScaleAddress));

		return new Promise((resolve) => {
			let discoverCount = 0;
			let settled = false;
			let timer = 0;
			const finish = (result: DiscoveredScale | null) => {
				if (settled) return;
				settled = true;
				window.clearTimeout(timer);
				noble.removeListener('discover', onDiscover);
				if (this.targetedScanCleanup === cancel) {
					this.targetedScanCleanup = null;
					this.stopNobleScanning(noble);
				}
				resolve(result);
			};
			const cancel = () => finish(null);
			this.targetedScanCleanup = cancel;
			timer = window.setTimeout(() => {
				this.log(`scan timeout — ${discoverCount} peripherals seen, no scale`);
				finish(null);
			}, timeoutMs);
			const onDiscover = (peripheral: NoblePeripheral) => {
				discoverCount++;
				const localName = peripheral.advertisement?.localName || '';
				const address = peripheral.address || peripheral.id || '??';
				const candidates = [peripheral.address, peripheral.id, peripheral.uuid]
					.filter((value): value is string => !!value)
					.map(normalizeScaleAddress);
				if (candidates.some((candidate) => targets.has(candidate))) {
					if (generation !== this.generation) {
						finish(null);
						return;
					}
					this.peripheral = peripheral;
					finish({ id: peripheral.id || peripheral.uuid, localName, address });
				} else if (SCALE_PREFIXES.includes(localName.substring(0, 5).toUpperCase())) {
					this.log(`scan: unregistered scale skipped "${localName}" (${address})`);
				} else {
					this.log(`scan: skipped "${localName}" (${address})`);
				}
			};

			noble.on('discover', onDiscover);
			try {
				noble.startScanning([], false);
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				this.log(`startScanning error: ${message}`);
				finish(null);
			}
		});
	}

	startCollectScan(onScale: (scale: DiscoveredScale) => void): boolean {
		const noble = this.noble;
		if (!noble) return false;
		this.cancelTargetedScan();
		if (this.collectListener) this.stopCollectScan();
		this.collected.clear();
		const generation = this.generation;
		const listener = (peripheral: NoblePeripheral) => {
			if (generation !== this.generation) return;
			const localName = peripheral.advertisement?.localName || '';
			if (!SCALE_PREFIXES.includes(localName.substring(0, 5).toUpperCase())) return;
			const id = peripheral.id || peripheral.uuid;
			if (this.collected.has(id)) return;
			this.collected.set(id, peripheral);
			onScale({ id, localName, address: peripheral.address || id });
		};
		this.collectListener = listener;
		noble.on('discover', listener);
		try {
			noble.startScanning([], false);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			this.log(`collect scan error: ${message}`);
			this.stopCollectScan();
			return false;
		}
		return true;
	}

	stopCollectScan(): void {
		this.removeCollectListener();
		this.stopNobleScanning(this.noble);
	}

	selectScale(id: string): boolean {
		const peripheral = this.collected.get(id);
		if (!peripheral) return false;
		this.peripheral = peripheral;
		return true;
	}

	async disconnectPeripheralAsync(): Promise<void> {
		if (!this.peripheral) return;
		await this.peripheral.disconnectAsync();
	}

	connectPeripheral(timeoutMs: number): Promise<void> {
		if (!this.peripheral) return Promise.reject(new Error('No peripheral selected'));
		const peripheral = this.peripheral;
		const timer = window.setTimeout(() => {
			try {
				peripheral.disconnect();
			} catch (error) {
				void error;
			}
		}, timeoutMs);
		return peripheral.connectAsync().finally(() => window.clearTimeout(timer));
	}

	watchDisconnect(): void {
		this.peripheral?.once('disconnect', this.onDisconnect);
	}

	discoverCharacteristics(timeoutMs: number): Promise<DiscoveredCharacteristics> {
		if (!this.peripheral) return Promise.reject(new Error('No peripheral selected'));
		const peripheral = this.peripheral;
		const generation = this.generation;
		const timer = window.setTimeout(() => {
			try {
				peripheral.disconnect();
			} catch (error) {
				void error;
			}
		}, timeoutMs);
		return peripheral
			.discoverSomeServicesAndCharacteristicsAsync([], [WRITE_UUID, NOTIFY_UUID])
			.then(({ characteristics }) => {
				if (generation !== this.generation || peripheral !== this.peripheral) {
					return {
						count: characteristics.length,
						writeAvailable: false,
						notifyAvailable: false,
						ready: false,
					};
				}
				this.writeChar = characteristics.find((characteristic) => characteristic.uuid === WRITE_UUID) ?? null;
				this.notifyChar = characteristics.find((characteristic) => characteristic.uuid === NOTIFY_UUID) ?? null;
				return {
					count: characteristics.length,
					writeAvailable: this.writeChar !== null,
					notifyAvailable: this.notifyChar !== null,
					ready: this.writeChar !== null && this.notifyChar !== null,
				};
			})
			.finally(() => window.clearTimeout(timer));
	}

	async subscribe(timeoutMs: number): Promise<void> {
		if (!this.notifyChar) throw new Error('Notify characteristic unavailable');
		this.notifyChar.on('data', this.onData);
		await this.withTimeout(this.notifyChar.subscribeAsync(), timeoutMs, 'Notify subscribe');
	}

	write(data: Buffer): Promise<void> {
		if (!this.writeChar) return Promise.reject(new Error('Write characteristic unavailable'));
		return this.withTimeout(this.writeChar.writeAsync(data, true), NobleTransport.WRITE_TIMEOUT_MS, 'Write');
	}

	stopScanning(): void {
		if (this.cancelTargetedScan()) return;
		this.stopNobleScanning(this.noble);
	}

	private cancelTargetedScan(): boolean {
		const cleanup = this.targetedScanCleanup;
		if (!cleanup) return false;
		cleanup();
		return true;
	}

	private stopNobleScanning(noble: Noble | null): void {
		if (!noble) return;
		try {
			noble.stopScanning();
		} catch (error) {
			void error;
		}
	}

	private removeCollectListener(): void {
		if (this.collectListener && this.noble) this.noble.removeListener('discover', this.collectListener);
		this.collectListener = null;
	}

	async cancelConnection(): Promise<void> {
		const peripheral = this.peripheral;
		this.disconnectSync();
		if (!peripheral) return;
		await peripheral.disconnectAsync().catch(() => undefined);
	}

	disconnectSync(): void {
		this.generation++;
		this.stopScanning();
		this.stopCollectScan();
		this.collected.clear();
		if (this.notifyChar) {
			this.notifyChar.removeAllListeners('data');
			this.notifyChar = null;
		}
		this.writeChar = null;
		if (this.peripheral) {
			this.peripheral.removeAllListeners('disconnect');
			try {
				this.peripheral.disconnect();
			} catch (error) {
				void error;
			}
			this.peripheral = null;
		}
	}

	dispose(): void {
		this.disconnectSync();
		this.stopCollectScan();
		this.stopScanning();
		this.noble?.removeAllListeners();
		this.noble = null;
	}

	private withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const timer = window.setTimeout(() => reject(new Error(`${label} timed out (${timeoutMs}ms)`)), timeoutMs);
			promise.then(
				(value) => {
					window.clearTimeout(timer);
					resolve(value);
				},
				(error: unknown) => {
					window.clearTimeout(timer);
					reject(error instanceof Error ? error : new Error(String(error)));
				},
			);
		});
	}
}
