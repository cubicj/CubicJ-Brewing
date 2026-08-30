import type { EquipmentSettings, GrinderConfig, GrinderRpmConfig, ScaleConfig } from '../brew/types';
import type { FileAdapter } from './FileAdapter';

export function parseEquipmentSettings(value: unknown): EquipmentSettings | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const equipment = value as Record<string, unknown>;
	const keys: (keyof EquipmentSettings)[] = ['grinders', 'drippers', 'filters', 'baskets', 'accessories'];
	if (!keys.every((key) => Array.isArray(equipment[key]))) return null;

	const isGrinder = (grinder: unknown): grinder is GrinderConfig =>
		grinder != null &&
		typeof grinder === 'object' &&
		typeof (grinder as GrinderConfig).name === 'string' &&
		typeof (grinder as GrinderConfig).step === 'number' &&
		typeof (grinder as GrinderConfig).min === 'number' &&
		typeof (grinder as GrinderConfig).max === 'number';
	const isRpm = (rpm: unknown): rpm is GrinderRpmConfig =>
		rpm != null &&
		typeof rpm === 'object' &&
		typeof (rpm as GrinderRpmConfig).min === 'number' &&
		typeof (rpm as GrinderRpmConfig).max === 'number' &&
		typeof (rpm as GrinderRpmConfig).step === 'number' &&
		typeof (rpm as GrinderRpmConfig).current === 'number';
	const sanitizeGrinder = (grinder: GrinderConfig): GrinderConfig =>
		grinder.rpm === undefined || isRpm(grinder.rpm)
			? grinder
			: { name: grinder.name, step: grinder.step, min: grinder.min, max: grinder.max };
	const isScale = (scale: unknown): scale is ScaleConfig =>
		scale != null &&
		typeof scale === 'object' &&
		typeof (scale as ScaleConfig).name === 'string' &&
		typeof (scale as ScaleConfig).address === 'string' &&
		typeof (scale as ScaleConfig).lastConnectedAt === 'string';
	const isString = (item: unknown): item is string => typeof item === 'string';

	return {
		grinders: (equipment.grinders as unknown[]).filter(isGrinder).map(sanitizeGrinder),
		drippers: (equipment.drippers as unknown[]).filter(isString),
		filters: (equipment.filters as unknown[]).filter(isString),
		baskets: (equipment.baskets as unknown[]).filter(isString),
		accessories: (equipment.accessories as unknown[]).filter(isString),
		scales: Array.isArray(equipment.scales) ? (equipment.scales as unknown[]).filter(isScale) : [],
	};
}

export class EquipmentStorage {
	private path: string;

	constructor(
		private baseDir: string,
		private adapter: FileAdapter,
	) {
		this.path = `${baseDir}/equipment.json`;
	}

	async load(): Promise<EquipmentSettings | null> {
		const raw = await this.adapter.read(this.path);
		if (raw === null) return null;

		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			await this.backup(raw);
			return null;
		}

		const equipment = parseEquipmentSettings(parsed);
		if (equipment) return equipment;
		await this.backup(raw);
		return null;
	}

	async save(equipment: EquipmentSettings): Promise<void> {
		await this.adapter.mkdir(this.baseDir);
		await this.adapter.write(this.path, JSON.stringify(equipment, null, 2));
	}

	private async backup(content: string): Promise<void> {
		await this.adapter.mkdir(this.baseDir);
		const timestamp = new Date().toISOString().replace(/:/g, '-');
		await this.adapter.write(`${this.baseDir}/equipment.${timestamp}.bak`, content);
	}
}
