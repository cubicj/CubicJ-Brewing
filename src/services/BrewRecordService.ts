import type { BrewRecord, BrewMethod, BrewTemp, BrewProfilePoint } from '../brew/types';
import { estimateYield } from '../brew/yieldEstimator';
import { type Result, ok, fail } from '../types/result';

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
		return arr.filter(
			(r: any) =>
				r &&
				typeof r === 'object' &&
				typeof r.id === 'string' &&
				typeof r.timestamp === 'string' &&
				typeof r.bean === 'string' &&
				(r.method === 'filter' || r.method === 'espresso'),
		) as BrewRecord[];
	}

	private async load(): Promise<Result<BrewRecord[]>> {
		if (this.records) return ok(this.records);
		const raw = await this.adapter.read();
		if (!raw) {
			this.records = [];
			return ok(this.records);
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			if (this.adapter.writeBackup) await this.adapter.writeBackup(raw);
			this.records = [];
			return fail('RECORD_PARSE_FAILED', 'brew-records.json corrupt — backed up raw data');
		}
		if (Array.isArray(parsed)) {
			this.records = this.validateRecords(parsed);
			return ok(this.records);
		}
		if (parsed && typeof parsed === 'object' && 'version' in parsed && 'records' in parsed) {
			const envelope = parsed as { version: number; records: unknown };
			if (Array.isArray(envelope.records)) {
				this.records = this.validateRecords(envelope.records);
				return ok(this.records);
			}
		}
		this.records = [];
		return fail('RECORD_SCHEMA_INVALID', 'brew-records.json unrecognized format');
	}

	private async save(): Promise<void> {
		const envelope: BrewRecordsEnvelope = {
			version: BREW_RECORDS_VERSION,
			records: this.records ?? [],
		};
		await this.adapter.write(JSON.stringify(envelope, null, 2));
	}

	async getAll(): Promise<Result<BrewRecord[]>> {
		return this.load();
	}

	async getByBean(bean: string): Promise<Result<BrewRecord[]>> {
		const result = await this.load();
		if (!result.ok) return result;
		return ok(result.data.filter((r) => r.bean === bean).sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
	}

	async add(record: BrewRecord): Promise<Result<void>> {
		const result = await this.load();
		if (!result.ok) return result;
		result.data.push(record);
		await this.save();
		this.onChange?.();
		return ok(undefined);
	}

	async update(id: string, changes: Partial<BrewRecord>): Promise<Result<void>> {
		const result = await this.load();
		if (!result.ok) return result;
		const idx = result.data.findIndex((r) => r.id === id);
		if (idx === -1) return fail('RECORD_NOT_FOUND', `Record ${id} not found`);
		result.data[idx] = { ...result.data[idx], ...changes } as BrewRecord;
		await this.save();
		this.onChange?.();
		return ok(undefined);
	}

	async removeWithProfile(
		id: string,
		profilePath: string | undefined,
		profileStorage: { delete(path: string): Promise<Result<void>> },
	): Promise<Result<void>> {
		if (profilePath) {
			const delResult = await profileStorage.delete(profilePath);
			if (!delResult.ok) return delResult;
		}
		return this.remove(id);
	}

	async remove(id: string): Promise<Result<void>> {
		const result = await this.load();
		if (!result.ok) return result;
		const idx = result.data.findIndex((r) => r.id === id);
		if (idx === -1) return fail('RECORD_NOT_FOUND', `Record ${id} not found`);
		result.data.splice(idx, 1);
		await this.save();
		this.onChange?.();
		return ok(undefined);
	}

	async getLastRecord(
		bean: string,
		method: BrewMethod,
		temp: BrewTemp,
		equip?: { filter?: string; grinder?: string; dripper?: string },
	): Promise<Result<BrewRecord | undefined>> {
		const result = await this.load();
		if (!result.ok) return result;
		return ok(
			result.data
				.filter((r) => {
					if (r.bean !== bean || r.method !== method || r.temp !== temp) return false;
					if (equip?.filter && !(r.method === 'filter' && r.filter === equip.filter)) return false;
					if (equip?.grinder && r.grinder !== equip.grinder) return false;
					if (equip?.dripper && !(r.method === 'filter' && r.dripper === equip.dripper)) return false;
					return true;
				})
				.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0],
		);
	}

	async migrateYields(profileStorage: { load(path: string): Promise<Result<BrewProfilePoint[]>> }): Promise<void> {
		const result = await this.load();
		if (!result.ok) return;
		let changed = false;
		for (const record of result.data) {
			if (record.method !== 'filter' || !record.profilePath) continue;
			const loadResult = await profileStorage.load(record.profilePath);
			if (!loadResult.ok) continue;
			const estimated = estimateYield(loadResult.data);
			if (estimated !== undefined && estimated !== record.yield) {
				record.yield = estimated;
				changed = true;
			}
		}
		if (changed) await this.save();
	}
}
