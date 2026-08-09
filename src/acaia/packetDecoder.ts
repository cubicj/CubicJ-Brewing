import type { ButtonEvent } from './types';
import { BUTTON_CODE, BUTTON_PAYLOAD, EVENT_TYPE, MSG_TYPE } from './types';
import { decodeSettings, decodeTimer, decodeWeight } from './protocol';
import type { ScaleSettings } from './protocol';

export type DecodedPacketEvent =
	| { type: 'weight'; weight: number; stable: boolean }
	| { type: 'timer'; seconds: number }
	| { type: 'settings'; settings: ScaleSettings }
	| { type: 'button'; event: ButtonEvent };

export function decodePacket(packet: Buffer): DecodedPacketEvent[] {
	if (packet.length < 3 || packet[0] !== 0xef || packet[1] !== 0xdd) return [];

	const command = packet[2];
	if (command === MSG_TYPE.SETTINGS_RESP && packet.length >= 10) {
		return [{ type: 'settings', settings: decodeSettings(packet, 3) }];
	}
	if ((command !== MSG_TYPE.NOTIFICATION_REQ && command !== MSG_TYPE.IDENTIFY) || packet.length <= 4) return [];

	const events: DecodedPacketEvent[] = [];
	const payloadEnd = 3 + packet[3];
	let offset = 4;

	while (offset < payloadEnd) {
		const innerType = packet[offset];
		if (innerType === EVENT_TYPE.WEIGHT && offset + 7 <= packet.length) {
			const weight = decodeWeight(packet, offset + 1);
			events.push({ type: 'weight', weight: weight.weight, stable: weight.stable });
			offset += 7;
		} else if (innerType === EVENT_TYPE.TIMER && offset + 4 <= packet.length) {
			events.push({ type: 'timer', seconds: decodeTimer(packet, offset + 1) });
			offset += 4;
		} else if (innerType === EVENT_TYPE.BUTTON && offset + 3 <= packet.length) {
			const event = decodeButtonEvent(packet, offset);
			if (event) events.push({ type: 'button', event });
			break;
		} else {
			break;
		}
	}

	return events;
}

function decodeButtonEvent(packet: Buffer, typeOffset: number): ButtonEvent | null {
	const code = packet[typeOffset + 1];
	const payload = packet[typeOffset + 2];

	if (code === BUTTON_CODE.TARE && payload === BUTTON_PAYLOAD.WITH_WEIGHT) {
		const event: ButtonEvent = { type: 'tare' };
		if (typeOffset + 9 <= packet.length) event.weight = decodeWeight(packet, typeOffset + 3).weight;
		return event;
	}
	if (code === BUTTON_CODE.TIMER_START) {
		const event: ButtonEvent = { type: 'timer_start' };
		if (payload === BUTTON_PAYLOAD.WITH_WEIGHT && typeOffset + 9 <= packet.length) {
			event.weight = decodeWeight(packet, typeOffset + 3).weight;
		}
		return event;
	}
	if (code === BUTTON_CODE.TIMER_STOP || code === BUTTON_CODE.TIMER_RESET) {
		const event: ButtonEvent = { type: code === BUTTON_CODE.TIMER_STOP ? 'timer_stop' : 'timer_reset' };
		if (payload === BUTTON_PAYLOAD.WITH_TIMER && typeOffset + 7 <= packet.length) {
			event.timer = decodeTimer(packet, typeOffset + 3);
			if (typeOffset + 13 <= packet.length) event.weight = decodeWeight(packet, typeOffset + 7).weight;
		}
		return event;
	}

	return null;
}
