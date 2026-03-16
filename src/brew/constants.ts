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

export const getTempLabel = (key: string): string => {
	const map: Record<string, () => string> = {
		hot: () => t('temp.hot'),
		iced: () => t('temp.iced'),
	};
	return map[key]?.() ?? key;
};

export const MS_PER_DAY = 86400000;

export const calcRoastDays = (roastDate: string | null): number | null => {
	if (!roastDate) return null;
	return Math.floor((Date.now() - new Date(roastDate).getTime()) / MS_PER_DAY);
};

export const BEAN_NOTE_EXTRA = '```brews\n```';
