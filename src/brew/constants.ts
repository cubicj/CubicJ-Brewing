import type { EspressoDrink, BrewMethod } from './types';

export const DEFAULT_FILTERS = ['하이플럭스', 'V60 기본'];
export const DEFAULT_BASKETS = ['DH 18g', 'IMS SF 20g', 'IMS 20g', 'Torch 18g'];
export const DEFAULT_GRINDERS: string[] = [];

export const DRINK_LABELS: Record<EspressoDrink, string> = {
	shot: '샷',
	americano: '아메리카노',
	latte: '라떼',
};

export const METHOD_LABELS: Record<BrewMethod, string> = {
	filter: '필터',
	espresso: '에스프레소',
};
