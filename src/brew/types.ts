export type BrewMethod = 'brewing' | 'espresso';
export type BrewTemp = 'hot' | 'iced';
export type EspressoDrink = 'shot' | 'americano' | 'latte';

export type BrewFlowStep = 'idle' | 'method' | 'bean' | 'configure' | 'brewing' | 'saving';

export interface BeanInfo {
	path: string;
	name: string;
	roaster: string;
	status: 'active' | 'finished';
	roastDates: string[];
}

export interface RecipeStep {
	time: string;
	target?: number;
	note?: string;
}

export interface RecipeInfo {
	path: string;
	name: string;
	method: string;
	dose: string;
	totalWater: string;
	temperature: number;
	steps: RecipeStep[];
}

interface BrewRecordBase {
	id: string;
	timestamp: string;
	bean: string;
	roastDate: string;
	method: BrewMethod;
	temp: BrewTemp;
	grindSize: number;
	dose: number;
	time?: number;
	yield?: number;
	drinker: string;
	recipe?: string;
	note?: string;
}

export interface BrewingRecord extends BrewRecordBase {
	method: 'brewing';
	waterTemp: number;
	filter: string;
}

export interface EspressoRecord extends BrewRecordBase {
	method: 'espresso';
	drink: EspressoDrink;
	basket: string;
}

export type BrewRecord = BrewingRecord | EspressoRecord;

export interface BrewFlowSelection {
	method?: BrewMethod;
	temp?: BrewTemp;
	drink?: EspressoDrink;
	bean?: BeanInfo;
	lastRecord?: BrewRecord;
	grindSize?: number;
	dose?: number;
	waterTemp?: number;
	filter?: string;
	basket?: string;
	recipe?: RecipeInfo;
	time?: number;
	yield?: number;
	drinker?: string;
	note?: string;
}
