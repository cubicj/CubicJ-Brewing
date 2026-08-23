import type { EquipmentSettings, LogConfig } from '../brew/types';
import { parseEquipmentSettings } from './EquipmentStorage';

export const DATA_VERSION = 3;

export interface PluginDataPort {
	loadData(): Promise<unknown>;
	saveData(data: unknown): Promise<void>;
}

export class PluginDataStore {
	legacyEquipment: EquipmentSettings | null = null;
	logConfig: LogConfig = { enabled: false, categories: [] };
	beanFolder = '';
	beanHubNote = '';
	locale = 'en';
	firstInstall = false;
	savedDataVersion = 0;
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(private port: PluginDataPort) {}

	async load(): Promise<void> {
		const raw = await this.port.loadData();
		this.firstInstall = raw === null || raw === undefined;
		const data = (raw ?? {}) as Record<string, unknown>;
		this.savedDataVersion = typeof data.dataVersion === 'number' ? data.dataVersion : 0;
		this.legacyEquipment = parseEquipmentSettings(data.equipment);
		const lc = data.logConfig as Record<string, unknown> | undefined;
		if (lc && typeof lc === 'object' && !Array.isArray(lc)) {
			this.logConfig = {
				enabled: typeof lc.enabled === 'boolean' ? lc.enabled : false,
				categories: Array.isArray(lc.categories) ? (lc.categories as string[]) : [],
			};
		}
		if (typeof data.beanFolder === 'string') {
			this.beanFolder = data.beanFolder;
		}
		if (typeof data.beanHubNote === 'string') {
			this.beanHubNote = data.beanHubNote;
		}
		if (typeof data.locale === 'string') {
			this.locale = data.locale;
		}
	}

	private enqueueWrite(mutate: (data: Record<string, unknown>) => void): Promise<void> {
		const run = async () => {
			const data = ((await this.port.loadData()) ?? {}) as Record<string, unknown>;
			mutate(data);
			await this.port.saveData(data);
		};
		const next = this.writeQueue.then(run, run);
		this.writeQueue = next.catch(() => undefined);
		return next;
	}

	patchData(patch: Record<string, unknown>): Promise<void> {
		return this.enqueueWrite((data) => Object.assign(data, patch));
	}

	async clearLegacyEquipment(): Promise<void> {
		await this.enqueueWrite((data) => {
			delete data.equipment;
		});
		this.legacyEquipment = null;
	}

	async saveBeanFolder(folder: string): Promise<void> {
		this.beanFolder = folder;
		await this.patchData({ beanFolder: folder });
	}

	async saveBeanHubNote(path: string): Promise<void> {
		this.beanHubNote = path;
		await this.patchData({ beanHubNote: path });
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
