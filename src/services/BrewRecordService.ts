import type { BrewRecord, BrewMethod } from '../brew/types';

export interface StorageAdapter {
	read(): Promise<string | null>;
	write(content: string): Promise<void>;
}

export class BrewRecordService {
	private records: BrewRecord[] | null = null;

	constructor(private adapter: StorageAdapter) {}

	private async load(): Promise<BrewRecord[]> {
		if (this.records) return this.records;
		const raw = await this.adapter.read();
		this.records = raw ? JSON.parse(raw) : [];
		return this.records!;
	}

	private async save(): Promise<void> {
		await this.adapter.write(JSON.stringify(this.records, null, 2));
	}

	async getAll(): Promise<BrewRecord[]> {
		return this.load();
	}

	async add(record: BrewRecord): Promise<void> {
		const records = await this.load();
		records.push(record);
		await this.save();
	}

	async getLastRecord(bean: string, method: BrewMethod): Promise<BrewRecord | undefined> {
		const records = await this.load();
		return records
			.filter(r => r.bean === bean && r.method === method)
			.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
	}
}
