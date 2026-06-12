import { describe, expect, it } from 'vitest';
import type { FilterRecord } from '../brew/types';
import { groupRecordsByBeanForDay, isRecordOnLocalDate, parseDailyNoteDateFromPath } from './brewDayRecords';

const makeFilter = (overrides: Partial<FilterRecord> = {}): FilterRecord => ({
	id: crypto.randomUUID(),
	timestamp: '2026-06-12T09:00:00',
	bean: 'A Bean',
	roastDate: '2026-06-01',
	roastDays: 11,
	method: 'filter',
	temp: 'hot',
	grindSize: 2.5,
	dose: 18,
	waterTemp: 93,
	...overrides,
});

describe('parseDailyNoteDateFromPath', () => {
	it('parses YYYY-MM-DD from a daily note basename', () => {
		expect(parseDailyNoteDateFromPath('2026-06-12.md')).toBe('2026-06-12');
	});

	it('parses a valid basename from a nested path', () => {
		expect(parseDailyNoteDateFromPath('Daily/2026-06-12.md')).toBe('2026-06-12');
	});

	it('rejects non-daily-note names', () => {
		expect(parseDailyNoteDateFromPath('Daily/2026-6-12.md')).toBeNull();
		expect(parseDailyNoteDateFromPath('Daily/2026-06-12 coffee.md')).toBeNull();
		expect(parseDailyNoteDateFromPath('Daily/2026-06-12.canvas')).toBeNull();
	});
});

describe('isRecordOnLocalDate', () => {
	it('matches records inside the local day', () => {
		expect(isRecordOnLocalDate('2026-06-12T00:00:00', '2026-06-12')).toBe(true);
		expect(isRecordOnLocalDate('2026-06-12T23:59:59', '2026-06-12')).toBe(true);
	});

	it('rejects records outside the local day', () => {
		expect(isRecordOnLocalDate('2026-06-11T23:59:59', '2026-06-12')).toBe(false);
		expect(isRecordOnLocalDate('2026-06-13T00:00:00', '2026-06-12')).toBe(false);
	});

	it('rejects invalid timestamps and invalid dates', () => {
		expect(isRecordOnLocalDate('not-a-date', '2026-06-12')).toBe(false);
		expect(isRecordOnLocalDate('2026-02-30T09:00:00', '2026-03-02')).toBe(false);
		expect(isRecordOnLocalDate('2026-06-12T09:00:00', '2026-99-99')).toBe(false);
	});
});

describe('groupRecordsByBeanForDay', () => {
	it('groups only matching records by bean and sorts newest first', () => {
		const records = [
			makeFilter({ id: 'a-old', bean: 'A Bean', timestamp: '2026-06-12T08:00:00' }),
			makeFilter({ id: 'b-new', bean: 'B Bean', timestamp: '2026-06-12T12:00:00' }),
			makeFilter({ id: 'a-new', bean: 'A Bean', timestamp: '2026-06-12T10:00:00' }),
			makeFilter({ id: 'outside', bean: 'C Bean', timestamp: '2026-06-13T00:00:00' }),
		];

		const groups = groupRecordsByBeanForDay(records, '2026-06-12');

		expect(groups).toHaveLength(2);
		expect(groups[0].bean).toBe('B Bean');
		expect(groups[0].records.map((r) => r.id)).toEqual(['b-new']);
		expect(groups[1].bean).toBe('A Bean');
		expect(groups[1].records.map((r) => r.id)).toEqual(['a-new', 'a-old']);
	});
});
