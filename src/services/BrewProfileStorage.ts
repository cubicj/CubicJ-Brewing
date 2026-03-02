import type { FileAdapter } from './FileAdapter';
import type { BrewProfilePoint } from '../brew/types';

export class BrewProfileStorage {
	constructor(private baseDir: string, private adapter: FileAdapter) {}

	async save(timestamp: string, points: BrewProfilePoint[]): Promise<string> {
		const safeTimestamp = timestamp.replace(/:/g, '-');
		const relativePath = `brew-profiles/${safeTimestamp}.json`;
		await this.adapter.mkdir(`${this.baseDir}/brew-profiles`);
		await this.adapter.write(`${this.baseDir}/${relativePath}`, JSON.stringify(points));
		return relativePath;
	}

	async load(profilePath: string): Promise<BrewProfilePoint[]> {
		const raw = await this.adapter.read(`${this.baseDir}/${profilePath}`);
		try { return raw ? JSON.parse(raw) : []; }
		catch { console.error(`Profile ${profilePath} corrupt`); return []; }
	}

	async delete(profilePath: string): Promise<void> {
		await this.adapter.remove(`${this.baseDir}/${profilePath}`);
	}
}
