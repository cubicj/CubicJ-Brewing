export interface LogConfig {
	enabled: boolean;
	categories: string[];
	packetLog: boolean;
}

export type GlobalHotkeys = Record<string, string>;

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

export interface GrinderConfig {
	name: string;
	step: number;
	min: number;
	max: number;
}

export interface EquipmentSettings {
	grinders: GrinderConfig[];
	drippers: string[];
	filters: string[];
	baskets: string[];
	accessories: string[];
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
	grinder?: string;
	dose: number;
	time?: number;
	yield?: number;
	recipe?: string;
	note?: string;
	profilePath?: string;
	waterWeight?: number;
	milkWeight?: number;
}

export interface FilterRecord extends BrewRecordBase {
	method: 'filter';
	waterTemp: number;
	filter: string;
	dripper?: string;
}

export interface EspressoRecord extends BrewRecordBase {
	method: 'espresso';
	drink: EspressoDrink;
	basket: string;
	accessories?: string[];
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
	grinder?: string;
	dripper?: string;
	accessories?: string[];
	recipe?: RecipeInfo;
	time?: number;
	yield?: number;
	note?: string;
	waterWeight?: number;
	milkWeight?: number;
}
