import { describe, it, expect } from 'vitest';
import { ok, fail } from './result';

describe('Result helpers', () => {
	it('ok() creates success result', () => {
		const r = ok(42);
		expect(r).toEqual({ ok: true, data: 42 });
	});

	it('ok() with void', () => {
		const r = ok(undefined);
		expect(r).toEqual({ ok: true, data: undefined });
	});

	it('fail() creates error result', () => {
		const r = fail('TEST_ERROR', 'something broke');
		expect(r).toEqual({ ok: false, error: { code: 'TEST_ERROR', message: 'something broke' } });
	});

	it('ok discriminant narrows type', () => {
		const r = ok(42);
		if (r.ok) {
			expect(r.data).toBe(42);
		} else {
			throw new Error('should be ok');
		}
	});

	it('fail discriminant narrows type', () => {
		const r = fail('E', 'msg');
		if (!r.ok) {
			expect(r.error.code).toBe('E');
		} else {
			throw new Error('should be fail');
		}
	});
});
