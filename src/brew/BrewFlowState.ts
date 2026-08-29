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

const FLOW_ORDER: BrewFlowStep[] = ['idle', 'bean', 'method', 'configure', 'brewing', 'saving'];

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

	isMethodComplete(): boolean {
		const { method, temp, drink } = this.selection;
		return !!method && !!temp && (method !== 'espresso' || !!drink);
	}

	panelMode(panel: Exclude<BrewFlowStep, 'idle'>): PanelMode {
		const current = this.step === 'idle' ? 'bean' : this.step;
		const currentIndex = FLOW_ORDER.indexOf(current);
		const effectiveCurrentIndex =
			this.phase === 'setup' ? Math.max(currentIndex, FLOW_ORDER.indexOf('method')) : currentIndex;
		if (this.phase === 'running' && panel === 'saving') return 'editable';
		if (FLOW_ORDER.indexOf(panel) > effectiveCurrentIndex) return 'disabled';
		if (this.phase === 'setup') return 'editable';
		if (this.phase === 'running') return panel === 'brewing' || panel === 'configure' ? 'editable' : 'readonly';
		return panel === 'method' ? 'readonly' : 'editable';
	}

	startBrew(): void {
		this.step = 'bean';
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
		this.step = this.selection.bean && this.isMethodComplete() ? 'configure' : 'bean';
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
		if (this.phase === 'review') {
			this.selection.bean = bean;
			return;
		}
		if (this.phase !== 'setup') return;
		this.selection.bean = bean;
		this.clearEquipment();
		this.step = this.isMethodComplete() ? 'configure' : 'method';
	}

	deselectBean(): void {
		if (this.phase !== 'setup' || !this.selection.bean) return;
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

	beginBrewingRun(): boolean {
		if (this.step !== 'brewing' || this.brewingStarted) return false;
		this.brewingStarted = true;
		return true;
	}

	cancelBrewingRun(): void {
		if (this.step !== 'brewing') return;
		this.brewingStarted = false;
		this.selection.time = undefined;
		this.selection.yield = undefined;
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

	rewindToMethod(): void {
		if (this.phase !== 'setup') return;
		this.clearEquipment();
		if (FLOW_ORDER.indexOf(this.step) > FLOW_ORDER.indexOf('method')) this.step = 'method';
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
