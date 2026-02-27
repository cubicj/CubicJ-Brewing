export function encode(msgType: number, payload: number[]): Buffer {
  const buf = Buffer.alloc(5 + payload.length);
  buf[0] = 0xef;
  buf[1] = 0xdd;
  buf[2] = msgType;
  let ck1 = 0, ck2 = 0;
  for (let i = 0; i < payload.length; i++) {
    const v = payload[i] & 0xff;
    buf[3 + i] = v;
    if (i % 2 === 0) ck1 += v;
    else ck2 += v;
  }
  buf[3 + payload.length] = ck1 & 0xff;
  buf[4 + payload.length] = ck2 & 0xff;
  return buf;
}

const IDENTIFY_PAYLOAD = [0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x30, 0x31, 0x32, 0x33, 0x34];
const NOTIF_PAYLOAD = [9, 0, 1, 1, 2, 2, 5, 3, 4];

export function encodeIdentify(): Buffer {
  return encode(11, IDENTIFY_PAYLOAD);
}

export function encodeHeartbeat(): Buffer {
  return encode(0, [2, 0]);
}

export function encodeNotificationRequest(): Buffer {
  return encode(12, NOTIF_PAYLOAD);
}

export function encodeTare(): Buffer {
  return encode(4, [0]);
}

export function encodeTimerControl(action: 'start' | 'stop' | 'reset'): Buffer {
  const map = { start: 0, reset: 1, stop: 2 };
  return encode(13, [0, map[action]]);
}

export function encodeGetSettings(): Buffer {
  return encode(6, Array(16).fill(0));
}

export function decodeWeight(data: Buffer, offset: number): number {
  let value = ((data[offset + 1] & 0xff) << 8) | (data[offset] & 0xff);
  const unit = data[offset + 4] & 0xff;
  value /= Math.pow(10, unit);
  if ((data[offset + 5] & 0x02) === 0x02) value *= -1;
  return value;
}

export function decodeTimer(data: Buffer, offset: number): number {
  return (data[offset] & 0xff) * 60
    + (data[offset + 1] & 0xff)
    + (data[offset + 2] & 0xff) / 10;
}

export interface ScaleSettings {
  battery: number;
  units: 'grams' | 'ounces';
  autoOffMinutes: number;
  beep: boolean;
}

export function decodeSettings(data: Buffer, offset: number): ScaleSettings {
  return {
    battery: data[offset + 1] & 0x7f,
    units: (data[offset + 2] & 0xff) === 5 ? 'ounces' : 'grams',
    autoOffMinutes: (data[offset + 4] & 0xff) * 5,
    beep: (data[offset + 6] & 0xff) === 1,
  };
}

export class PacketBuffer {
  onPacket: ((packet: Buffer) => void) | null = null;
  private buffer: number[] = [];

  push(data: Buffer): void {
    if (data[0] === 0xef && data[1] === 0xdd) {
      if (this.buffer.length > 0) {
        this.emitBuffer();
      }
      this.buffer = [...data];
    } else {
      this.buffer.push(...data);
    }
  }

  flush(): void {
    if (this.buffer.length > 0) {
      this.emitBuffer();
    }
  }

  reset(): void {
    this.buffer = [];
  }

  private emitBuffer(): void {
    if (this.onPacket && this.buffer.length >= 3) {
      this.onPacket(Buffer.from(this.buffer));
    }
    this.buffer = [];
  }
}
