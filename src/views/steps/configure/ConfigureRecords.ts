import type { BrewFlowSelection, BrewRecord, EspressoDrink } from '../../../brew/types';
import type { BrewRecordService } from '../../../services/BrewRecordService';

export interface ConfigureRecordQuery {
	drink?: EspressoDrink;
	filter?: string;
	grinder?: string;
	dripper?: string;
	basket?: string;
}

export function buildLooseRecordQuery(sel: BrewFlowSelection): ConfigureRecordQuery {
	const equip: ConfigureRecordQuery = {};
	if (sel.drink) equip.drink = sel.drink;
	return equip;
}

export function buildStrictRecordQuery(sel: BrewFlowSelection): ConfigureRecordQuery {
	const equip: ConfigureRecordQuery = {};
	if (sel.drink) equip.drink = sel.drink;
	if (sel.filter) equip.filter = sel.filter;
	if (sel.grinder) equip.grinder = sel.grinder;
	if (sel.dripper) equip.dripper = sel.dripper;
	if (sel.basket) equip.basket = sel.basket;
	return equip;
}

export async function getLooseLastRecord(
	recordService: BrewRecordService,
	sel: BrewFlowSelection,
): Promise<BrewRecord | undefined> {
	const result = await recordService.getLastRecord(sel.bean!.name, sel.method!, sel.temp!, buildLooseRecordQuery(sel));
	return result.ok ? result.data : undefined;
}

export async function getLooseMatchingRecords(
	recordService: BrewRecordService,
	sel: BrewFlowSelection,
): Promise<BrewRecord[]> {
	const result = await recordService.getMatchingRecords(
		sel.bean!.name,
		sel.method!,
		sel.temp!,
		buildLooseRecordQuery(sel),
	);
	return result.ok ? result.data : [];
}

export async function getStrictMatchingRecords(
	recordService: BrewRecordService,
	sel: BrewFlowSelection,
): Promise<BrewRecord[]> {
	const result = await recordService.getMatchingRecords(
		sel.bean!.name,
		sel.method!,
		sel.temp!,
		buildStrictRecordQuery(sel),
	);
	return result.ok ? result.data : [];
}
