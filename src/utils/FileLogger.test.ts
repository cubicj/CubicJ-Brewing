import { describe, it, expect } from 'vitest';
import { FileLogger } from './FileLogger';

const makeAdapter = () => ({
	data: new Map<string, string>(),
	async write(path: string, content: string) {
		this.data.set(path, content);
	},
	async read(path: string) {
		const v = this.data.get(path);
		if (v === undefined) throw new Error('not found');
		return v;
	},
});

describe('FileLogger rotation', () => {
	it('rotates when content exceeds maxBytes', async () => {
		const adapter = makeAdapter();
		const logger = new FileLogger(adapter, 'test.log', 2000, 5000, 100);
		adapter.data.set('test.log', 'x'.repeat(90));
		logger.start();
		logger.log('trigger rotation');
		await logger.flush();
		await logger.stop();

		expect(adapter.data.has('test.log.old')).toBe(true);
		const current = adapter.data.get('test.log')!;
		expect(current.length).toBeLessThan(90);
	});

	it('does not rotate when under maxBytes', async () => {
		const adapter = makeAdapter();
		const logger = new FileLogger(adapter, 'test.log', 2000, 5000, 10_000);
		adapter.data.set('test.log', 'x'.repeat(50));
		logger.start();
		logger.log('small');
		await logger.flush();
		await logger.stop();

		expect(adapter.data.has('test.log.old')).toBe(false);
	});
});
