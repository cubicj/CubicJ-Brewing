import { describe, expect, it } from 'vitest';
import { decodePacket } from '../../src/acaia/packetDecoder';

function buildCompoundPacket(innerPayload: number[]): Buffer {
	const packet = Buffer.alloc(5 + innerPayload.length);
	packet[0] = 0xef;
	packet[1] = 0xdd;
	packet[2] = 12;
	packet[3] = innerPayload.length;
	for (let i = 0; i < innerPayload.length; i++) packet[4 + i] = innerPayload[i];
	return packet;
}

function buildSettingsPacket(values: number[]): Buffer {
	const packet = Buffer.alloc(5 + values.length);
	packet[0] = 0xef;
	packet[1] = 0xdd;
	packet[2] = 8;
	packet[3] = values.length;
	for (let i = 0; i < values.length; i++) packet[4 + i] = values[i];
	return packet;
}

describe('decodePacket', () => {
	it.each([
		{
			name: 'stable positive grams',
			payload: [5, 0xe8, 0x03, 0, 0, 1, 0x00],
			expected: { type: 'weight', weight: 100, stable: true },
		},
		{
			name: 'unstable negative grams',
			payload: [5, 0xe8, 0x03, 0, 0, 1, 0x03],
			expected: { type: 'weight', weight: -100, stable: false },
		},
	])('decodes $name', ({ payload, expected }) => {
		expect(decodePacket(buildCompoundPacket(payload))).toEqual([expected]);
	});

	it.each([
		{ payload: [7, 0, 0, 0], expected: 0 },
		{ payload: [7, 2, 30, 5], expected: 150.5 },
	])('decodes timer payload $payload', ({ payload, expected }) => {
		expect(decodePacket(buildCompoundPacket(payload))).toEqual([{ type: 'timer', seconds: expected }]);
	});

	it.each([
		{
			values: [85, 1, 2, 0, 3, 0, 0, 0, 1],
			expected: {
				battery: 85,
				timerRunning: true,
				units: 'grams',
				autoOffMinutes: 15,
				beep: true,
			},
		},
		{
			values: [0xfe, 0, 5, 0, 0, 0, 0, 0, 0],
			expected: {
				battery: 126,
				timerRunning: false,
				units: 'ounces',
				autoOffMinutes: 0,
				beep: false,
			},
		},
	])('decodes settings values $values', ({ values, expected }) => {
		expect(decodePacket(buildSettingsPacket(values))).toEqual([{ type: 'settings', settings: expected }]);
	});

	it.each([
		{
			name: 'tare with weight',
			payload: [8, 0, 5, 0xe8, 0x03, 0, 0, 1, 0],
			expected: { type: 'tare', weight: 100 },
		},
		{
			name: 'timer start with weight',
			payload: [8, 8, 5, 0xfa, 0x00, 0, 0, 1, 0],
			expected: { type: 'timer_start', weight: 25 },
		},
		{
			name: 'timer stop with timer and weight',
			payload: [8, 10, 7, 1, 2, 3, 0, 0x7b, 0x00, 0, 0, 1, 0],
			expected: { type: 'timer_stop', timer: 62.3, weight: 12.3 },
		},
		{
			name: 'timer reset with timer and weight',
			payload: [8, 9, 7, 0, 4, 5, 0, 0xc8, 0x00, 0, 0, 1, 0],
			expected: { type: 'timer_reset', timer: 4.5, weight: 20 },
		},
	])('decodes $name', ({ payload, expected }) => {
		expect(decodePacket(buildCompoundPacket(payload))).toEqual([{ type: 'button', event: expected }]);
	});

	it('preserves compound event order', () => {
		const packet = buildCompoundPacket([5, 0xe8, 0x03, 0, 0, 1, 0, 7, 2, 30, 5]);

		expect(decodePacket(packet)).toEqual([
			{ type: 'weight', weight: 100, stable: true },
			{ type: 'timer', seconds: 150.5 },
		]);
	});

	it.each([
		Buffer.from([]),
		Buffer.from([0xef, 0xdd]),
		Buffer.from([0xaa, 0xbb, 12, 1, 5, 0]),
		buildCompoundPacket([99, 1, 2, 3]),
	])('ignores invalid or unsupported packet %j', (packet) => {
		expect(decodePacket(packet)).toEqual([]);
	});
});
