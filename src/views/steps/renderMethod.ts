import type { BrewMethod, BrewTemp, EspressoDrink } from '../../brew/types';
import { getDrinkLabel, getMethodLabel, getTempLabel } from '../../brew/constants';
import { t } from '../../i18n/index';
import { createToggleGroup } from '../FormHelpers';
import type { StepRenderContext } from '../StepRenderers';

export function renderMethod(container: HTMLElement, ctx: StepRenderContext): void {
	container.addClass('brew-flow-method');

	const sel = ctx.flowState.selection;
	const isLocked = ctx.flowState.step === 'brewing' || ctx.flowState.step === 'saving';
	let selectedMethod: BrewMethod | null = sel.method ?? null;
	let selectedTemp: BrewTemp | null = sel.temp ?? null;
	let selectedDrink: EspressoDrink | null = sel.drink ?? null;

	const syncSelection = () => {
		sel.method = selectedMethod ?? undefined;
		sel.temp = selectedTemp ?? undefined;
		sel.drink = selectedDrink ?? undefined;
	};

	const restoreToggleGroup = <T extends string>(
		buttons: HTMLElement[],
		items: { value: T; label: string }[],
		selected: T | null,
	) => {
		buttons.forEach((btn, index) => {
			if (items[index]?.value === selected) btn.addClass('is-active');
			else btn.removeClass('is-active');
		});
	};

	const methodItems = [
		{ value: 'filter' as BrewMethod, label: getMethodLabel('filter') },
		{ value: 'espresso' as BrewMethod, label: getMethodLabel('espresso') },
	];
	const methodButtons = createToggleGroup(container, methodItems, selectedMethod, (val) => {
		if (isLocked) {
			restoreToggleGroup(methodButtons, methodItems, selectedMethod);
			return;
		}
		selectedMethod = val;
		const show = selectedMethod === 'espresso';
		if (!show) selectedDrink = null;
		ctx.accordion.animateContentChange('method', () => {
			drinkRow.style.display = show ? '' : 'none';
		});
		syncSelection();
		tryAdvance();
	});

	container.createEl('h4', { text: t('form.temperature') });
	const tempItems = [
		{ value: 'hot' as BrewTemp, label: getTempLabel('hot') },
		{ value: 'iced' as BrewTemp, label: getTempLabel('iced') },
	];
	const tempButtons = createToggleGroup(container, tempItems, selectedTemp, (val) => {
		if (isLocked) {
			restoreToggleGroup(tempButtons, tempItems, selectedTemp);
			return;
		}
		selectedTemp = val;
		syncSelection();
		tryAdvance();
	});

	const drinkRow = container.createDiv({ cls: 'brew-flow-drink-row' });
	drinkRow.style.display = selectedMethod === 'espresso' ? '' : 'none';
	drinkRow.createEl('h4', { text: t('form.drink') });
	const drinkItems = [
		{ value: 'shot' as EspressoDrink, label: getDrinkLabel('shot') },
		{ value: 'americano' as EspressoDrink, label: getDrinkLabel('americano') },
		{ value: 'latte' as EspressoDrink, label: getDrinkLabel('latte') },
	];
	const drinkButtons = createToggleGroup(drinkRow, drinkItems, selectedDrink, (val) => {
		if (isLocked) {
			restoreToggleGroup(drinkButtons, drinkItems, selectedDrink);
			return;
		}
		selectedDrink = val;
		syncSelection();
		tryAdvance();
	});

	const tryAdvance = () => {
		const complete = !!selectedMethod && !!selectedTemp && (selectedMethod !== 'espresso' || !!selectedDrink);
		if (complete) {
			ctx.flowState.selectMethod(selectedMethod!, selectedTemp!, selectedDrink ?? undefined);
			const bean = ctx.flowState.selection.bean;
			if (bean) {
				ctx.flowState.selectBean(bean);
			}
			ctx.renderContent();
		} else if (ctx.flowState.step !== 'method') {
			ctx.flowState.goToStep('method');
			ctx.accordion.update();
		}
	};
}
