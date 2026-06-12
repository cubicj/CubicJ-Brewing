import type { BrewRecord } from '../brew/types';

export interface BrewDayGroup {
	bean: string;
	records: BrewRecord[];
}

export function parseDailyNoteDateFromPath(sourcePath: string): string | null {
	const basename = sourcePath.split('/').pop() ?? sourcePath;
	const match = /^(\d{4}-\d{2}-\d{2})\.md$/.exec(basename);
	return match?.[1] ?? null;
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
	const match = /^(\d{4}-\d{2}-\d{2})T/.exec(timestamp);
	return Boolean(match && localDateBoundary(match[1]));
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
			records: groupRecords.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
		}))
		.sort((a, b) => b.records[0].timestamp.localeCompare(a.records[0].timestamp));
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
