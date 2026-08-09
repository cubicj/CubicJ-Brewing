export class CodeBlockRefreshRegistry {
	private containers: WeakRef<HTMLElement>[] = [];
	private renderTokens = new WeakMap<HTMLElement, number>();
	private nextRenderToken = 0;

	track(el: HTMLElement): void {
		this.containers.push(new WeakRef(el));
	}

	refreshAll(render: (el: HTMLElement) => void): void {
		this.containers = this.containers.filter((ref) => {
			const el = ref.deref();
			if (!el) return false;
			render(el);
			return true;
		});
	}

	beginRender(el: HTMLElement): number {
		const token = ++this.nextRenderToken;
		this.renderTokens.set(el, token);
		return token;
	}

	isCurrent(el: HTMLElement, token: number): boolean {
		return this.renderTokens.get(el) === token;
	}
}
