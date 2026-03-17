import type { App, CachedMetadata, TFile } from 'obsidian';
import type { BeanInfo, RecipeInfo, RecipeStep } from '../brew/types';
import { calcRoastDays } from '../brew/constants';
import { t } from '../i18n/index';
import { type Result, ok, fail } from '../types/result';

const LEGACY_KEY_MAP: Record<string, string> = {
	로스터: 'roaster',
	상태: 'status',
	'로스팅 날짜': 'roast_date',
	'로스팅 경과': 'roast_days',
	무게: 'weight',
	방식: 'method',
	도징량: 'dose',
	총물량: 'total_water',
	온도: 'temperature',
	단계: 'steps',
};

export class VaultDataService {
	constructor(
		private app: App,
		private beanFolder = '',
	) {}

	getActiveBeans(): BeanInfo[] {
		return this.getAllBeans().filter((b) => b.status === 'active');
	}

	getAllBeans(): BeanInfo[] {
		return this.app.vault
			.getMarkdownFiles()
			.map((file) => this.parseBeanNote(file))
			.filter((b): b is BeanInfo => b !== null);
	}

	async setRoastDate(path: string, date: string): Promise<Result<void>> {
		const file = this.getTFile(path);
		if (!file) return fail('VAULT_FILE_NOT_FOUND', `File not found: ${path}`);
		try {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				fm['roast_date'] = date;
				fm['roast_days'] = calcRoastDays(date || null);
			});
			return ok(undefined);
		} catch {
			return fail('VAULT_OPERATION_FAILED', `Failed to set roast date for ${path}`);
		}
	}

	async setWeight(path: string, weight: number | null): Promise<Result<void>> {
		const file = this.getTFile(path);
		if (!file) return fail('VAULT_FILE_NOT_FOUND', `File not found: ${path}`);
		try {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				fm['weight'] = weight;
			});
			return ok(undefined);
		} catch {
			return fail('VAULT_OPERATION_FAILED', `Failed to set weight for ${path}`);
		}
	}

	async setBeanStatus(path: string, status: 'active' | 'finished'): Promise<Result<void>> {
		const file = this.getTFile(path);
		if (!file) return fail('VAULT_FILE_NOT_FOUND', `File not found: ${path}`);
		try {
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				fm['status'] = status;
			});
			return ok(undefined);
		} catch {
			return fail('VAULT_OPERATION_FAILED', `Failed to set bean status for ${path}`);
		}
	}

	getAllRecipes(): RecipeInfo[] {
		return this.app.vault
			.getMarkdownFiles()
			.map((file) => this.parseRecipeNote(file))
			.filter((r): r is RecipeInfo => r !== null);
	}

	private parseBeanNote(file: TFile): BeanInfo | null {
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		if (fm?.type !== 'bean') return null;
		const rawDate = fm['roast_date'];
		const raw = Array.isArray(rawDate) ? rawDate[rawDate.length - 1] : rawDate;
		const roastDate = raw ? String(raw) : null;
		return {
			path: file.path,
			name: file.basename,
			roaster: fm['roaster'] ?? '',
			status: fm['status'] ?? 'active',
			roastDate,
			weight: typeof fm['weight'] === 'number' ? fm['weight'] : null,
		};
	}

	private parseRecipeNote(file: TFile): RecipeInfo | null {
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		if (fm?.type !== 'recipe') return null;
		const steps: RecipeStep[] = (fm['steps'] ?? []).map((s: Record<string, unknown>) => ({
			time: String(s.time ?? ''),
			target: s.target != null ? Number(s.target) : undefined,
			note: s.note as string | undefined,
		}));
		return {
			path: file.path,
			name: file.basename,
			method: fm['method'] ?? '',
			dose: fm['dose'] ?? '',
			totalWater: fm['total_water'] ?? '',
			temperature: Number(fm['temperature'] ?? 0),
			steps,
		};
	}

	async createBeanNote(extraContent?: string): Promise<Result<string>> {
		const folder = this.beanFolder;
		const toPath = (n: string) => (folder ? `${folder}/${n}.md` : `${n}.md`);
		const defaultName = t('bean.defaultName');
		let name = defaultName;
		let path = toPath(name);
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(path)) {
			counter++;
			name = `${defaultName} ${counter}`;
			path = toPath(name);
		}
		try {
			if (folder) {
				const folderExists = this.app.vault.getAbstractFileByPath(folder);
				if (!folderExists) await this.app.vault.createFolder(folder);
			}
			const parts = [
				'---',
				'type: bean',
				'roaster:',
				'status: active',
				'roast_date:',
				'roast_days:',
				'weight:',
				'---',
				'',
			];
			if (extraContent) parts.push(extraContent, '');
			await this.app.vault.create(path, parts.join('\n'));
			return ok(path);
		} catch {
			return fail('VAULT_OPERATION_FAILED', `Failed to create bean note: ${name}`);
		}
	}

	getDaysSinceRoast(bean: BeanInfo): number | null {
		return calcRoastDays(bean.roastDate);
	}

	async refreshRoastDays(): Promise<void> {
		const beans = this.getAllBeans();
		await Promise.all(
			beans.map(async (bean) => {
				const days = this.getDaysSinceRoast(bean);
				const file = this.getTFile(bean.path);
				if (!file) return;
				const cache = this.app.metadataCache.getFileCache(file);
				if (cache?.frontmatter?.['roast_days'] === days) return;
				try {
					await this.app.fileManager.processFrontMatter(file, (fm) => {
						fm['roast_days'] = days;
					});
				} catch (e) {
					console.error(`[VaultDataService] refreshRoastDays failed for ${bean.path}:`, e);
				}
			}),
		);
	}

	onMetadataChanged(file: TFile, _data: string, cache: CachedMetadata): void {
		const fm = cache.frontmatter;
		if (fm?.type !== 'bean') return;
		const rawDate = fm['roast_date'];
		const raw = Array.isArray(rawDate) ? rawDate[rawDate.length - 1] : rawDate;
		const roastDate = raw ? String(raw) : null;
		const expected = calcRoastDays(roastDate);
		if (fm['roast_days'] === expected) return;
		this.app.fileManager.processFrontMatter(file, (fmEdit) => {
			fmEdit['roast_days'] = expected;
		});
	}

	async migrateFrontmatterKeys(): Promise<string[]> {
		const files = this.app.vault.getMarkdownFiles();
		const failures: string[] = [];
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter;
			if (!fm || (fm.type !== 'bean' && fm.type !== 'recipe')) continue;
			const hasLegacy = Object.keys(fm).some((k) => k in LEGACY_KEY_MAP);
			if (!hasLegacy) continue;
			try {
				await this.app.fileManager.processFrontMatter(file, (fmEdit) => {
					for (const [oldKey, newKey] of Object.entries(LEGACY_KEY_MAP)) {
						if (!(oldKey in fmEdit)) continue;
						let value = fmEdit[oldKey];
						if (oldKey === '로스팅 경과' && typeof value === 'string') {
							const match = value.match(/^(\d+)일차$/);
							value = match ? Number(match[1]) : null;
						}
						fmEdit[newKey] = value;
						delete fmEdit[oldKey];
					}
				});
			} catch {
				failures.push(file.path);
			}
		}
		return failures;
	}

	private getTFile(path: string): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file && 'extension' in file ? (file as TFile) : null;
	}
}
