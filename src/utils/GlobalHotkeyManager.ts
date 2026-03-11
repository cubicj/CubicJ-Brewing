interface GlobalShortcutAPI {
	register(accelerator: string, callback: () => void): boolean;
	unregister(accelerator: string): void;
	unregisterAll(): void;
	isRegistered(accelerator: string): boolean;
}

export class GlobalHotkeyManager {
	private api: GlobalShortcutAPI;
	private registered = new Set<string>();

	constructor(api: GlobalShortcutAPI) {
		this.api = api;
	}

	register(hotkeys: Record<string, string>, actions: Record<string, () => void>, warn?: (msg: string) => void): void {
		for (const [commandId, accelerator] of Object.entries(hotkeys)) {
			const action = actions[commandId];
			if (!action) continue;

			const ok = this.api.register(accelerator, action);
			if (ok) {
				this.registered.add(accelerator);
			} else if (warn) {
				warn(`Global hotkey failed to register: ${accelerator} for ${commandId}`);
			}
		}
	}

	unregisterAll(): void {
		for (const accelerator of this.registered) {
			this.api.unregister(accelerator);
		}
		this.registered.clear();
	}
}
