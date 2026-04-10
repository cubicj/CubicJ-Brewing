import { t } from '../../i18n/index';
import type { StepRenderContext } from '../StepRenderers';

export function renderBean(container: HTMLElement, ctx: StepRenderContext): void {
	container.addClass('brew-flow-bean');

	const beans = [...ctx.plugin.vaultData.getActiveBeans()].sort((a, b) => a.name.localeCompare(b.name));

	if (beans.length === 0) {
		container.createDiv({ cls: 'brew-flow-empty', text: t('bean.emptyState') });
		return;
	}

	const selectedBean = ctx.flowState.selection.bean;

	for (const bean of beans) {
		const isSelected = selectedBean?.name === bean.name;
		const item = container.createDiv({ cls: `brew-flow-bean-item${isSelected ? ' is-selected' : ''}` });
		item.createDiv({ text: bean.name });

		const days = ctx.plugin.vaultData.getDaysSinceRoast(bean);
		if (days !== null || bean.weight != null) {
			const parts: string[] = [];
			if (days !== null) parts.push(`${t('modal.roasting')} ${t('bean.roastDays', { n: days })}`);
			if (bean.weight != null) parts.push(t('bean.remaining', { weight: bean.weight }));
			item.createDiv({ cls: 'brew-flow-bean-meta', text: parts.join(' · ') });
		}

		item.addEventListener('click', () => {
			if (isSelected) {
				ctx.flowState.deselectBean();
				ctx.accordion.update();
			} else {
				ctx.flowState.selectBean(bean);
				ctx.renderContent();
			}
		});
	}
}
