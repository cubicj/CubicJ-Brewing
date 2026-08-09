import { Notice, type App } from 'obsidian';
import type { BrewRecord } from '../brew/types';
import type { BeanWeightService } from '../services/BeanWeightService';
import type { BrewProfileStorage } from '../services/BrewProfileStorage';
import type { BrewRecordService } from '../services/BrewRecordService';
import { t } from '../i18n/index';
import { ConfirmModal } from './ConfirmModal';

export interface DeleteBrewRecordFlowDeps {
	app: App;
	recordService: BrewRecordService;
	profileStorage: BrewProfileStorage;
	vaultData?: BeanWeightService;
}

export function deleteBrewRecordFlow(
	deps: DeleteBrewRecordFlowDeps,
	record: BrewRecord,
	onDeleted: () => void,
): void {
	const bean = deps.vaultData?.getAllBeans().find((b) => b.name === record.bean);
	const canRestore = bean != null && bean.weight != null && record.dose > 0;
	const checkbox = canRestore
		? { label: t('form.restoreWeight', { dose: record.dose, bean: record.bean }), checked: true }
		: undefined;
	const modal = new ConfirmModal(
		deps.app,
		t('form.deleteConfirm'),
		async (restoreWeight) => {
			const delResult = await deps.recordService.removeWithProfile(
				record.id,
				record.profilePath,
				deps.profileStorage,
			);
			if (delResult.ok) {
				if (restoreWeight && canRestore) {
					const newWeight = Math.round((bean.weight! + record.dose) * 10) / 10;
					await deps.vaultData!.setWeight(bean.path, newWeight);
				}
				onDeleted();
			} else {
				console.error(`[deleteBrewRecord] delete failed: [${delResult.error.code}] ${delResult.error.message}`);
				new Notice(t('error.recordDelete'));
			}
		},
		checkbox,
	);
	modal.open();
}
