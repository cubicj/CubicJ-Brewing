import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobalHotkeyManager } from './GlobalHotkeyManager';

describe('GlobalHotkeyManager', () => {
	const mockRegister = vi.fn().mockReturnValue(true);
	const mockUnregisterAll = vi.fn();
	const mockIsRegistered = vi.fn().mockReturnValue(false);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	function create() {
		return new GlobalHotkeyManager({
			register: mockRegister,
			unregisterAll: mockUnregisterAll,
			isRegistered: mockIsRegistered,
		});
	}

	it('registers hotkeys for matching actions', () => {
		const mgr = create();
		const action = vi.fn();
		mgr.register({ tare: 'Ctrl+Alt+Shift+F11' }, { tare: action });

		expect(mockRegister).toHaveBeenCalledWith('Ctrl+Alt+Shift+F11', expect.any(Function));
	});

	it('skips hotkeys with no matching action', () => {
		const mgr = create();
		mgr.register({ unknown: 'Ctrl+X' }, { tare: vi.fn() });

		expect(mockRegister).not.toHaveBeenCalled();
	});

	it('logs warning when register returns false', () => {
		mockRegister.mockReturnValueOnce(false);
		const logFn = vi.fn();
		const mgr = create();
		mgr.register({ tare: 'Ctrl+Alt+Shift+F11' }, { tare: vi.fn() }, logFn);

		expect(logFn).toHaveBeenCalledWith(expect.stringContaining('Ctrl+Alt+Shift+F11'));
	});

	it('unregisters all on destroy', () => {
		const mgr = create();
		mgr.register({ tare: 'Ctrl+Alt+Shift+F11' }, { tare: vi.fn() });
		mgr.unregisterAll();

		expect(mockUnregisterAll).toHaveBeenCalled();
	});

	it('invokes action callback when hotkey fires', () => {
		const mgr = create();
		const action = vi.fn();
		mgr.register({ tare: 'Ctrl+Alt+Shift+F11' }, { tare: action });

		const registeredCallback = mockRegister.mock.calls[0][1];
		registeredCallback();
		expect(action).toHaveBeenCalled();
	});
});
