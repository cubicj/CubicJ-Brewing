import type { BrewMethod, BrewTemp, EspressoDrink, BeanInfo, RecipeInfo, BrewRecord, BrewFlowStep, BrewFlowSelection } from './types';

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

	private clearEquipment(): void {
		this.selection.lastRecord = undefined;
		this.selection.grindSize = undefined;
		this.selection.dose = undefined;
		this.selection.waterTemp = undefined;
		this.selection.filter = undefined;
		this.selection.dripper = undefined;
		this.selection.grinder = undefined;
		this.selection.basket = undefined;
		this.selection.accessories = undefined;
	}

	selectBean(bean: BeanInfo, lastRecord?: BrewRecord): void {
		this.selection.bean = bean;
		this.clearEquipment();
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
				if (lastRecord.accessories) this.selection.accessories = lastRecord.accessories;
			}
			if (lastRecord.grinder) this.selection.grinder = lastRecord.grinder;
			if (lastRecord.method === 'filter' && lastRecord.dripper) {
				this.selection.dripper = lastRecord.dripper;
			}
		}
		this.step = 'configure';
	}

	deselectBean(): void {
		this.selection.bean = undefined;
		this.clearEquipment();
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

	finishBrewing(time?: number, yieldGrams?: number): void {
		this.selection.time = time;
		this.selection.yield = yieldGrams;
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

	buildRecord(note?: string, profilePath?: string): BrewRecord {
		const s = this.selection;
		const base = {
			id: crypto.randomUUID(),
			timestamp: new Date().toISOString(),
			bean: s.bean!.name,
			roastDate: s.bean!.roastDate ?? '',
			roastDays: this.roastDays,
			temp: s.temp!,
			grindSize: s.grindSize!,
			grinder: s.grinder,
			dose: s.dose!,
			time: s.time,
			yield: s.yield,
			recipe: s.recipe?.name,
			note,
			profilePath,
		};

		if (s.method === 'espresso') {
			return { ...base, method: 'espresso', drink: s.drink!, basket: s.basket!, accessories: s.accessories };
		}
		return { ...base, method: 'filter', waterTemp: s.waterTemp!, filter: s.filter!, dripper: s.dripper };
	}
}
