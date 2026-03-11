import en from './locales/en.json';
import ko from './locales/ko.json';

type LocaleKeys = keyof typeof en;
type LocaleMap = Partial<Record<LocaleKeys, string>>;

const locales: Record<string, LocaleMap> = { en, ko };
let current: LocaleMap = en;

export function initI18n(lang: string): void {
	current = locales[lang] ?? en;
}

export function t(key: LocaleKeys, vars?: Record<string, string | number>): string {
	let str = current[key] ?? en[key] ?? key;
	if (vars) {
		for (const [k, v] of Object.entries(vars)) {
			str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
		}
	}
	return str;
}

export function getAvailableLocales(): { code: string; name: string }[] {
	return [
		{ code: 'en', name: 'English' },
		{ code: 'ko', name: '한국어' },
	];
}

export type { LocaleKeys };
