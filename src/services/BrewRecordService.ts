import type { BrewRecord, BrewMethod, BrewTemp } from '../brew/types';

export interface StorageAdapter {
	read(): Promise<string | null>;
	write(content: string): Promise<void>;
}

export class BrewRecordService {
	private records: BrewRecord[] | null = null;
	onChange: (() => void) | null = null;

	constructor(private adapter: StorageAdapter) {}

	private async load(): Promise<BrewRecord[]> {
		if (this.records) return this.records;
		const raw = await this.adapter.read();
		if (!raw) {
			this.records = [];
			return this.records;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			console.error('brew-records.json corrupt — backing up raw data');
			await this.adapter.write(raw + '\n// BACKUP ' + new Date().toISOString());
			this.records = [];
			return this.records;
		}
		if (!Array.isArray(parsed)) {
			console.error('brew-records.json is not an array — resetting');
			this.records = [];
			return this.records;
		}
		const valid = parsed.filter(
			(r: any) =>
				r &&
				typeof r === 'object' &&
				typeof r.id === 'string' &&
				typeof r.timestamp === 'string' &&
				typeof r.bean === 'string' &&
				(r.method === 'filter' || r.method === 'espresso'),
		);
		if (valid.length < parsed.length) {
			console.warn(`brew-records.json: ${parsed.length - valid.length} invalid records filtered out`);
		}
		this.records = valid as BrewRecord[];
		return this.records;
	}

	private async save(): Promise<void> {
		await this.adapter.write(JSON.stringify(this.records, null, 2));
	}

	async getAll(): Promise<BrewRecord[]> {
		return this.load();
	}

	async getByBean(bean: string): Promise<BrewRecord[]> {
		const records = await this.load();
		return records.filter((r) => r.bean === bean).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
	}

	async add(record: BrewRecord): Promise<void> {
		const records = await this.load();
		records.push(record);
		await this.save();
		this.onChange?.();
	}

	async update(id: string, changes: Partial<BrewRecord>): Promise<void> {
		const records = await this.load();
		const idx = records.findIndex((r) => r.id === id);
		if (idx === -1) return;
		records[idx] = { ...records[idx], ...changes } as BrewRecord;
		await this.save();
		this.onChange?.();
	}

	async removeWithProfile(
		id: string,
		profilePath: string | undefined,
		profileStorage: { delete(path: string): Promise<void> },
	): Promise<void> {
		if (profilePath) await profileStorage.delete(profilePath);
		await this.remove(id);
	}

	async remove(id: string): Promise<void> {
		const records = await this.load();
		const idx = records.findIndex((r) => r.id === id);
		if (idx === -1) return;
		records.splice(idx, 1);
		await this.save();
		this.onChange?.();
	}

	async getLastRecord(
		bean: string,
		method: BrewMethod,
		temp: BrewTemp,
		equip?: { filter?: string; grinder?: string; dripper?: string },
	): Promise<BrewRecord | undefined> {
		const records = await this.load();
		return records
			.filter((r) => {
				if (r.bean !== bean || r.method !== method || r.temp !== temp) return false;
				if (equip?.filter && !(r.method === 'filter' && r.filter === equip.filter)) return false;
				if (equip?.grinder && r.grinder !== equip.grinder) return false;
				if (equip?.dripper && !(r.method === 'filter' && r.dripper === equip.dripper)) return false;
				return true;
			})
			.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
	}
}
