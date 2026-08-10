import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EquipmentSettings, GrinderConfig } from '../../src/brew/types';
import { EquipmentStorage } from '../../src/services/EquipmentStorage';
import type { FileAdapter } from '../../src/services/FileAdapter';

class InMemoryFileAdapter implements FileAdapter {
	files = new Map<string, string>();
	directories: string[] = [];
	writes: Array<{ path: string; content: string }> = [];

	async read(path: string): Promise<string | null> {
		return this.files.get(path) ?? null;
	}

	async write(path: string, content: string): Promise<void> {
		this.files.set(path, content);
		this.writes.push({ path, content });
	}

	async mkdir(path: string): Promise<void> {
		this.directories.push(path);
	}

	async remove(path: string): Promise<void> {
		this.files.delete(path);
	}
}

const validGrinder: GrinderConfig = { name: 'C40', step: 1, min: 0, max: 40 };
const equipment: EquipmentSettings = {
	grinders: [validGrinder],
	drippers: ['V60'],
	filters: ['HF'],
	baskets: ['18g'],
	accessories: ['WDT'],
};

describe('EquipmentStorage', () => {
	let adapter: InMemoryFileAdapter;
	let storage: EquipmentStorage;

	beforeEach(() => {
		adapter = new InMemoryFileAdapter();
		storage = new EquipmentStorage('cubicj-brewing', adapter);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('loads valid equipment', async () => {
		adapter.files.set('cubicj-brewing/equipment.json', JSON.stringify(equipment));

		expect(await storage.load()).toEqual(equipment);
	});

	it('returns null when equipment.json is absent', async () => {
		expect(await storage.load()).toBeNull();
		expect(adapter.writes).toEqual([]);
	});

	it('backs up corrupt content and returns null', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-10T12:34:56.789Z'));
		adapter.files.set('cubicj-brewing/equipment.json', '{broken json');

		expect(await storage.load()).toBeNull();
		expect(adapter.directories).toEqual(['cubicj-brewing']);
		expect(adapter.writes).toEqual([
			{
				path: 'cubicj-brewing/equipment.2026-08-10T12-34-56.789Z.bak',
				content: '{broken json',
			},
		]);
	});

	it('backs up schema-invalid content and returns null', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-10T12:34:56.789Z'));
		const raw = JSON.stringify({ grinders: [], drippers: [] });
		adapter.files.set('cubicj-brewing/equipment.json', raw);

		expect(await storage.load()).toBeNull();
		expect(adapter.writes).toEqual([
			{
				path: 'cubicj-brewing/equipment.2026-08-10T12-34-56.789Z.bak',
				content: raw,
			},
		]);
	});

	it('creates the base directory and writes pretty-printed equipment', async () => {
		await storage.save(equipment);

		expect(adapter.directories).toEqual(['cubicj-brewing']);
		expect(adapter.files.get('cubicj-brewing/equipment.json')).toBe(JSON.stringify(equipment, null, 2));
	});

	it('filters invalid grinders and sanitizes malformed rpm configs', async () => {
		adapter.files.set(
			'cubicj-brewing/equipment.json',
			JSON.stringify({
				grinders: [
					validGrinder,
					{ name: 'missing-range' },
					{ ...validGrinder, name: 'Broken RPM', rpm: { min: 300, max: 2000, step: 10, current: 'fast' } },
				],
				drippers: ['V60', 3],
				filters: ['HF', null],
				baskets: ['18g', {}],
				accessories: ['WDT', false],
			}),
		);

		expect(await storage.load()).toEqual({
			grinders: [validGrinder, { ...validGrinder, name: 'Broken RPM' }],
			drippers: ['V60'],
			filters: ['HF'],
			baskets: ['18g'],
			accessories: ['WDT'],
		});
	});
});
