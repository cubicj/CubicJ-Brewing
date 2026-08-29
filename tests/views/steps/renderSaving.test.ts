// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { BrewFlowState } from '../../../src/brew/BrewFlowState';
import { BrewProfileRecorder } from '../../../src/views/BrewProfileRecorder';
import { BrewRunCoordinator } from '../../../src/views/BrewRunCoordinator';
import { installPolyfills, createContainer } from '../../helpers/obsidian-dom-polyfill';
import type { StepRenderContext } from '../../../src/views/StepRenderers';
import type { BeanInfo, BrewProfilePoint } from '../../../src/brew/types';
import { ok, fail, type Result } from '../../../src/types/result';
import { renderSaving } from '../../../src/views/steps/renderSaving';

vi.mock('../../../src/i18n/index', () => ({
	t: (key: string) => key,
	initI18n: vi.fn(),
}));

beforeAll(() => {
	installPolyfills();
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function makeSavingContext(
	bean: BeanInfo,
	setWeightResult: Result<void>,
	{
		points = [],
		add = vi.fn(async () => ok(undefined)),
		profileSave = vi.fn(async () => ok('profiles/test.json')),
	}: {
		points?: BrewProfilePoint[];
		add?: ReturnType<typeof vi.fn>;
		profileSave?: ReturnType<typeof vi.fn>;
	} = {},
) {
	const flowState = new BrewFlowState();
	flowState.step = 'saving';
	flowState.selection = {
		method: 'filter',
		temp: 'hot',
		bean,
		grindSize: 2.5,
		dose: 18,
		waterTemp: 93,
	};

	const setWeight = vi.fn(async () => setWeightResult);
	const resetFlow = vi.fn();
	const recorder = new BrewProfileRecorder();
	vi.spyOn(recorder, 'getPoints').mockReturnValue(points);
	const timerController = {
		resetToIdle: vi.fn(),
		cancelRun: vi.fn().mockResolvedValue(undefined),
		isIdle: vi.fn(() => true),
	};
	const renderContent = vi.fn();
	const runCoordinator = new BrewRunCoordinator(
		flowState,
		recorder,
		timerController as unknown as StepRenderContext['timerController'],
		{ getScaleState: () => 'disconnected', renderContent },
	);

	const ctx = {
		flowState,
		plugin: {
			recordService: { add },
			vaultData: { setWeight },
			pluginLogger: null,
		} as unknown as StepRenderContext['plugin'],
		renderContent,
		accordion: {
			update: vi.fn(),
			expand: vi.fn(),
			scrollToStep: vi.fn(),
			animateContentChange: vi.fn((_, fn: () => void) => fn()),
			updateSummaries: vi.fn(),
			getStepPanel: vi.fn(() => null),
		},
		timerController: timerController as unknown as StepRenderContext['timerController'],
		runCoordinator,
		getWeightText: vi.fn(() => '0'),
		resetFlow,
		recorder,
		profileStorage: { save: profileSave } as unknown as StepRenderContext['profileStorage'],
		equipment: {} as StepRenderContext['equipment'],
		registerCleanup: vi.fn(),
	} as StepRenderContext;

	return { ctx, add, profileSave, setWeight, resetFlow };
}

const makeBean = (): BeanInfo => ({
	path: 'beans/a.md',
	name: 'A',
	roaster: '',
	status: 'active',
	roastDate: null,
	weight: 500,
});

let container: HTMLElement;

beforeEach(() => {
	container = createContainer();
});

function makeContext(selection: Partial<BrewFlowState['selection']>): StepRenderContext {
	const { ctx } = makeSavingContext(makeBean(), ok(undefined));
	ctx.flowState.selection = { ...ctx.flowState.selection, ...selection };
	return ctx;
}

describe('renderSaving bean weight deduction', () => {
	it('deducts the dose from the bean weight after a successful save', async () => {
		const bean = makeBean();
		const { ctx, setWeight, resetFlow } = makeSavingContext(bean, ok(undefined));
		const container = createContainer();
		renderSaving(container, ctx);

		(container.querySelector('.brew-flow-save-btn') as HTMLButtonElement).click();
		await vi.waitFor(() => expect(resetFlow).toHaveBeenCalled());

		expect(setWeight).toHaveBeenCalledWith('beans/a.md', 482);
		expect(bean.weight).toBe(482);
	});

	it('keeps the local bean weight when the vault update fails', async () => {
		const bean = makeBean();
		const { ctx, setWeight, resetFlow } = makeSavingContext(
			bean,
			fail('VAULT_FILE_NOT_FOUND', 'File not found: beans/a.md'),
		);
		const container = createContainer();
		renderSaving(container, ctx);

		(container.querySelector('.brew-flow-save-btn') as HTMLButtonElement).click();
		await vi.waitFor(() => expect(resetFlow).toHaveBeenCalled());

		expect(setWeight).toHaveBeenCalled();
		expect(bean.weight).toBe(500);
	});
});

it('renders no time/yield steppers for espresso without time', () => {
	const ctx = makeContext({ method: 'espresso', drink: 'shot' });
	renderSaving(container, ctx);
	expect(container.querySelectorAll('.cubicj-stepper').length).toBe(0);
});

it('seeds the addition stepper from the stored selection weight', () => {
	const ctx = makeContext({ method: 'filter', waterWeight: 120 });
	renderSaving(container, ctx);
	const value = container.querySelector('.cubicj-stepper-value')!;
	expect(value.textContent).toBe('120.0g');
});

it('renders memo only during the running phase', () => {
	const ctx = makeContext({ method: 'filter' });
	ctx.flowState.step = 'brewing';
	ctx.flowState.brewingStarted = true;
	renderSaving(container, ctx);
	expect(container.querySelector('.brew-flow-note')).not.toBeNull();
	expect(container.querySelector('.brew-flow-save-btn')).toBeNull();
	expect(container.querySelector('.cubicj-stepper')).toBeNull();
});

it('memo edits persist into the selection', () => {
	const ctx = makeContext({ method: 'filter' });
	renderSaving(container, ctx);
	const note = container.querySelector<HTMLTextAreaElement>('.brew-flow-note')!;
	note.value = 'channeling on second pour';
	note.dispatchEvent(new Event('input'));
	expect(ctx.flowState.selection.note).toBe('channeling on second pour');
});

it('save snapshots record inputs before awaiting storage', async () => {
	const profileDeferred = deferred<Result<string>>();
	const profileSave = vi.fn(() => profileDeferred.promise);
	const { ctx, add } = makeSavingContext(makeBean(), ok(undefined), {
		points: [{ t: 0, w: 0 }],
		profileSave,
	});
	ctx.flowState.selection.yield = 250;
	renderSaving(container, ctx);
	container.querySelector<HTMLButtonElement>('.brew-flow-save-btn')!.click();
	await vi.waitFor(() => expect(profileSave).toHaveBeenCalledTimes(1));
	ctx.flowState.selection.yield = 300;
	profileDeferred.resolve(ok('profiles/test.json'));
	await vi.waitFor(() => expect(add).toHaveBeenCalledTimes(1));
	expect(add.mock.calls[0][0].yield).toBe(250);
});

it('save completion skips resetFlow when the generation moved', async () => {
	const addDeferred = deferred<Result<void>>();
	const add = vi.fn(() => addDeferred.promise);
	const { ctx, resetFlow } = makeSavingContext(makeBean(), ok(undefined), { add });
	renderSaving(container, ctx);
	container.querySelector<HTMLButtonElement>('.brew-flow-save-btn')!.click();
	await vi.waitFor(() => expect(add).toHaveBeenCalledTimes(1));
	expect(ctx.runCoordinator.isSavePending()).toBe(true);
	ctx.runCoordinator.resetAll();
	addDeferred.resolve(ok(undefined));
	await vi.waitFor(() => expect(ctx.runCoordinator.isSavePending()).toBe(false));
	expect(resetFlow).not.toHaveBeenCalled();
});

it('save holds the save claim for its duration', async () => {
	const addDeferred = deferred<Result<void>>();
	const add = vi.fn(() => addDeferred.promise);
	const { ctx } = makeSavingContext(makeBean(), ok(undefined), { add });
	renderSaving(container, ctx);
	container.querySelector<HTMLButtonElement>('.brew-flow-save-btn')!.click();
	await vi.waitFor(() => expect(add).toHaveBeenCalledTimes(1));
	expect(ctx.runCoordinator.isSavePending()).toBe(true);
	addDeferred.resolve(ok(undefined));
	await vi.waitFor(() => expect(ctx.runCoordinator.isSavePending()).toBe(false));
});
