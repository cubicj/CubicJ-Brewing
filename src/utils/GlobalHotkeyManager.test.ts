import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GlobalHotkeyManager } from './GlobalHotkeyManager';

describe('GlobalHotkeyManager', () => {
	const mockRegister = vi.fn().mockReturnValue(true);
	const mockUnregister = vi.fn();
	const mockUnregisterAll = vi.fn();
	const mockIsRegistered = vi.fn().mockReturnValue(false);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	function create() {
		return new GlobalHotkeyManager({
			register: mockRegister,
			unregister: mockUnregister,
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

	it('unregisterAll calls individual unregister for each registered accelerator', () => {
		const mgr = create();
		mgr.register({ tare: 'Ctrl+Alt+Shift+F11', connect: 'Ctrl+Alt+Shift+F7' }, { tare: vi.fn(), connect: vi.fn() });
		mgr.unregisterAll();

		expect(mockUnregister).toHaveBeenCalledTimes(2);
		expect(mockUnregister).toHaveBeenCalledWith('Ctrl+Alt+Shift+F11');
		expect(mockUnregister).toHaveBeenCalledWith('Ctrl+Alt+Shift+F7');
	});

	it('unregisterAll does not call api.unregisterAll', () => {
		const mgr = create();
		mgr.register({ tare: 'Ctrl+Alt+Shift+F11' }, { tare: vi.fn() });
		mgr.unregisterAll();

		expect(mockUnregisterAll).not.toHaveBeenCalled();
	});

	it('unregisterAll skips accelerators that failed to register', () => {
		mockRegister.mockReturnValueOnce(true).mockReturnValueOnce(false);
		const mgr = create();
		mgr.register({ tare: 'Ctrl+Alt+Shift+F11', connect: 'Ctrl+Alt+Shift+F7' }, { tare: vi.fn(), connect: vi.fn() });
		mgr.unregisterAll();

		expect(mockUnregister).toHaveBeenCalledTimes(1);
		expect(mockUnregister).toHaveBeenCalledWith('Ctrl+Alt+Shift+F11');
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
