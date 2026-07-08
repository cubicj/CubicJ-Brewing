// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { BrewFlowState } from '../../../brew/BrewFlowState';
import { installPolyfills, createContainer } from '../../../test/obsidian-dom-polyfill';
import type CubicJBrewingPlugin from '../../../main';
import type { RecipeInfo } from '../../../brew/types';
import { renderRecipeSelect } from './RecipeField';

vi.mock('../../../i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

beforeAll(() => installPolyfills());

const makeRecipe = (overrides: Partial<RecipeInfo> = {}): RecipeInfo => ({
	path: 'recipes/v60.md',
	name: 'V60 기본',
	method: 'filter',
	dose: '15',
	totalWater: '250',
	temperature: 93,
	steps: [],
	...overrides,
});

function makePlugin(recipes: RecipeInfo[]): CubicJBrewingPlugin {
	return { vaultData: { getAllRecipes: () => recipes } } as unknown as CubicJBrewingPlugin;
}

describe('renderRecipeSelect', () => {
	it('selects a recipe on change', () => {
		const flowState = new BrewFlowState();
		const recipe = makeRecipe();
		const container = createContainer();
		renderRecipeSelect(container, makePlugin([recipe]), flowState);

		const select = container.querySelector('select')!;
		select.value = recipe.path;
		select.dispatchEvent(new Event('change'));

		expect(flowState.selection.recipe?.name).toBe('V60 기본');
	});

	it('clears the selected recipe when "no recipe" is chosen', () => {
		const flowState = new BrewFlowState();
		const recipe = makeRecipe();
		const container = createContainer();
		renderRecipeSelect(container, makePlugin([recipe]), flowState);

		const select = container.querySelector('select')!;
		select.value = recipe.path;
		select.dispatchEvent(new Event('change'));
		select.value = '';
		select.dispatchEvent(new Event('change'));

		expect(flowState.selection.recipe).toBeUndefined();
	});

	it('renders nothing when no recipes exist', () => {
		const flowState = new BrewFlowState();
		const container = createContainer();
		renderRecipeSelect(container, makePlugin([]), flowState);

		expect(container.querySelector('select')).toBeNull();
	});
});
