import { t } from '../i18n/index';

export const getDrinkLabel = (key: string): string => {
	const map: Record<string, () => string> = {
		shot: () => t('drink.shot'),
		americano: () => t('drink.americano'),
		latte: () => t('drink.latte'),
	};
	return map[key]?.() ?? key;
};

export const getMethodLabel = (key: string): string => {
	const map: Record<string, () => string> = {
		filter: () => t('method.filter'),
		espresso: () => t('method.espresso'),
	};
	return map[key]?.() ?? key;
};

export const MS_PER_DAY = 86400000;

export const BEAN_NOTE_EXTRA = '```brews\n```';
