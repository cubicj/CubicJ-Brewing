import { describe, it, expect, beforeEach } from 'vitest';
import { t, initI18n, type LocaleKeys } from '../../src/i18n/index';

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

	it('returns the restart instruction when the Noble addon is locked', () => {
		expect(t('noble.error.locked')).toBe(
			'The Bluetooth addon is in use in this session. Restart Obsidian, then try installing again.',
		);
		initI18n('ko');
		expect(t('noble.error.locked')).toBe(
			'블루투스 애드온이 현재 세션에서 사용 중입니다. Obsidian을 재시작한 뒤 다시 시도하세요.',
		);
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
		expect(t('nonexistent.key' as LocaleKeys)).toBe('nonexistent.key');
	});

	it('falls back to English for unknown locale', () => {
		initI18n('xx');
		expect(t('common.confirm')).toBe('Confirm');
	});
});
