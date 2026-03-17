import type { FileAdapter } from './FileAdapter';
import type { BrewProfilePoint } from '../brew/types';
import { type Result, ok, fail } from '../types/result';

export class BrewProfileStorage {
	constructor(
		private baseDir: string,
		private adapter: FileAdapter,
	) {}

	private safePath(profilePath: string): Result<string> {
		const normalized = profilePath.replace(/\\/g, '/');
		if (normalized.includes('..') || normalized.startsWith('/'))
			return fail('PROFILE_PATH_INVALID', `Invalid profile path: ${profilePath}`);
		return ok(`${this.baseDir}/${normalized}`);
	}

	async save(timestamp: string, points: BrewProfilePoint[]): Promise<Result<string>> {
		const safeTimestamp = timestamp.replace(/:/g, '-');
		const relativePath = `brew-profiles/${safeTimestamp}.json`;
		const fullPath = this.safePath(relativePath);
		if (!fullPath.ok) return fullPath;
		await this.adapter.mkdir(`${this.baseDir}/brew-profiles`);
		await this.adapter.write(fullPath.data, JSON.stringify(points));
		return ok(relativePath);
	}

	async load(profilePath: string): Promise<Result<BrewProfilePoint[]>> {
		const fullPath = this.safePath(profilePath);
		if (!fullPath.ok) return fullPath;
		const raw = await this.adapter.read(fullPath.data);
		if (!raw) return ok([]);
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			try {
				await this.adapter.write(`${fullPath.data}.bak`, raw);
			} catch {
				/* best effort */
			}
			return fail('PROFILE_PARSE_FAILED', `Profile ${profilePath} corrupt`);
		}
		if (!Array.isArray(parsed)) return fail('PROFILE_SCHEMA_INVALID', `Profile ${profilePath} is not an array`);
		return ok(
			parsed.filter(
				(p: any) => p && typeof p === 'object' && typeof p.t === 'number' && typeof p.w === 'number',
			) as BrewProfilePoint[],
		);
	}

	async delete(profilePath: string): Promise<Result<void>> {
		const fullPath = this.safePath(profilePath);
		if (!fullPath.ok) return fullPath;
		await this.adapter.remove(fullPath.data);
		return ok(undefined);
	}
}
