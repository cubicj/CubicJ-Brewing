export type AcaiaState = 'idle' | 'scanning' | 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface ButtonEvent {
  type: 'tare' | 'timer_start' | 'timer_stop' | 'timer_reset';
  weight?: number;
  timer?: number;
}

export interface AcaiaEvents {
  state: (state: AcaiaState) => void;
  weight: (grams: number, stable: boolean) => void;
  timer: (seconds: number) => void;
  battery: (percent: number) => void;
  button: (event: ButtonEvent) => void;
  error: (error: Error) => void;
}

export interface NobleCharacteristic {
  uuid: string;
  on(event: 'data', listener: (data: Buffer) => void): this;
  removeAllListeners(event?: string): this;
  subscribeAsync(): Promise<void>;
  writeAsync(data: Buffer, withoutResponse: boolean): Promise<void>;
}

export interface NoblePeripheral {
  uuid: string;
  id?: string;
  address: string;
  state: string;
  advertisement: { localName?: string };
  connectAsync(): Promise<void>;
  disconnectAsync(): Promise<void>;
  disconnect(): void;
  discoverSomeServicesAndCharacteristicsAsync(
    serviceUUIDs: string[],
    characteristicUUIDs: string[],
  ): Promise<{ characteristics: NobleCharacteristic[] }>;
  on(event: 'disconnect', listener: () => void): this;
  once(event: 'disconnect', listener: () => void): this;
  removeAllListeners(event?: string): this;
}

export interface Noble {
  state: string;
  on(event: 'stateChange', listener: (state: string) => void): this;
  on(event: 'discover', listener: (peripheral: NoblePeripheral) => void): this;
  on(event: string, listener: (...args: any[]) => void): this;
  removeListener(event: 'stateChange', listener: (state: string) => void): this;
  removeListener(event: 'discover', listener: (peripheral: NoblePeripheral) => void): this;
  removeListener(event: string, listener: (...args: any[]) => void): this;
  removeAllListeners(): this;
  startScanning(serviceUUIDs: string[], allowDuplicates: boolean): void;
  startScanningAsync(serviceUUIDs: string[], allowDuplicates: boolean): Promise<void>;
  stopScanning(): void;
  stopScanningAsync(): Promise<void>;
}

export const NOBLE_PATH = process.env.NOBLE_PATH || '<NOBLE_PATH>';
export const SCALE_PREFIXES = ['PEARL', 'ACAIA', 'PROCH', 'PYXIS', 'LUNAR'];

const MODEL_NAMES: [string, string][] = [
	['PEARLS', 'Acaia Pearl S'],
	['LUNAR', 'Acaia Lunar'],
	['PYXIS', 'Acaia Pyxis'],
	['PROCH', 'Acaia Proch'],
	['PEARL', 'Acaia Pearl'],
	['ACAIA', 'Acaia'],
];

export function resolveModelName(bleName: string): string {
	for (const [prefix, name] of MODEL_NAMES) {
		if (bleName.startsWith(prefix)) return name;
	}
	return bleName;
}
export const WRITE_UUID = '49535343884143f4a8d4ecbe34729bb3';
export const NOTIFY_UUID = '495353431e4d4bd9ba6123c647249616';

export const HEADER = [0xef, 0xdd] as const;

export const MSG_TYPE = {
  HEARTBEAT: 0,
  TARE: 4,
  GET_SETTINGS: 6,
  IDENTIFY: 11,
  NOTIFICATION_REQ: 12,
  TIMER_CONTROL: 13,
} as const;

export const EVENT_TYPE = {
  WEIGHT: 5,
  TIMER: 7,
  BUTTON: 8,
  HEARTBEAT_RESP: 11,
} as const;
