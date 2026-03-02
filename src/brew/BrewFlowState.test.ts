import { describe, it, expect } from 'vitest';
import { BrewFlowState } from './BrewFlowState';

describe('BrewFlowState', () => {
	it('starts in idle', () => {
		const state = new BrewFlowState();
		expect(state.step).toBe('idle');
	});

	it('idle -> method on startBrew', () => {
		const state = new BrewFlowState();
		state.startBrew();
		expect(state.step).toBe('method');
	});

	it('method -> bean on selectMethod', () => {
		const state = new BrewFlowState();
		state.startBrew();
		state.selectMethod('filter', 'hot');
		expect(state.step).toBe('bean');
		expect(state.selection.method).toBe('filter');
		expect(state.selection.temp).toBe('hot');
	});

	it('espresso method requires drink before advancing', () => {
		const state = new BrewFlowState();
		state.startBrew();
		state.selectMethod('espresso', 'hot', 'americano');
		expect(state.step).toBe('bean');
		expect(state.selection.drink).toBe('americano');
	});

	it('bean -> configure on selectBean', () => {
		const state = new BrewFlowState();
		state.startBrew();
		state.selectMethod('filter', 'hot');
		const bean = { path: 'test.md', name: '첼로', roaster: 'LULL', status: 'active' as const, roastDate: '2026-02-20' };
		state.selectBean(bean);
		expect(state.step).toBe('configure');
		expect(state.selection.bean).toBe(bean);
	});

	it('configure -> brewing on startBrewing', () => {
		const state = new BrewFlowState();
		state.startBrew();
		state.selectMethod('filter', 'hot');
		state.selectBean({ path: 'test.md', name: '첼로', roaster: 'LULL', status: 'active', roastDate: '2026-02-20' });
		state.updateVariables({ grindSize: 2.6, dose: 18, waterTemp: 96, filter: '하이플럭스' });
		state.startBrewing();
		expect(state.step).toBe('brewing');
	});

	it('brewing -> saving on finishBrewing', () => {
		const state = new BrewFlowState();
		state.startBrew();
		state.selectMethod('filter', 'hot');
		state.selectBean({ path: 'test.md', name: '첼로', roaster: 'LULL', status: 'active', roastDate: '2026-02-20' });
		state.startBrewing();
		state.finishBrewing(180.5, 282);
		expect(state.step).toBe('saving');
		expect(state.selection.time).toBe(180.5);
		expect(state.selection.yield).toBe(282);
	});

	it('goBack from bean returns to method', () => {
		const state = new BrewFlowState();
		state.startBrew();
		state.selectMethod('filter', 'hot');
		state.goBack();
		expect(state.step).toBe('method');
	});

	it('goBack from configure returns to bean', () => {
		const state = new BrewFlowState();
		state.startBrew();
		state.selectMethod('filter', 'hot');
		state.selectBean({ path: 'test.md', name: '첼로', roaster: 'LULL', status: 'active', roastDate: '2026-02-20' });
		state.goBack();
		expect(state.step).toBe('bean');
	});

	it('cancel resets to idle', () => {
		const state = new BrewFlowState();
		state.startBrew();
		state.selectMethod('filter', 'hot');
		state.selectBean({ path: 'test.md', name: '첼로', roaster: 'LULL', status: 'active', roastDate: '2026-02-20' });
		state.cancel();
		expect(state.step).toBe('idle');
		expect(state.selection.method).toBeUndefined();
	});

	it('buildRecord includes grinder, dripper, and accessories', () => {
		const state = new BrewFlowState();
		state.startBrew();
		state.selectMethod('filter', 'hot');
		state.selectBean({ path: 'test.md', name: 'Test', roaster: '', status: 'active', roastDate: '2026-03-01' });
		state.updateVariables({ grindSize: 15, dose: 18, waterTemp: 93, filter: 'HF', grinder: 'C40', dripper: 'V60' });
		state.startBrewing();
		state.finishBrewing(120, 280);
		const record = state.buildRecord('test');
		expect(record.grinder).toBe('C40');
		expect(record.method === 'filter' && record.dripper).toBe('V60');
	});

	it('buildRecord includes accessories for espresso', () => {
		const state = new BrewFlowState();
		state.startBrew();
		state.selectMethod('espresso', 'hot', 'americano');
		state.selectBean({ path: 'test.md', name: 'Test', roaster: '', status: 'active', roastDate: '2026-03-01' });
		state.updateVariables({ grindSize: 2, dose: 18, basket: 'IMS', grinder: 'K-Ultra', accessories: ['퍽스크린'] });
		state.startBrewing();
		state.finishBrewing(30, 36);
		const record = state.buildRecord();
		expect(record.grinder).toBe('K-Ultra');
		expect(record.method === 'espresso' && record.accessories).toEqual(['퍽스크린']);
	});

	it('buildRecord creates FilterRecord', () => {
		const state = new BrewFlowState();
		state.startBrew();
		state.selectMethod('filter', 'hot');
		state.selectBean({ path: 'test.md', name: '첼로', roaster: 'LULL', status: 'active', roastDate: '2026-02-20' });
		state.updateVariables({ grindSize: 2.6, dose: 18, waterTemp: 96, filter: '하이플럭스' });
		state.startBrewing();
		state.finishBrewing(180.5, 282);
		const record = state.buildRecord();
		expect(record.method).toBe('filter');
		expect(record.bean).toBe('첼로');
		expect(record.grindSize).toBe(2.6);
		expect((record as any).waterTemp).toBe(96);
		
	});
});
