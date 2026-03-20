import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { VaultDataService } from '../services/VaultDataService';
import type { BeanInfo } from '../brew/types';
import { BEAN_NOTE_EXTRA } from '../brew/constants';
import { t } from '../i18n/index';

export async function createNewBean(app: App, vaultData: VaultDataService): Promise<boolean> {
	try {
		const result = await vaultData.createBeanNote(BEAN_NOTE_EXTRA);
		if (!result.ok) throw new Error(result.error.message);
		await app.workspace.openLinkText(result.data, '');
		return true;
	} catch (err) {
		console.error('[beanHelpers] createNewBean failed:', err);
		new Notice(t('error.beanCreate'));
		return false;
	}
}

export function getSortedBeans(vaultData: VaultDataService): { active: BeanInfo[]; finished: BeanInfo[] } {
	const beans = vaultData.getAllBeans();
	return {
		active: beans.filter((b) => b.status === 'active').sort((a, b) => a.name.localeCompare(b.name)),
		finished: beans.filter((b) => b.status === 'finished').sort((a, b) => a.name.localeCompare(b.name)),
	};
}
