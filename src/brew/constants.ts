import type { EspressoDrink, BrewMethod } from './types';

export const DRINK_LABELS: Record<EspressoDrink, string> = {
	shot: '샷',
	americano: '아메리카노',
	latte: '카페라떼',
};

export const METHOD_LABELS: Record<BrewMethod, string> = {
	filter: '필터',
	espresso: '에스프레소',
};

export const MS_PER_DAY = 86400000;

export const BEAN_NOTE_EXTRA = '### [[원두 데이터|원두 데이터로 돌아가기]]\n\n```brews\n```';
