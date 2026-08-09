import type { Noble, NobleCharacteristic, NoblePeripheral } from './types';
import { NOTIFY_UUID, SCALE_PREFIXES, WRITE_UUID } from './types';

export interface NobleTransportOptions {
	nobleFactory?: () => Noble | null;
	noblePath?: string;
	log?: (message: string) => void;
	onPoweredOff: () => void;
	onDisconnect: () => void;
	onData: (data: Buffer) => void;
}

export interface DiscoveredScale {
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

	constructor(options: NobleTransportOptions) {
		const noblePath = options.noblePath ?? '@stoprocent/noble';
		this.nobleFactory =
			options.nobleFactory ??
			(() => {
				try {
					return require(noblePath);
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
		this.generation++;
		const noble = this.nobleFactory();
		if (!noble) return false;

		noble.removeAllListeners();
		try {
			noble.stopScanning();
		} catch {}
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
					clearTimeout(timer);
					noble.removeListener('stateChange', onState);
					resolve(true);
				}
			};
			const timer = setTimeout(() => {
				noble.removeListener('stateChange', onState);
				resolve(false);
			}, timeoutMs);
			noble.on('stateChange', onState);
		});
	}

	scanForScale(timeoutMs = 10000): Promise<DiscoveredScale | null> {
		const noble = this.noble;
		if (!noble) return Promise.resolve(null);
		const generation = this.generation;

		return new Promise((resolve) => {
			let discoverCount = 0;
			const cleanup = () => {
				noble.removeListener('discover', onDiscover);
				try {
					noble.stopScanning();
				} catch {}
			};
			const timer = setTimeout(() => {
				cleanup();
				this.log(`scan timeout — ${discoverCount} peripherals seen, no scale`);
				resolve(null);
			}, timeoutMs);
			const onDiscover = (peripheral: NoblePeripheral) => {
				discoverCount++;
				const localName = peripheral.advertisement?.localName || '';
				const address = peripheral.address || peripheral.id || '??';
				if (SCALE_PREFIXES.includes(localName.substring(0, 5).toUpperCase())) {
					clearTimeout(timer);
					cleanup();
					if (generation !== this.generation) {
						resolve(null);
						return;
					}
					this.peripheral = peripheral;
					resolve({ localName, address });
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
				clearTimeout(timer);
				cleanup();
				resolve(null);
			}
		});
	}

	async disconnectPeripheralAsync(): Promise<void> {
		if (!this.peripheral) return;
		await this.peripheral.disconnectAsync();
	}

	connectPeripheral(timeoutMs: number): Promise<void> {
		if (!this.peripheral) return Promise.reject(new Error('No peripheral selected'));
		const peripheral = this.peripheral;
		const timer = setTimeout(() => {
			try {
				peripheral.disconnect();
			} catch {}
		}, timeoutMs);
		return peripheral.connectAsync().finally(() => clearTimeout(timer));
	}

	watchDisconnect(): void {
		this.peripheral?.once('disconnect', this.onDisconnect);
	}

	discoverCharacteristics(timeoutMs: number): Promise<DiscoveredCharacteristics> {
		if (!this.peripheral) return Promise.reject(new Error('No peripheral selected'));
		const peripheral = this.peripheral;
		const generation = this.generation;
		const timer = setTimeout(() => {
			try {
				peripheral.disconnect();
			} catch {}
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
			.finally(() => clearTimeout(timer));
	}

	async subscribe(timeoutMs: number): Promise<void> {
		if (!this.notifyChar) throw new Error('Notify characteristic unavailable');
		this.notifyChar.on('data', this.onData);
		await this.withTimeout(this.notifyChar.subscribeAsync(), timeoutMs, 'Notify subscribe');
	}

	write(data: Buffer): Promise<void> {
		if (!this.writeChar) return Promise.reject(new Error('Write characteristic unavailable'));
		return this.writeChar.writeAsync(data, true);
	}

	stopScanning(): void {
		if (!this.noble) return;
		try {
			this.noble.stopScanning();
		} catch {}
	}

	async cancelConnection(): Promise<void> {
		const peripheral = this.peripheral;
		this.disconnectSync();
		if (!peripheral) return;
		try {
			await peripheral.disconnectAsync();
		} catch {}
	}

	disconnectSync(): void {
		this.generation++;
		if (this.notifyChar) {
			this.notifyChar.removeAllListeners('data');
			this.notifyChar = null;
		}
		this.writeChar = null;
		if (this.peripheral) {
			this.peripheral.removeAllListeners('disconnect');
			try {
				this.peripheral.disconnect();
			} catch {}
			this.peripheral = null;
		}
	}

	dispose(): void {
		this.disconnectSync();
		this.stopScanning();
		this.noble?.removeAllListeners();
		this.noble = null;
	}

	private withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
		return Promise.race([
			promise,
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error(`${label} timed out (${timeoutMs}ms)`)), timeoutMs),
			),
		]);
	}
}
