type EventMap<Events> = {
	[K in keyof Events]: (...args: never[]) => void;
};

export class TypedEmitter<Events extends EventMap<Events>> {
	private listeners: Partial<{ [K in keyof Events]: Events[K][] }> = {};

	on<K extends keyof Events>(event: K, listener: Events[K]): this {
		const listeners = this.listeners[event] ?? [];
		listeners.push(listener);
		this.listeners[event] = listeners;
		return this;
	}

	removeListener<K extends keyof Events>(event: K, listener: Events[K]): this {
		const listeners = this.listeners[event];
		if (!listeners) return this;
		const index = listeners.lastIndexOf(listener);
		if (index >= 0) listeners.splice(index, 1);
		if (listeners.length === 0) delete this.listeners[event];
		return this;
	}

	removeAllListeners(event?: keyof Events): this {
		if (event === undefined) this.listeners = {};
		else delete this.listeners[event];
		return this;
	}

	emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): boolean {
		const listeners = this.listeners[event]?.slice();
		if (!listeners || listeners.length === 0) return false;
		for (const listener of listeners) listener(...args);
		return true;
	}
}
