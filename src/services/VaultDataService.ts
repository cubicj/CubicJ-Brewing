import { type App, TFile } from 'obsidian';
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

function isUnknownArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}

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
			await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
				fm['roast_date'] = date;
				delete fm['roast_days'];
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
			await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
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
			await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
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
		const fm = cache?.frontmatter as Record<string, unknown> | undefined;
		if (fm?.type !== 'bean') return null;
		const rawDate = fm['roast_date'];
		const raw = isUnknownArray(rawDate) ? rawDate[rawDate.length - 1] : rawDate;
		const roastDate = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : null;
		return {
			path: file.path,
			name: file.basename,
			roaster: (fm['roaster'] ?? '') as string,
			status: (fm['status'] ?? 'active') as BeanInfo['status'],
			roastDate,
			weight: typeof fm['weight'] === 'number' ? fm['weight'] : null,
		};
	}

	private parseRecipeNote(file: TFile): RecipeInfo | null {
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter as Record<string, unknown> | undefined;
		if (fm?.type !== 'recipe') return null;
		const steps: RecipeStep[] = ((fm['steps'] ?? []) as Record<string, unknown>[]).map((step) => ({
			time: typeof step.time === 'string' || typeof step.time === 'number' ? String(step.time) : '',
			target: step.target != null ? Number(step.target) : undefined,
			note: step.note as string | undefined,
		}));
		return {
			path: file.path,
			name: file.basename,
			method: (fm['method'] ?? '') as string,
			dose: (fm['dose'] ?? '') as string,
			totalWater: (fm['total_water'] ?? '') as string,
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
			const parts = ['---', 'type: bean', 'roaster:', 'status: active', 'roast_date:', 'weight:', '---', ''];
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

	async migrateFrontmatterKeys(): Promise<string[]> {
		const files = this.app.vault.getMarkdownFiles();
		const failures: string[] = [];
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fm = cache?.frontmatter as Record<string, unknown> | undefined;
			if (!fm || (fm.type !== 'bean' && fm.type !== 'recipe')) continue;
			const hasLegacy = Object.keys(fm).some((k) => k in LEGACY_KEY_MAP);
			if (!hasLegacy) continue;
			try {
				await this.app.fileManager.processFrontMatter(file, (fmEdit: Record<string, unknown>) => {
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
		return file instanceof TFile ? file : null;
	}
}
