import { describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import { VaultDataService } from './VaultDataService';

function makeFile(path: string): TFile {
	return {
		path,
		basename: path.split('/').pop()!.replace(/\.md$/, ''),
		extension: 'md',
	} as TFile;
}

function makeApp(files: TFile[], frontmatter: Record<string, Record<string, unknown>>): App {
	const create = vi.fn();
	const createFolder = vi.fn();
	const getAbstractFileByPath = vi.fn((path: string) => files.find((file) => file.path === path) ?? null);
	const getMarkdownFiles = vi.fn(() => files);
	const getFileCache = vi.fn((file: TFile) => ({ frontmatter: frontmatter[file.path] }));
	const processFrontMatter = vi.fn(async (file: TFile, fn: (fm: Record<string, unknown>) => void) => {
		fn(frontmatter[file.path]);
	});

	return {
		vault: {
			create,
			createFolder,
			getAbstractFileByPath,
			getMarkdownFiles,
		},
		metadataCache: {
			getFileCache,
		},
		fileManager: {
			processFrontMatter,
		},
	} as unknown as App;
}

describe('VaultDataService', () => {
	it('removes derived roast_days when setting roast date', async () => {
		const file = makeFile('Beans/A.md');
		const frontmatter = {
			[file.path]: { type: 'bean', roast_date: '2026-06-01', roast_days: '10일차' },
		};
		const app = makeApp([file], frontmatter);
		const service = new VaultDataService(app);

		const result = await service.setRoastDate(file.path, '2026-06-11');

		expect(result.ok).toBe(true);
		expect(frontmatter[file.path]).toMatchObject({ type: 'bean', roast_date: '2026-06-11' });
		expect(frontmatter[file.path]).not.toHaveProperty('roast_days');
	});

	it('creates new bean notes without derived roast_days frontmatter', async () => {
		const app = makeApp([], {});
		const service = new VaultDataService(app, 'Beans');

		const result = await service.createBeanNote();

		expect(result.ok).toBe(true);
		expect(app.vault.create).toHaveBeenCalledWith('Beans/New Bean.md', expect.not.stringContaining('roast_days'));
	});

	it('does not rewrite all bean notes for derived roast day refresh', async () => {
		const file = makeFile('Beans/A.md');
		const frontmatter = {
			[file.path]: { type: 'bean', roast_date: '2026-06-01', roast_days: 'old' },
		};
		const app = makeApp([file], frontmatter);
		const service = new VaultDataService(app);

		await service.refreshRoastDays();

		expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
		expect(frontmatter[file.path]).toEqual({ type: 'bean', roast_date: '2026-06-01', roast_days: 'old' });
	});

	it('does not rewrite changed bean notes only to refresh derived roast days', () => {
		const file = makeFile('Beans/A.md');
		const frontmatter = {
			[file.path]: { type: 'bean', roast_date: '2026-06-01', roast_days: 'old' },
		};
		const app = makeApp([file], frontmatter);
		const service = new VaultDataService(app);

		service.onMetadataChanged(file, '', { frontmatter: frontmatter[file.path] });

		expect(app.fileManager.processFrontMatter).not.toHaveBeenCalled();
		expect(frontmatter[file.path]).toEqual({ type: 'bean', roast_date: '2026-06-01', roast_days: 'old' });
	});
});
