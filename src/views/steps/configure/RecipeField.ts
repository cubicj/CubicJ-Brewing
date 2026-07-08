import type { BrewFlowState } from '../../../brew/BrewFlowState';
import { t } from '../../../i18n/index';
import type CubicJBrewingPlugin from '../../../main';

export function renderRecipeSelect(
	container: HTMLElement,
	plugin: CubicJBrewingPlugin,
	flowState: BrewFlowState,
): void {
	const recipes = plugin.vaultData.getAllRecipes();
	if (recipes.length === 0) return;

	const recipeGroup = container.createDiv({ cls: 'brew-flow-recipe-select' });
	recipeGroup.createEl('label', { text: t('brew.recipe') });
	const recipeSelect = recipeGroup.createEl('select');
	recipeSelect.createEl('option', { text: t('brew.noRecipe'), value: '' });
	for (const recipe of recipes) {
		recipeSelect.createEl('option', { text: recipe.name, value: recipe.path });
	}
	recipeSelect.addEventListener('change', () => {
		const recipe = recipes.find((r) => r.path === recipeSelect.value);
		if (recipe) flowState.selectRecipe(recipe);
		else flowState.clearRecipe();
	});
}
