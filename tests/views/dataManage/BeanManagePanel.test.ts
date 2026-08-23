// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { BeanInfo } from '../../../src/brew/types';
import type { VaultDataService } from '../../../src/services/VaultDataService';
import { BeanManagePanel, type BeanManagePanelDeps } from '../../../src/views/dataManage/BeanManagePanel';
import { createContainer, installPolyfills } from '../../helpers/obsidian-dom-polyfill';

vi.mock('../../../src/i18n/index', () => ({ t: (key: string) => key, initI18n: vi.fn() }));

beforeAll(() => installPolyfills());
afterEach(() => {
	vi.restoreAllMocks();
	document.body.innerHTML = '';
});

function bean(name: string, status: BeanInfo['status']): BeanInfo {
	return { path: `${name}.md`, name, roaster: '', status, roastDate: null, weight: 120 };
}

function vaultData(beans: BeanInfo[]): VaultDataService {
	return {
		getAllBeans: vi.fn(() => beans),
		getDaysSinceRoast: vi.fn(() => null),
		setWeight: vi.fn(async () => ({ ok: true, data: undefined })),
		setBeanStatus: vi.fn(async () => ({ ok: true, data: undefined })),
	} as unknown as VaultDataService;
}

function appWithFiles(paths: string[]): App {
	return {
		vault: { getFileByPath: (path: string) => (paths.includes(path) ? { path, extension: 'md' } : null) },
	} as unknown as App;
}

function makeDeps(overrides: Partial<BeanManagePanelDeps> = {}): BeanManagePanelDeps {
	return {
		app: appWithFiles([]),
		vaultData: vaultData([]),
		close: vi.fn(),
		openLink: vi.fn(),
		getHubNotePath: () => '',
		getScaleWeight: () => null,
		refreshCodeBlocks: vi.fn(),
		...overrides,
	};
}

describe('BeanManagePanel', () => {
	it('renders active and finished bean groups', () => {
		const container = createContainer();
		const panel = new BeanManagePanel(
			makeDeps({ vaultData: vaultData([bean('Active', 'active'), bean('Finished', 'finished')]) }),
		);

		panel.render(container);

		expect(Array.from(container.querySelectorAll('.dm-card-title')).map((el) => el.textContent)).toEqual([
			'bean.activeBeans',
			'bean.pastBeans',
		]);
		expect(Array.from(container.querySelectorAll('.cb-bean-name')).map((el) => el.textContent)).toEqual([
			'Active',
			'Finished',
		]);
		expect(container.querySelector('.dm-empty')).toBeNull();
	});

	it('renders the empty state when no beans exist', () => {
		const container = createContainer();
		const panel = new BeanManagePanel(makeDeps({ vaultData: vaultData([]) }));

		panel.render(container);

		expect(container.querySelector('.dm-empty')?.textContent).toBe('bean.emptyState');
		expect(container.querySelector('.dm-card')).toBeNull();
	});

	it('renders the hub button when the configured note exists and opens it', () => {
		const container = createContainer();
		const deps = makeDeps({ app: appWithFiles(['Coffee/Beans.md']), getHubNotePath: () => 'Coffee/Beans.md' });
		new BeanManagePanel(deps).render(container);

		const btn = container.querySelector<HTMLButtonElement>('.cb-bean-hub-btn');
		expect(btn?.textContent).toBe('bean.openHub');

		btn!.click();

		expect(deps.close).toHaveBeenCalledTimes(1);
		expect(deps.openLink).toHaveBeenCalledWith('Coffee/Beans.md');
	});

	it('hides the hub button when the path is empty or the note is missing', () => {
		const empty = createContainer();
		new BeanManagePanel(makeDeps({ app: appWithFiles(['Coffee/Beans.md']), getHubNotePath: () => '' })).render(empty);
		expect(empty.querySelector('.cb-bean-hub-btn')).toBeNull();

		const missing = createContainer();
		new BeanManagePanel(makeDeps({ app: appWithFiles([]), getHubNotePath: () => 'Coffee/Beans.md' })).render(missing);
		expect(missing.querySelector('.cb-bean-hub-btn')).toBeNull();
	});

	it('opens the weight popover in modal mode when the weight is clicked', () => {
		const container = createContainer();
		document.body.appendChild(container);
		const panel = new BeanManagePanel(makeDeps({ vaultData: vaultData([bean('Active', 'active')]) }));
		panel.render(container);

		container.querySelector<HTMLElement>('.cb-bean-weight')!.click();

		const popover = document.querySelector('.bean-weight-popover');
		expect(popover).not.toBeNull();
		expect(popover!.classList.contains('is-in-modal')).toBe(true);
		panel.dispose();
	});

	it('dispose removes an open weight popover and its document listener', async () => {
		const container = createContainer();
		document.body.appendChild(container);
		const panel = new BeanManagePanel(makeDeps({ vaultData: vaultData([bean('Active', 'active')]) }));
		const addListener = vi.spyOn(document, 'addEventListener');
		const removeListener = vi.spyOn(document, 'removeEventListener');
		panel.render(container);
		container.querySelector<HTMLElement>('.cb-bean-weight')!.click();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(addListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));

		panel.dispose();

		expect(document.querySelector('.bean-weight-popover')).toBeNull();
		expect(removeListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
	});

	it('render closes an open weight popover', () => {
		const container = createContainer();
		document.body.appendChild(container);
		const panel = new BeanManagePanel(makeDeps({ vaultData: vaultData([bean('Active', 'active')]) }));
		panel.render(container);
		container.querySelector<HTMLElement>('.cb-bean-weight')!.click();

		panel.render(container);

		expect(document.querySelector('.bean-weight-popover')).toBeNull();
	});

	it('forwards the scale weight getter to the popover', () => {
		const container = createContainer();
		document.body.appendChild(container);
		const withScale = new BeanManagePanel(
			makeDeps({ vaultData: vaultData([bean('Active', 'active')]), getScaleWeight: () => 18.4 }),
		);
		withScale.render(container);
		container.querySelector<HTMLElement>('.cb-bean-weight')!.click();

		expect(document.querySelector('.bean-weight-popover .bwp-auto')).not.toBeNull();

		withScale.dispose();
		const withoutScale = new BeanManagePanel(
			makeDeps({ vaultData: vaultData([bean('Active', 'active')]), getScaleWeight: () => null }),
		);
		withoutScale.render(container);
		container.querySelector<HTMLElement>('.cb-bean-weight')!.click();

		expect(document.querySelector('.bean-weight-popover .bwp-auto')).toBeNull();
		withoutScale.dispose();
	});

	it('re-renders and refreshes code blocks after a weight save', async () => {
		const container = createContainer();
		document.body.appendChild(container);
		const deps = makeDeps({ vaultData: vaultData([bean('Active', 'active')]) });
		const panel = new BeanManagePanel(deps);
		panel.render(container);
		container.querySelector<HTMLElement>('.cb-bean-weight')!.click();

		const popover = document.querySelector<HTMLElement>('.bean-weight-popover')!;
		popover.querySelector<HTMLInputElement>('.bwp-input')!.value = '80';
		Array.from(popover.querySelectorAll<HTMLButtonElement>('.bwp-action'))
			.find((el) => el.textContent === 'bean.settings')!
			.click();
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(deps.refreshCodeBlocks).toHaveBeenCalledTimes(1);
		expect(container.querySelector('.cb-bean-weight-value')?.textContent).toBe('80g');
		panel.dispose();
	});
});
