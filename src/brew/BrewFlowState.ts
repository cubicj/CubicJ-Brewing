import type {
	BrewMethod,
	BrewTemp,
	EspressoDrink,
	BeanInfo,
	RecipeInfo,
	BrewRecord,
	BrewFlowStep,
	BrewFlowSelection,
} from './types';
import { calcRoastDays } from './constants';

export type FlowPhase = 'setup' | 'running' | 'review';
export type PanelMode = 'editable' | 'readonly' | 'disabled';

const FLOW_ORDER: BrewFlowStep[] = ['idle', 'method', 'bean', 'configure', 'brewing', 'saving'];

export class BrewFlowState {
	step: BrewFlowStep = 'idle';
	selection: BrewFlowSelection = {};
	brewingStarted = false;
	private initializedConfigureSetupKey: string | undefined;
	private configureInitToken = 0;

	get phase(): FlowPhase {
		if (this.step === 'saving') return 'review';
		if (this.step === 'brewing' && this.brewingStarted) return 'running';
		return 'setup';
	}

	panelMode(panel: Exclude<BrewFlowStep, 'idle'>): PanelMode {
		const current = this.step === 'idle' ? 'method' : this.step;
		if (FLOW_ORDER.indexOf(panel) > FLOW_ORDER.indexOf(current)) return 'disabled';
		if (this.phase === 'setup') return 'editable';
		if (this.phase === 'running') return panel === 'brewing' ? 'editable' : 'readonly';
		return panel === 'method' || panel === 'bean' ? 'readonly' : 'editable';
	}

	startBrew(): void {
		this.step = 'method';
		this.selection = {};
		this.brewingStarted = false;
		this.initializedConfigureSetupKey = undefined;
		this.configureInitToken += 1;
	}

	selectMethod(method: BrewMethod, temp: BrewTemp, drink?: EspressoDrink): void {
		if (this.phase !== 'setup') return;
		this.selection.method = method;
		this.selection.temp = temp;
		this.selection.drink = method === 'espresso' ? drink : undefined;
		this.step = 'bean';
	}

	private clearEquipment(): void {
		this.selection.grindSize = undefined;
		this.selection.dose = undefined;
		this.selection.waterTemp = undefined;
		this.selection.filter = undefined;
		this.selection.dripper = undefined;
		this.selection.grinder = undefined;
		this.selection.rpm = undefined;
		this.selection.basket = undefined;
		this.selection.accessories = undefined;
	}

	selectBean(bean: BeanInfo): void {
		if (this.phase !== 'setup' || this.step === 'method') return;
		this.selection.bean = bean;
		this.clearEquipment();
		this.step = 'configure';
	}

	deselectBean(): void {
		if (this.phase !== 'setup') return;
		if (this.step !== 'configure' && this.step !== 'brewing') return;
		this.selection.bean = undefined;
		this.clearEquipment();
		this.step = 'bean';
	}

	updateVariables(vars: Partial<BrewFlowSelection>): void {
		Object.assign(this.selection, vars);
	}

	getInitializedConfigureSetupKey(): string | undefined {
		return this.initializedConfigureSetupKey;
	}

	markConfigureInitialized(setupKey: string): void {
		this.initializedConfigureSetupKey = setupKey;
	}

	nextConfigureInitToken(): number {
		this.configureInitToken += 1;
		return this.configureInitToken;
	}

	getConfigureInitToken(): number {
		return this.configureInitToken;
	}

	selectRecipe(recipe: RecipeInfo): void {
		this.selection.recipe = recipe;
	}

	clearRecipe(): void {
		this.selection.recipe = undefined;
	}

	startBrewing(): void {
		if (this.step !== 'configure') return;
		this.step = 'brewing';
	}

	beginBrewingRun(): void {
		if (this.step !== 'brewing' || this.brewingStarted) return;
		this.brewingStarted = true;
	}

	cancelBrewingRun(): void {
		if (this.step !== 'brewing') return;
		this.brewingStarted = false;
	}

	finishBrewing(time?: number, yieldGrams?: number): void {
		if (this.step !== 'brewing') return;
		this.selection.time = time;
		this.selection.yield = yieldGrams;
		this.brewingStarted = false;
		this.step = 'saving';
	}

	redoBrewing(): void {
		if (this.step !== 'saving') return;
		this.selection.time = undefined;
		this.selection.yield = undefined;
		this.step = 'brewing';
	}

	goToStep(step: BrewFlowStep): void {
		if (this.phase !== 'setup') return;
		const targetIdx = FLOW_ORDER.indexOf(step);
		const currentIdx = FLOW_ORDER.indexOf(this.step);
		if (targetIdx < currentIdx) this.step = step;
	}

	cancel(): void {
		this.step = 'idle';
		this.selection = {};
		this.brewingStarted = false;
		this.initializedConfigureSetupKey = undefined;
		this.configureInitToken += 1;
	}

	get roastDays(): number | null {
		return calcRoastDays(this.selection.bean?.roastDate ?? null);
	}

	buildRecord(note?: string, profilePath?: string): BrewRecord {
		const s = this.selection;
		if (!s.bean || !s.method || !s.temp || s.grindSize == null || s.dose == null) {
			throw new Error(`buildRecord called with incomplete selection: step=${this.step}`);
		}

		const base = {
			id: crypto.randomUUID(),
			timestamp: new Date().toISOString(),
			bean: s.bean.name,
			roastDate: s.bean.roastDate ?? '',
			roastDays: this.roastDays,
			temp: s.temp,
			grindSize: s.grindSize,
			grinder: s.grinder,
			rpm: s.rpm,
			dose: s.dose,
			time: s.time,
			yield: s.yield,
			recipe: s.recipe?.name,
			note,
			profilePath,
			waterWeight: s.waterWeight,
			milkWeight: s.milkWeight,
		};

		if (s.method === 'espresso') {
			if (!s.drink || !s.basket) {
				throw new Error(`buildRecord called with incomplete espresso selection: step=${this.step}`);
			}
			return { ...base, method: 'espresso', drink: s.drink, basket: s.basket, accessories: s.accessories };
		}
		if (s.waterTemp == null) {
			throw new Error(`buildRecord called with incomplete filter selection: step=${this.step}`);
		}
		return { ...base, method: 'filter', waterTemp: s.waterTemp, filter: s.filter, dripper: s.dripper };
	}
}
