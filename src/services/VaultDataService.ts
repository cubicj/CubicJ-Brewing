import type { App, TFile } from 'obsidian';
import type { BeanInfo, RecipeInfo, RecipeStep } from '../brew/types';

export class VaultDataService {
	constructor(private app: App) {}

	getActiveBeans(): BeanInfo[] {
		return this.getAllBeans().filter(b => b.status === 'active');
	}

	getAllBeans(): BeanInfo[] {
		return this.app.vault.getMarkdownFiles()
			.map(file => this.parseBeanNote(file))
			.filter((b): b is BeanInfo => b !== null);
	}

	async setRoastDate(path: string, date: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !('extension' in file)) return;
		await this.app.fileManager.processFrontMatter(file as TFile, (fm) => {
			fm.roast_date = date;
		});
	}

	async setBeanStatus(path: string, status: 'active' | 'finished'): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !('extension' in file)) return;
		await this.app.fileManager.processFrontMatter(file as TFile, (fm) => {
			fm.status = status;
		});
	}

	getAllRecipes(): RecipeInfo[] {
		return this.app.vault.getMarkdownFiles()
			.map(file => this.parseRecipeNote(file))
			.filter((r): r is RecipeInfo => r !== null);
	}

	private parseBeanNote(file: TFile): BeanInfo | null {
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		if (fm?.type !== 'bean') return null;
		const raw = Array.isArray(fm.roast_date) ? fm.roast_date[fm.roast_date.length - 1] : fm.roast_date;
		const roastDate = raw ? String(raw) : null;
		return {
			path: file.path,
			name: file.basename,
			roaster: fm.roaster ?? '',
			status: fm.status ?? 'active',
			roastDate,
		};
	}

	private parseRecipeNote(file: TFile): RecipeInfo | null {
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		if (fm?.type !== 'recipe') return null;
		const steps: RecipeStep[] = (fm.steps ?? []).map((s: Record<string, unknown>) => ({
			time: String(s.time ?? ''),
			target: s.target != null ? Number(s.target) : undefined,
			note: s.note as string | undefined,
		}));
		return {
			path: file.path,
			name: file.basename,
			method: fm.method ?? '',
			dose: fm.dose ?? '',
			totalWater: fm.total_water ?? '',
			temperature: Number(fm.temperature ?? 0),
			steps,
		};
	}

	getDaysSinceRoast(bean: BeanInfo): number | null {
		if (!bean.roastDate) return null;
		const diff = Date.now() - new Date(bean.roastDate).getTime();
		return Math.floor(diff / 86400000);
	}
}
