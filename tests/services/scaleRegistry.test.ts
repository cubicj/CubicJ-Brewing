import { describe, expect, it } from 'vitest';
import { findRegisteredScale, registeredAddresses, upsertScaleRegistration } from '../../src/services/scaleRegistry';
import type { ScaleConfig } from '../../src/brew/types';

describe('upsertScaleRegistration', () => {
	it('appends a new scale with the default name', () => {
		const scales: ScaleConfig[] = [];
		upsertScaleRegistration(scales, 'Acaia Pearl S', 'AA:BB:CC:DD:EE:FF', '2026-08-30T01:00:00.000Z');
		expect(scales).toEqual([{ name: 'Acaia Pearl S', address: 'AA:BB:CC:DD:EE:FF', lastConnectedAt: '2026-08-30T01:00:00.000Z' }]);
	});

	it('refreshes lastConnectedAt without touching a customized name', () => {
		const scales: ScaleConfig[] = [{ name: 'Kitchen scale', address: 'aa:bb:cc:dd:ee:ff', lastConnectedAt: '2026-08-01T00:00:00.000Z' }];
		upsertScaleRegistration(scales, 'Acaia Pearl S', 'AA:BB:CC:DD:EE:FF', '2026-08-30T01:00:00.000Z');
		expect(scales).toHaveLength(1);
		expect(scales[0].name).toBe('Kitchen scale');
		expect(scales[0].lastConnectedAt).toBe('2026-08-30T01:00:00.000Z');
	});
});

describe('registeredAddresses', () => {
	it('orders by lastConnectedAt descending', () => {
		const scales: ScaleConfig[] = [
			{ name: 'A', address: '11', lastConnectedAt: '2026-08-01T00:00:00.000Z' },
			{ name: 'B', address: '22', lastConnectedAt: '2026-08-20T00:00:00.000Z' },
		];
		expect(registeredAddresses(scales)).toEqual(['22', '11']);
	});
});

describe('findRegisteredScale', () => {
	it('matches by normalized address and returns null otherwise', () => {
		const scales: ScaleConfig[] = [{ name: 'A', address: 'aa:bb:cc:dd:ee:ff', lastConnectedAt: '2026-08-01T00:00:00.000Z' }];
		expect(findRegisteredScale(scales, 'AABBCCDDEEFF')?.name).toBe('A');
		expect(findRegisteredScale(scales, '11:11:11:11:11:11')).toBeNull();
		expect(findRegisteredScale(scales, null)).toBeNull();
	});
});
