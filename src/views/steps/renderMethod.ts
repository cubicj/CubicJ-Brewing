import type { BrewMethod, BrewTemp, EspressoDrink } from '../../brew/types';
import { getDrinkLabel, getMethodLabel, getTempLabel } from '../../brew/constants';
import { Notice } from 'obsidian';
import { t } from '../../i18n/index';
import { createToggleGroup } from '../FormHelpers';
import type { StepRenderContext } from '../StepRenderers';

export function renderMethod(container: HTMLElement, ctx: StepRenderContext): void {
	container.addClass('brew-flow-method');

	const sel = ctx.flowState.selection;
	let selectedMethod: BrewMethod | null = sel.method ?? null;
	let selectedTemp: BrewTemp | null = sel.temp ?? null;
	let selectedDrink: EspressoDrink | null = sel.drink ?? null;

	const syncSelection = () => {
		sel.method = selectedMethod ?? undefined;
		sel.temp = selectedTemp ?? undefined;
		sel.drink = selectedDrink ?? undefined;
	};

	createToggleGroup(
		container,
		[
			{ value: 'filter' as BrewMethod, label: getMethodLabel('filter') },
			{ value: 'espresso' as BrewMethod, label: getMethodLabel('espresso') },
		],
		selectedMethod,
		(val) => {
			selectedMethod = val;
			const show = selectedMethod === 'espresso';
			if (!show) selectedDrink = null;
			ctx.accordion.animateContentChange('method', () => {
				drinkRow.style.display = show ? '' : 'none';
			});
			syncSelection();
			tryAdvance();
		},
	);

	container.createEl('h4', { text: t('form.temperature') });
	createToggleGroup(
		container,
		[
			{ value: 'hot' as BrewTemp, label: getTempLabel('hot') },
			{ value: 'iced' as BrewTemp, label: getTempLabel('iced') },
		],
		selectedTemp,
		(val) => {
			selectedTemp = val;
			syncSelection();
			tryAdvance();
		},
	);

	const drinkRow = container.createDiv({ cls: 'brew-flow-drink-row' });
	drinkRow.style.display = selectedMethod === 'espresso' ? '' : 'none';
	drinkRow.createEl('h4', { text: t('form.drink') });
	createToggleGroup(
		drinkRow,
		[
			{ value: 'shot' as EspressoDrink, label: getDrinkLabel('shot') },
			{ value: 'americano' as EspressoDrink, label: getDrinkLabel('americano') },
			{ value: 'latte' as EspressoDrink, label: getDrinkLabel('latte') },
		],
		selectedDrink,
		(val) => {
			selectedDrink = val;
			syncSelection();
			tryAdvance();
		},
	);

	const tryAdvance = async () => {
		try {
			const complete = !!selectedMethod && !!selectedTemp && (selectedMethod !== 'espresso' || !!selectedDrink);
			if (complete) {
				ctx.flowState.selectMethod(selectedMethod!, selectedTemp!, selectedDrink ?? undefined);
				const bean = ctx.flowState.selection.bean;
				if (bean) {
					const lastResult = await ctx.plugin.recordService.getLastRecord(bean.name, selectedMethod!, selectedTemp!);
					const lastRecord = lastResult.ok ? lastResult.data : undefined;
					ctx.flowState.selectBean(bean, lastRecord);
				}
				ctx.renderContent();
			} else if (ctx.flowState.step !== 'method') {
				ctx.flowState.goToStep('method');
				ctx.accordion.update();
			}
		} catch (e) {
			console.error('[CubicJ Brewing] tryAdvance failed:', e);
			new Notice(t('brew.unexpectedError'));
		}
	};
}
