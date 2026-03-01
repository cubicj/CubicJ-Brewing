export type BrewMethod = 'filter' | 'espresso';
export type BrewTemp = 'hot' | 'iced';
export type EspressoDrink = 'shot' | 'americano' | 'latte';

export type BrewFlowStep = 'idle' | 'method' | 'bean' | 'configure' | 'brewing' | 'saving';

export interface BeanInfo {
	path: string;
	name: string;
	roaster: string;
	status: 'active' | 'finished';
	roastDate: string | null;
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

export interface BrewProfilePoint {
	t: number;
	w: number;
}

interface BrewRecordBase {
	id: string;
	timestamp: string;
	bean: string;
	roastDate: string;
	roastDays: number | null;
	method: BrewMethod;
	temp: BrewTemp;
	grindSize: number;
	dose: number;
	time?: number;
	yield?: number;
	drinker: string;
	recipe?: string;
	note?: string;
	profile?: BrewProfilePoint[];
}

export interface FilterRecord extends BrewRecordBase {
	method: 'filter';
	waterTemp: number;
	filter: string;
}

export interface EspressoRecord extends BrewRecordBase {
	method: 'espresso';
	drink: EspressoDrink;
	basket: string;
}

export type BrewRecord = FilterRecord | EspressoRecord;

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
	profile?: BrewProfilePoint[];
}
