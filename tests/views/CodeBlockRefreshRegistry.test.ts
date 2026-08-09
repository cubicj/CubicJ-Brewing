import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeBlockRefreshRegistry } from '../../src/views/CodeBlockRefreshRegistry';

afterEach(() => vi.unstubAllGlobals());

describe('CodeBlockRefreshRegistry', () => {
	it('refreshes detached elements and prunes collected references', () => {
		const detached = { isConnected: false } as HTMLElement;
		const collected = { isConnected: false } as HTMLElement;
		const dereferenceCounts = new Map<object, number>();
		class DeterministicWeakRef {
			constructor(private target: object) {}

			deref(): object | undefined {
				dereferenceCounts.set(this.target, (dereferenceCounts.get(this.target) ?? 0) + 1);
				return this.target === collected ? undefined : this.target;
			}
		}
		vi.stubGlobal('WeakRef', DeterministicWeakRef);
		const registry = new CodeBlockRefreshRegistry();
		const rendered: HTMLElement[] = [];

		registry.track(detached);
		registry.track(collected);
		registry.refreshAll((el) => rendered.push(el));
		registry.refreshAll((el) => rendered.push(el));

		expect(rendered).toEqual([detached, detached]);
		expect(detached.isConnected).toBe(false);
		expect(dereferenceCounts.get(detached)).toBe(2);
		expect(dereferenceCounts.get(collected)).toBe(1);
	});

	it('keeps only the latest render token for each element', () => {
		const registry = new CodeBlockRefreshRegistry();
		const firstElement = {} as HTMLElement;
		const secondElement = {} as HTMLElement;

		const firstToken = registry.beginRender(firstElement);
		const secondElementToken = registry.beginRender(secondElement);
		const latestFirstToken = registry.beginRender(firstElement);

		expect(registry.isCurrent(firstElement, firstToken)).toBe(false);
		expect(registry.isCurrent(firstElement, latestFirstToken)).toBe(true);
		expect(registry.isCurrent(secondElement, secondElementToken)).toBe(true);
		expect(registry.isCurrent(secondElement, latestFirstToken)).toBe(false);
	});
});
