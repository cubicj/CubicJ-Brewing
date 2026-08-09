import type { EquipmentSettings, GrinderConfig, GrinderRpmConfig, LogConfig } from '../brew/types';

export const DATA_VERSION = 3;

export interface PluginDataPort {
	loadData(): Promise<unknown>;
	saveData(data: unknown): Promise<void>;
}

export class PluginDataStore {
	equipment: EquipmentSettings = { grinders: [], drippers: [], filters: [], baskets: [], accessories: [] };
	logConfig: LogConfig = { enabled: false, categories: [] };
	beanFolder = '';
	locale = 'en';
	firstInstall = false;
	savedDataVersion = 0;

	constructor(private port: PluginDataPort) {}

	async load(): Promise<void> {
		const raw = await this.port.loadData();
		this.firstInstall = raw === null || raw === undefined;
		const data = (raw ?? {}) as Record<string, unknown>;
		this.savedDataVersion = typeof data.dataVersion === 'number' ? data.dataVersion : 0;
		const eq = data.equipment as Record<string, unknown> | undefined;
		if (eq && typeof eq === 'object' && !Array.isArray(eq)) {
			const keys: (keyof EquipmentSettings)[] = ['grinders', 'drippers', 'filters', 'baskets', 'accessories'];
			const valid = keys.every((k) => Array.isArray(eq[k]));
			if (valid) {
				const isGrinder = (g: unknown): g is GrinderConfig =>
					g != null &&
					typeof g === 'object' &&
					typeof (g as GrinderConfig).name === 'string' &&
					typeof (g as GrinderConfig).step === 'number' &&
					typeof (g as GrinderConfig).min === 'number' &&
					typeof (g as GrinderConfig).max === 'number';
				const isRpm = (r: unknown): r is GrinderRpmConfig =>
					r != null &&
					typeof r === 'object' &&
					typeof (r as GrinderRpmConfig).min === 'number' &&
					typeof (r as GrinderRpmConfig).max === 'number' &&
					typeof (r as GrinderRpmConfig).step === 'number' &&
					typeof (r as GrinderRpmConfig).current === 'number';
				const sanitizeGrinder = (g: GrinderConfig): GrinderConfig =>
					g.rpm === undefined || isRpm(g.rpm) ? g : { name: g.name, step: g.step, min: g.min, max: g.max };
				const isString = (s: unknown): s is string => typeof s === 'string';
				this.equipment = {
					grinders: (eq.grinders as unknown[]).filter(isGrinder).map(sanitizeGrinder),
					drippers: (eq.drippers as unknown[]).filter(isString),
					filters: (eq.filters as unknown[]).filter(isString),
					baskets: (eq.baskets as unknown[]).filter(isString),
					accessories: (eq.accessories as unknown[]).filter(isString),
				};
			}
		}
		const lc = data.logConfig as Record<string, unknown> | undefined;
		if (lc && typeof lc === 'object' && !Array.isArray(lc)) {
			this.logConfig = {
				enabled: typeof lc.enabled === 'boolean' ? lc.enabled : false,
				categories: Array.isArray(lc.categories) ? lc.categories : [],
			};
		}
		if (typeof data.beanFolder === 'string') {
			this.beanFolder = data.beanFolder;
		}
		if (typeof data.locale === 'string') {
			this.locale = data.locale;
		}
	}

	async patchData(patch: Record<string, unknown>): Promise<void> {
		const data = ((await this.port.loadData()) ?? {}) as Record<string, unknown>;
		Object.assign(data, patch);
		await this.port.saveData(data);
	}

	async saveEquipment(): Promise<void> {
		await this.patchData({ equipment: this.equipment });
	}

	async saveBeanFolder(folder: string): Promise<void> {
		this.beanFolder = folder;
		await this.patchData({ beanFolder: folder });
	}

	async saveLocale(locale: string): Promise<void> {
		this.locale = locale;
		await this.patchData({ locale });
	}

	async saveLogConfig(config: LogConfig): Promise<void> {
		this.logConfig = config;
		await this.patchData({ logConfig: config });
	}

	async saveDataVersion(): Promise<void> {
		await this.patchData({ dataVersion: DATA_VERSION });
	}
}
