export type AcaiaState = 'idle' | 'scanning' | 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface ButtonEvent {
  type: 'tare' | 'timer_start' | 'timer_stop' | 'timer_reset';
  weight?: number;
  timer?: number;
}

export interface AcaiaEvents {
  state: (state: AcaiaState) => void;
  weight: (grams: number) => void;
  timer: (seconds: number) => void;
  battery: (percent: number) => void;
  button: (event: ButtonEvent) => void;
  error: (error: Error) => void;
}

export const NOBLE_PATH = '<NOBLE_PATH>';
export const SCALE_PREFIXES = ['PEARL', 'ACAIA', 'PROCH', 'PYXIS', 'LUNAR'];
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
