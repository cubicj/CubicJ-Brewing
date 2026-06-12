import type { BrewRecord } from '../brew/types';

export interface BrewDayGroup {
	bean: string;
	records: BrewRecord[];
}

export function parseDailyNoteDateFromPath(sourcePath: string): string | null {
	const basename = sourcePath.split('/').pop() ?? sourcePath;
	const match = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(basename);
	if (!match) return null;
	return localDateBoundary(match[1]) ? match[1] : null;
}

export function isRecordOnLocalDate(timestamp: string, yyyyMmDd: string): boolean {
	const start = localDateBoundary(yyyyMmDd);
	if (!start) return false;
	if (!hasValidTimestampDate(timestamp)) return false;

	const end = new Date(start);
	end.setDate(end.getDate() + 1);

	const recordDate = new Date(timestamp);
	if (Number.isNaN(recordDate.getTime())) return false;

	return recordDate >= start && recordDate < end;
}

function hasValidTimestampDate(timestamp: string): boolean {
	const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?(?:Z|([+-])(\d{2}):(\d{2}))?$/.exec(timestamp);
	if (!match || !localDateBoundary(match[1])) return false;

	const hour = Number(match[2]);
	const minute = Number(match[3]);
	const second = Number(match[4]);
	const offsetHour = match[6] === undefined ? 0 : Number(match[6]);
	const offsetMinute = match[7] === undefined ? 0 : Number(match[7]);

	return hour < 24 && minute < 60 && second < 60 && offsetHour < 24 && offsetMinute < 60;
}

export function groupRecordsByBeanForDay(records: BrewRecord[], yyyyMmDd: string): BrewDayGroup[] {
	const groups = new Map<string, BrewRecord[]>();

	for (const record of records) {
		if (!isRecordOnLocalDate(record.timestamp, yyyyMmDd)) continue;
		const group = groups.get(record.bean);
		if (group) group.push(record);
		else groups.set(record.bean, [record]);
	}

	return Array.from(groups.entries())
		.map(([bean, groupRecords]) => ({
			bean,
			records: groupRecords.sort(compareRecordsByTimestampDesc),
		}))
		.sort((a, b) => compareRecordsByTimestampDesc(a.records[0], b.records[0]));
}

function compareRecordsByTimestampDesc(a: BrewRecord, b: BrewRecord): number {
	return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
}

function localDateBoundary(yyyyMmDd: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(yyyyMmDd);
	if (!match) return null;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);

	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
	return date;
}
