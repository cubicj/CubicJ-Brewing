import type { BrewRecord, BrewMethod, BrewTemp, BrewProfilePoint } from '../brew/types';
import { estimateYield } from '../brew/yieldEstimator';

export const BREW_RECORDS_VERSION = 1;

export interface BrewRecordsEnvelope {
	version: number;
	records: BrewRecord[];
}

export interface StorageAdapter {
	read(): Promise<string | null>;
	write(content: string): Promise<void>;
	writeBackup?(content: string): Promise<void>;
}

export class BrewRecordService {
	private records: BrewRecord[] | null = null;
	onChange: (() => void) | null = null;

	constructor(private adapter: StorageAdapter) {}

	private validateRecords(arr: unknown[]): BrewRecord[] {
		const valid = arr.filter(
			(r: any) =>
				r &&
				typeof r === 'object' &&
				typeof r.id === 'string' &&
				typeof r.timestamp === 'string' &&
				typeof r.bean === 'string' &&
				(r.method === 'filter' || r.method === 'espresso'),
		);
		if (valid.length < arr.length) {
			console.warn(`brew-records.json: ${arr.length - valid.length} invalid records filtered out`);
		}
		return valid as BrewRecord[];
	}

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
			if (this.adapter.writeBackup) {
				await this.adapter.writeBackup(raw);
			}
			this.records = [];
			return this.records;
		}
		if (Array.isArray(parsed)) {
			this.records = this.validateRecords(parsed);
			return this.records;
		}
		if (parsed && typeof parsed === 'object' && 'version' in parsed && 'records' in parsed) {
			const envelope = parsed as { version: number; records: unknown };
			if (envelope.version > BREW_RECORDS_VERSION) {
				console.warn(`brew-records.json version ${envelope.version} > ${BREW_RECORDS_VERSION} — loading anyway`);
			}
			if (Array.isArray(envelope.records)) {
				this.records = this.validateRecords(envelope.records);
				return this.records;
			}
		}
		console.error('brew-records.json unrecognized format — resetting');
		this.records = [];
		return this.records;
	}

	private async save(): Promise<void> {
		const envelope: BrewRecordsEnvelope = {
			version: BREW_RECORDS_VERSION,
			records: this.records ?? [],
		};
		await this.adapter.write(JSON.stringify(envelope, null, 2));
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

	async migrateYields(profileStorage: { load(path: string): Promise<BrewProfilePoint[]> }): Promise<void> {
		const records = await this.load();
		let changed = false;
		for (const record of records) {
			if (record.method !== 'filter' || !record.profilePath) continue;
			try {
				const points = await profileStorage.load(record.profilePath);
				const estimated = estimateYield(points);
				if (estimated !== undefined && estimated !== record.yield) {
					record.yield = estimated;
					changed = true;
				}
			} catch {
				continue;
			}
		}
		if (changed) await this.save();
	}
}
