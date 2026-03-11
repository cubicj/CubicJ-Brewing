import { describe, it, expect, beforeEach } from 'vitest';
import { t, initI18n } from './index';

describe('i18n', () => {
	beforeEach(() => {
		initI18n('en');
	});

	it('returns English text by default', () => {
		expect(t('common.confirm')).toBe('Confirm');
	});

	it('returns Korean text when locale is ko', () => {
		initI18n('ko');
		expect(t('common.confirm')).toBe('확인');
	});

	it('falls back to English for missing keys in locale', () => {
		initI18n('ko');
		expect(t('common.confirm')).toBeTruthy();
	});

	it('interpolates variables', () => {
		expect(t('bean.roastDays', { n: 15 })).toBe('Day 15');
	});

	it('interpolates variables in Korean', () => {
		initI18n('ko');
		expect(t('bean.roastDays', { n: 15 })).toBe('15일차');
	});

	it('falls back to key string for unknown keys', () => {
		expect(t('nonexistent.key' as any)).toBe('nonexistent.key');
	});

	it('falls back to English for unknown locale', () => {
		initI18n('xx');
		expect(t('common.confirm')).toBe('Confirm');
	});
});
