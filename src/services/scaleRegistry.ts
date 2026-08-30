import { normalizeScaleAddress } from '../acaia/types';
import type { ScaleConfig } from '../brew/types';

export function upsertScaleRegistration(scales: ScaleConfig[], name: string, address: string, now: string): void {
	const normalized = normalizeScaleAddress(address);
	const existing = scales.find((scale) => normalizeScaleAddress(scale.address) === normalized);
	if (existing) {
		existing.lastConnectedAt = now;
		return;
	}
	scales.push({ name, address, lastConnectedAt: now });
}

export function findRegisteredScale(scales: ScaleConfig[], address: string | null): ScaleConfig | null {
	if (!address) return null;
	const normalized = normalizeScaleAddress(address);
	return scales.find((scale) => normalizeScaleAddress(scale.address) === normalized) ?? null;
}

export function registeredAddresses(scales: ScaleConfig[]): string[] {
	return [...scales]
		.sort((a, b) => b.lastConnectedAt.localeCompare(a.lastConnectedAt))
		.map((scale) => scale.address);
}
