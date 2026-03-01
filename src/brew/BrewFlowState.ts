import type { BrewMethod, BrewTemp, EspressoDrink, BeanInfo, RecipeInfo, BrewRecord, BrewFlowStep, BrewFlowSelection, BrewProfilePoint } from './types';

export class BrewFlowState {
	step: BrewFlowStep = 'idle';
	selection: BrewFlowSelection = {};

	startBrew(): void {
		this.step = 'method';
		this.selection = {};
	}

	selectMethod(method: BrewMethod, temp: BrewTemp, drink?: EspressoDrink): void {
		this.selection.method = method;
		this.selection.temp = temp;
		if (method === 'espresso') this.selection.drink = drink;
		this.step = 'bean';
	}

	selectBean(bean: BeanInfo, lastRecord?: BrewRecord): void {
		this.selection.bean = bean;
		this.selection.lastRecord = lastRecord;
		if (lastRecord) {
			this.selection.grindSize = lastRecord.grindSize;
			this.selection.dose = lastRecord.dose;
			if (lastRecord.method === 'filter') {
				this.selection.waterTemp = lastRecord.waterTemp;
				this.selection.filter = lastRecord.filter;
			}
			if (lastRecord.method === 'espresso') {
				this.selection.basket = lastRecord.basket;
			}
		}
		this.step = 'configure';
	}

	deselectBean(): void {
		this.selection.bean = undefined;
		this.selection.lastRecord = undefined;
		this.step = 'bean';
	}

	updateVariables(vars: Partial<BrewFlowSelection>): void {
		Object.assign(this.selection, vars);
	}

	selectRecipe(recipe: RecipeInfo): void {
		this.selection.recipe = recipe;
	}

	startBrewing(): void {
		this.step = 'brewing';
	}

	finishBrewing(time?: number, yieldGrams?: number, profile?: BrewProfilePoint[]): void {
		this.selection.time = time;
		this.selection.yield = yieldGrams;
		this.selection.profile = profile;
		this.step = 'saving';
	}

	goBack(): void {
		const order: BrewFlowStep[] = ['idle', 'method', 'bean', 'configure', 'brewing', 'saving'];
		const idx = order.indexOf(this.step);
		if (idx > 1) this.step = order[idx - 1];
		else if (idx === 1) this.step = 'idle';
	}

	goToStep(step: BrewFlowStep): void {
		const order: BrewFlowStep[] = ['idle', 'method', 'bean', 'configure', 'brewing', 'saving'];
		const targetIdx = order.indexOf(step);
		const currentIdx = order.indexOf(this.step);
		if (targetIdx < currentIdx) this.step = step;
	}

	cancel(): void {
		this.step = 'idle';
		this.selection = {};
	}

	get roastDays(): number | null {
		const bean = this.selection.bean;
		if (!bean?.roastDate) return null;
		const diff = Date.now() - new Date(bean.roastDate).getTime();
		return Math.floor(diff / 86400000);
	}

	buildRecord(drinker: string, note?: string): BrewRecord {
		const s = this.selection;
		const base = {
			id: crypto.randomUUID(),
			timestamp: new Date().toISOString(),
			bean: s.bean!.name,
			roastDate: s.bean!.roastDate ?? '',
			roastDays: this.roastDays,
			temp: s.temp!,
			grindSize: s.grindSize!,
			dose: s.dose!,
			time: s.time,
			yield: s.yield,
			drinker,
			recipe: s.recipe?.name,
			note,
		};

		if (s.method === 'espresso') {
			return { ...base, method: 'espresso', drink: s.drink!, basket: s.basket! };
		}
		return { ...base, method: 'filter', waterTemp: s.waterTemp!, filter: s.filter! };
	}
}
