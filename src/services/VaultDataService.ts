import type { App, CachedMetadata, TFile } from 'obsidian';
import type { BeanInfo, RecipeInfo, RecipeStep } from '../brew/types';
import { MS_PER_DAY } from '../brew/constants';

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

	async setRoastDate(path: string, date: string): Promise<void> {
		const file = this.getTFile(path);
		if (!file) return;
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm['로스팅 날짜'] = date;
			if (date) {
				const diff = Date.now() - new Date(date).getTime();
				fm['로스팅 경과'] = `${Math.floor(diff / MS_PER_DAY)}일차`;
			} else {
				fm['로스팅 경과'] = null;
			}
		});
	}

	async setWeight(path: string, weight: number | null): Promise<void> {
		const file = this.getTFile(path);
		if (!file) return;
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm['무게'] = weight;
		});
	}

	async setBeanStatus(path: string, status: 'active' | 'finished'): Promise<void> {
		const file = this.getTFile(path);
		if (!file) return;
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm['상태'] = status;
		});
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
		const rawDate = fm['로스팅 날짜'];
		const raw = Array.isArray(rawDate) ? rawDate[rawDate.length - 1] : rawDate;
		const roastDate = raw ? String(raw) : null;
		return {
			path: file.path,
			name: file.basename,
			roaster: fm['로스터'] ?? '',
			status: fm['상태'] ?? 'active',
			roastDate,
			weight: typeof fm['무게'] === 'number' ? fm['무게'] : null,
		};
	}

	private parseRecipeNote(file: TFile): RecipeInfo | null {
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		if (fm?.type !== 'recipe') return null;
		const steps: RecipeStep[] = (fm['단계'] ?? []).map((s: Record<string, unknown>) => ({
			time: String(s.time ?? ''),
			target: s.target != null ? Number(s.target) : undefined,
			note: s.note as string | undefined,
		}));
		return {
			path: file.path,
			name: file.basename,
			method: fm['방식'] ?? '',
			dose: fm['도징량'] ?? '',
			totalWater: fm['총물량'] ?? '',
			temperature: Number(fm['온도'] ?? 0),
			steps,
		};
	}

	async createBeanNote(extraContent?: string): Promise<string> {
		const folder = this.beanFolder;
		const toPath = (n: string) => (folder ? `${folder}/${n}.md` : `${n}.md`);
		let name = '새 원두';
		let path = toPath(name);
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(path)) {
			counter++;
			name = `새 원두 ${counter}`;
			path = toPath(name);
		}
		if (folder) {
			const folderExists = this.app.vault.getAbstractFileByPath(folder);
			if (!folderExists) await this.app.vault.createFolder(folder);
		}
		const parts = ['---', 'type: bean', '로스터:', '상태: active', '로스팅 날짜:', '로스팅 경과:', '무게:', '---', ''];
		if (extraContent) parts.push(extraContent, '');
		await this.app.vault.create(path, parts.join('\n'));
		return path;
	}

	getDaysSinceRoast(bean: BeanInfo): number | null {
		if (!bean.roastDate) return null;
		const diff = Date.now() - new Date(bean.roastDate).getTime();
		return Math.floor(diff / MS_PER_DAY);
	}

	async refreshRoastDays(): Promise<void> {
		const beans = this.getAllBeans();
		await Promise.all(
			beans.map(async (bean) => {
				const days = this.getDaysSinceRoast(bean);
				const file = this.getTFile(bean.path);
				if (!file) return;
				try {
					await this.app.fileManager.processFrontMatter(file, (fm) => {
						fm['로스팅 경과'] = days !== null ? `${days}일차` : null;
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
		const rawDate = fm['로스팅 날짜'];
		const raw = Array.isArray(rawDate) ? rawDate[rawDate.length - 1] : rawDate;
		const roastDate = raw ? String(raw) : null;
		const expected = roastDate ? `${Math.floor((Date.now() - new Date(roastDate).getTime()) / MS_PER_DAY)}일차` : null;
		if (fm['로스팅 경과'] === expected) return;
		this.app.fileManager.processFrontMatter(file, (fmEdit) => {
			fmEdit['로스팅 경과'] = expected;
		});
	}

	private getTFile(path: string): TFile | null {
		const file = this.app.vault.getAbstractFileByPath(path);
		return file && 'extension' in file ? (file as TFile) : null;
	}
}
