// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { BeanInfo } from '../../../src/brew/types';
import type { VaultDataService } from '../../../src/services/VaultDataService';
import { BeanManagePanel } from '../../../src/views/dataManage/BeanManagePanel';
import { createContainer, installPolyfills } from '../../helpers/obsidian-dom-polyfill';

vi.mock('../../../src/i18n/index', () => ({ t: (key: string) => key, initI18n: vi.fn() }));

beforeAll(() => installPolyfills());

function bean(name: string, status: BeanInfo['status']): BeanInfo {
	return { path: `${name}.md`, name, roaster: '', status, roastDate: null, weight: null };
}

function vaultData(beans: BeanInfo[]): VaultDataService {
	return {
		getAllBeans: vi.fn(() => beans),
		getDaysSinceRoast: vi.fn(() => null),
	} as unknown as VaultDataService;
}

describe('BeanManagePanel', () => {
	it('renders active and finished bean groups', () => {
		const container = createContainer();
		const panel = new BeanManagePanel({
			app: {} as App,
			vaultData: vaultData([bean('Active', 'active'), bean('Finished', 'finished')]),
			close: vi.fn(),
			openLink: vi.fn(),
		});

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
		const panel = new BeanManagePanel({
			app: {} as App,
			vaultData: vaultData([]),
			close: vi.fn(),
			openLink: vi.fn(),
		});

		panel.render(container);

		expect(container.querySelector('.dm-empty')?.textContent).toBe('bean.emptyState');
		expect(container.querySelector('.dm-card')).toBeNull();
	});
});
