import { describe, it, expect } from 'vitest';
import {
  encode, encodeIdentify, encodeHeartbeat, encodeNotificationRequest, encodeTare, encodeTimerControl, encodeGetSettings, encodePowerOff,
  decodeWeight, decodeTimer, decodeSettings, PacketBuffer,
} from './protocol';

describe('encode', () => {
  it('builds packet with header, payload, and dual checksums', () => {
    const result = encode(0, [2, 0]);
    expect([...result]).toEqual([0xef, 0xdd, 0x00, 0x02, 0x00, 0x02, 0x00]);
  });

  it('computes even-index and odd-index checksums separately', () => {
    const result = encode(12, [9, 0, 1, 1, 2, 2, 5, 3, 4]);
    expect(result[0]).toBe(0xef);
    expect(result[1]).toBe(0xdd);
    expect(result[2]).toBe(12);
    const evenSum = (9 + 1 + 2 + 5 + 4) & 0xff;
    const oddSum = (0 + 1 + 2 + 3) & 0xff;
    expect(result[result.length - 2]).toBe(evenSum);
    expect(result[result.length - 1]).toBe(oddSum);
  });
});

describe('command helpers', () => {
  it('encodeIdentify produces new-style 15-byte payload', () => {
    const result = encodeIdentify();
    expect(result[2]).toBe(11);
    expect(result.length).toBe(5 + 15);
    expect(result[3]).toBe(0x30);
    expect(result[17]).toBe(0x34);
  });

  it('encodeHeartbeat', () => {
    const result = encodeHeartbeat();
    expect([...result]).toEqual([0xef, 0xdd, 0x00, 0x02, 0x00, 0x02, 0x00]);
  });

  it('encodeNotificationRequest subscribes to weight, battery, timer, button', () => {
    const result = encodeNotificationRequest();
    expect(result[2]).toBe(12);
    expect(result[3]).toBe(9);
    expect(result[4]).toBe(0); expect(result[5]).toBe(1);
    expect(result[6]).toBe(1); expect(result[7]).toBe(2);
    expect(result[8]).toBe(2); expect(result[9]).toBe(5);
    expect(result[10]).toBe(3); expect(result[11]).toBe(4);
  });

  it('encodeTare', () => {
    const result = encodeTare();
    expect(result[2]).toBe(4);
  });

  it('encodeTimerControl start/stop/reset', () => {
    expect(encodeTimerControl('start')[4]).toBe(0);
    expect(encodeTimerControl('stop')[4]).toBe(2);
    expect(encodeTimerControl('reset')[4]).toBe(1);
  });

  it('encodeGetSettings sends 16 zero bytes', () => {
    const result = encodeGetSettings();
    expect(result[2]).toBe(6);
    expect(result.length).toBe(5 + 16);
  });

  it('encodePowerOff sends msgType 24 with payload [0]', () => {
    const result = encodePowerOff();
    expect(result[2]).toBe(24);
    expect(result.length).toBe(6);
    expect(result[3]).toBe(0);
  });
});

describe('decodeWeight', () => {
  it('decodes standard weight from protocol spec example', () => {
    const payload = Buffer.from([0xdf, 0x06, 0x00, 0x00, 0x01, 0x00]);
    const result = decodeWeight(payload, 0);
    expect(result.weight).toBeCloseTo(175.9);
    expect(result.stable).toBe(true);
  });

  it('handles negative weight', () => {
    const payload = Buffer.from([0xdf, 0x06, 0x00, 0x00, 0x01, 0x02]);
    const result = decodeWeight(payload, 0);
    expect(result.weight).toBeCloseTo(-175.9);
    expect(result.stable).toBe(true);
  });

  it('handles unit=2 (0.01g resolution)', () => {
    const payload = Buffer.from([0x57, 0x13, 0x00, 0x00, 0x02, 0x00]);
    const result = decodeWeight(payload, 0);
    expect(result.weight).toBeCloseTo(49.51);
    expect(result.stable).toBe(true);
  });

  it('applies offset parameter', () => {
    const payload = Buffer.from([0x00, 0x00, 0xdf, 0x06, 0x00, 0x00, 0x01, 0x00]);
    const result = decodeWeight(payload, 2);
    expect(result.weight).toBeCloseTo(175.9);
    expect(result.stable).toBe(true);
  });

  it('detects unstable weight (bit 0 set)', () => {
    const payload = Buffer.from([0xdf, 0x06, 0x00, 0x00, 0x01, 0x01]);
    const result = decodeWeight(payload, 0);
    expect(result.weight).toBeCloseTo(175.9);
    expect(result.stable).toBe(false);
  });

  it('detects unstable negative weight (bits 0+1 set)', () => {
    const payload = Buffer.from([0xdf, 0x06, 0x00, 0x00, 0x01, 0x03]);
    const result = decodeWeight(payload, 0);
    expect(result.weight).toBeCloseTo(-175.9);
    expect(result.stable).toBe(false);
  });
});

describe('decodeTimer', () => {
  it('decodes minutes, seconds, deciseconds', () => {
    const payload = Buffer.from([1, 30, 5]);
    expect(decodeTimer(payload, 0)).toBeCloseTo(90.5);
  });

  it('applies offset', () => {
    const payload = Buffer.from([0x00, 0x00, 0, 45, 0]);
    expect(decodeTimer(payload, 2)).toBeCloseTo(45.0);
  });
});

describe('decodeSettings', () => {
  it('extracts battery, timerRunning, units, auto-off from Pearl S packet', () => {
    const payload = Buffer.from([
      0x1f, 0x64, 0x00, 0x02, 0x02, 0x03, 0x00, 0x00, 0x00, 0x01,
      0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02,
    ]);
    const result = decodeSettings(payload, 0);
    expect(result.battery).toBe(100);
    expect(result.timerRunning).toBe(false);
    expect(result.units).toBe('grams');
    expect(result.autoOffMinutes).toBe(15);
    expect(result.beep).toBe(true);
  });

  it('detects timerRunning=true', () => {
    const payload = Buffer.from([
      0x1f, 0x64, 0x01, 0x02, 0x02, 0x03, 0x00, 0x00, 0x00, 0x01,
    ]);
    const result = decodeSettings(payload, 0);
    expect(result.timerRunning).toBe(true);
  });
});

describe('PacketBuffer', () => {
  it('emits complete packet immediately on push', () => {
    const buf = new PacketBuffer();
    const packets: Buffer[] = [];
    buf.onPacket = (p) => packets.push(p);

    buf.push(Buffer.from([0xef, 0xdd, 0x0c, 0x07, 0x05, 0xdf, 0x06, 0x00, 0x00, 0x01, 0x00, 0x10, 0x20]));
    expect(packets.length).toBe(1);
    expect(packets[0][2]).toBe(0x0c);
    expect(packets[0].length).toBe(12);
  });

  it('reassembles fragmented packets across pushes', () => {
    const buf = new PacketBuffer();
    const packets: Buffer[] = [];
    buf.onPacket = (p) => packets.push(p);

    buf.push(Buffer.from([0xef, 0xdd, 0x0c]));
    expect(packets.length).toBe(0);

    buf.push(Buffer.from([0x07, 0x05, 0xdf, 0x06, 0x00, 0x00, 0x01, 0x00, 0x10, 0x20]));
    expect(packets.length).toBe(1);
    expect(packets[0][0]).toBe(0xef);
    expect(packets[0][1]).toBe(0xdd);
    expect(packets[0].length).toBe(12);
  });

  it('extracts multiple packets from single push', () => {
    const buf = new PacketBuffer();
    const packets: Buffer[] = [];
    buf.onPacket = (p) => packets.push(p);

    buf.push(Buffer.from([
      0xef, 0xdd, 0x0c, 0x01, 0x05, 0xaa,
      0xef, 0xdd, 0x00, 0x02, 0x00, 0x02, 0x00
    ]));
    expect(packets.length).toBe(2);
    expect(packets[0][2]).toBe(0x0c);
    expect(packets[1][2]).toBe(0x00);
  });

  it('handles split header across pushes', () => {
    const buf = new PacketBuffer();
    const packets: Buffer[] = [];
    buf.onPacket = (p) => packets.push(p);

    buf.push(Buffer.from([0xef]));
    expect(packets.length).toBe(0);

    buf.push(Buffer.from([0xdd, 0x0c, 0x07, 0x05, 0xdf, 0x06, 0x00, 0x00, 0x01, 0x00, 0x10, 0x20]));
    expect(packets.length).toBe(1);
    expect(packets[0][0]).toBe(0xef);
    expect(packets[0][1]).toBe(0xdd);
  });

  it('discards garbage before first header', () => {
    const buf = new PacketBuffer();
    const packets: Buffer[] = [];
    buf.onPacket = (p) => packets.push(p);

    buf.push(Buffer.from([0xaa, 0xbb, 0xef, 0xdd, 0x0c, 0x01, 0x05, 0xaa]));
    expect(packets.length).toBe(1);
    expect(packets[0][0]).toBe(0xef);
  });

  it('skips invalid payloadLen and recovers', () => {
    const buf = new PacketBuffer();
    const packets: Buffer[] = [];
    buf.onPacket = (p) => packets.push(p);

    buf.push(Buffer.from([
      0xef, 0xdd, 0xff, 0xff, 0x00,
      0xef, 0xdd, 0x0c, 0x01, 0x05, 0xaa
    ]));
    expect(packets.length).toBe(1);
    expect(packets[0][2]).toBe(0x0c);
  });

  it('flush emits incomplete buffered data', () => {
    const buf = new PacketBuffer();
    const packets: Buffer[] = [];
    buf.onPacket = (p) => packets.push(p);

    buf.push(Buffer.from([0xef, 0xdd, 0x0c, 0x07, 0x05, 0xdf]));
    expect(packets.length).toBe(0);

    buf.flush();
    expect(packets.length).toBe(1);
  });

  it('reset clears buffer', () => {
    const buf = new PacketBuffer();
    const packets: Buffer[] = [];
    buf.onPacket = (p) => packets.push(p);

    buf.push(Buffer.from([0xef, 0xdd, 0x0c]));
    buf.reset();
    buf.flush();
    expect(packets.length).toBe(0);
  });
});
