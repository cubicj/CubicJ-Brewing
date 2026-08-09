import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { BrewRecord } from '../../src/brew/types';
import type { BrewProfileStorage } from '../../src/services/BrewProfileStorage';
import type { BrewRecordService } from '../../src/services/BrewRecordService';
import { fail, ok } from '../../src/types/result';

const modalMocks = vi.hoisted(() => ({
	instances: [] as Array<{
		message: string;
		onConfirm: (checked: boolean) => void | Promise<void>;
		checkbox?: { label: string; checked: boolean };
	}>,
	open: vi.fn(),
}));

const noticeMocks = vi.hoisted(() => ({ messages: [] as string[] }));

vi.mock('../../src/views/ConfirmModal', () => ({
	ConfirmModal: class {
		constructor(
			_app: App,
			message: string,
			onConfirm: (checked: boolean) => void | Promise<void>,
			checkbox?: { label: string; checked: boolean },
		) {
			modalMocks.instances.push({ message, onConfirm, checkbox });
		}

		open = modalMocks.open;
	},
}));

vi.mock('obsidian', () => ({
	Notice: class {
		constructor(message: string) {
			noticeMocks.messages.push(message);
		}
	},
}));

vi.mock('../../src/i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

import { deleteBrewRecordFlow } from '../../src/views/deleteBrewRecordFlow';

const record: BrewRecord = {
	id: 'record-1',
	timestamp: '2026-08-09T09:00:00+09:00',
	bean: 'Bean A',
	roastDate: '2026-08-01',
	roastDays: 8,
	method: 'filter',
	temp: 'hot',
	grindSize: 5,
	dose: 18,
	waterTemp: 93,
	profilePath: 'brew-profiles/record-1.json',
};

function makeDeps(removeResult = ok(undefined)) {
	const removeWithProfile = vi.fn(async () => removeResult);
	const setWeight = vi.fn(async () => ok(undefined));
	const deps = {
		app: {} as App,
		recordService: { removeWithProfile } as unknown as BrewRecordService,
		profileStorage: {} as BrewProfileStorage,
		vaultData: {
			getAllBeans: () => [
				{
					path: 'beans/a.md',
					name: 'Bean A',
					roaster: 'Roaster',
					status: 'active' as const,
					roastDate: '2026-08-01',
					weight: 100.06,
				},
			],
			setWeight,
		},
	};
	return { deps, removeWithProfile, setWeight };
}

beforeEach(() => {
	modalMocks.instances.length = 0;
	modalMocks.open.mockClear();
	noticeMocks.messages.length = 0;
});

describe('deleteBrewRecordFlow', () => {
	it('removes the record and invokes onDeleted after confirmation', async () => {
		const { deps, removeWithProfile } = makeDeps();
		const onDeleted = vi.fn();

		deleteBrewRecordFlow(deps, record, onDeleted);

		expect(modalMocks.open).toHaveBeenCalledTimes(1);
		await modalMocks.instances[0].onConfirm(false);
		expect(removeWithProfile).toHaveBeenCalledWith(record.id, record.profilePath, deps.profileStorage);
		expect(onDeleted).toHaveBeenCalledTimes(1);
	});

	it('restores the rounded bean weight when restoration is confirmed', async () => {
		const { deps, setWeight } = makeDeps();

		deleteBrewRecordFlow(deps, record, vi.fn());

		expect(modalMocks.instances[0].checkbox).toEqual({
			label: 'form.restoreWeight',
			checked: true,
		});
		await modalMocks.instances[0].onConfirm(true);
		expect(setWeight).toHaveBeenCalledWith('beans/a.md', 118.1);
	});

	it('does not restore bean weight when restoration is declined', async () => {
		const { deps, setWeight } = makeDeps();

		deleteBrewRecordFlow(deps, record, vi.fn());
		await modalMocks.instances[0].onConfirm(false);

		expect(setWeight).not.toHaveBeenCalled();
	});

	it('reports deletion failure without invoking onDeleted', async () => {
		const { deps } = makeDeps(fail('DELETE_FAILED', 'delete failed'));
		const onDeleted = vi.fn();
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		deleteBrewRecordFlow(deps, record, onDeleted);
		await modalMocks.instances[0].onConfirm(false);

		expect(errorSpy).toHaveBeenCalledWith('[deleteBrewRecord] delete failed: [DELETE_FAILED] delete failed');
		expect(noticeMocks.messages).toEqual(['error.recordDelete']);
		expect(onDeleted).not.toHaveBeenCalled();
		errorSpy.mockRestore();
	});
});
