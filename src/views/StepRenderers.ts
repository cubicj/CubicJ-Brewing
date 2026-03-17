import type CubicJBrewingPlugin from '../main';
import type { BrewFlowState } from '../brew/BrewFlowState';
import type { BrewFlowSelection, EquipmentSettings } from '../brew/types';
import type { TimerController } from './TimerController';
import { formatTimer } from './TimerController';
import type { BrewProfileRecorder } from './BrewProfileRecorder';
import type { BrewProfileStorage } from '../services/BrewProfileStorage';
import { getDrinkLabel, getMethodLabel, getTempLabel, calcRoastDays } from '../brew/constants';
import { t } from '../i18n/index';
import { renderMethod } from './steps/renderMethod';
import { renderBean } from './steps/renderBean';
import { renderConfigure } from './steps/renderConfigure';
import { renderBrewing } from './steps/renderBrewing';
import { renderSaving, cleanupSavingRo } from './steps/renderSaving';

export { cleanupSavingRo };

export type FlowStep = 'method' | 'bean' | 'configure' | 'brewing' | 'saving';

export const STEP_CONFIG: Array<{ step: FlowStep; label: () => string }> = [
	{ step: 'method', label: () => t('brew.step.method') },
	{ step: 'bean', label: () => t('brew.step.bean') },
	{ step: 'configure', label: () => t('brew.step.variables') },
	{ step: 'brewing', label: () => t('brew.step.brewing') },
	{ step: 'saving', label: () => t('brew.step.memo') },
];

export const STEP_ORDER: FlowStep[] = STEP_CONFIG.map((c) => c.step);

export interface AccordionActions {
	update: () => void;
	expand: (step: FlowStep) => void;
	animateContentChange: (step: FlowStep, fn: () => void) => void;
	updateSummaries: () => void;
}

export interface StepRenderContext {
	flowState: BrewFlowState;
	plugin: CubicJBrewingPlugin;
	renderContent: () => void;
	accordion: AccordionActions;
	timerController: TimerController;
	getWeightText: () => string;
	resetFlow: () => void;
	recorder: BrewProfileRecorder;
	profileStorage: BrewProfileStorage;
	equipment: EquipmentSettings;
	brewingStarted: boolean;
}

export function renderStep(step: FlowStep, container: HTMLElement, ctx: StepRenderContext): void {
	switch (step) {
		case 'method':
			renderMethod(container, ctx);
			break;
		case 'bean':
			renderBean(container, ctx);
			break;
		case 'configure':
			renderConfigure(container, ctx);
			break;
		case 'brewing':
			renderBrewing(container, ctx);
			break;
		case 'saving':
			renderSaving(container, ctx);
			break;
	}
}

export function getStepSummary(step: FlowStep, sel: BrewFlowSelection): string {
	switch (step) {
		case 'method': {
			if (!sel.method) return '';
			const parts = [getMethodLabel(sel.method), getTempLabel(sel.temp!)];
			if (sel.drink) parts.push(getDrinkLabel(sel.drink));
			return parts.join(' · ');
		}
		case 'bean': {
			if (!sel.bean) return '';
			const parts = [sel.bean.name];
			const days = calcRoastDays(sel.bean.roastDate);
			if (days != null && days >= 0) parts.push(t('bean.roastDays', { n: days }));
			return parts.join(' · ');
		}
		case 'configure': {
			if (sel.grindSize == null) return '';
			const fmt = (v: number) => parseFloat(v.toFixed(2));
			const parts: string[] = [
				`${t('summary.grindSize')} ${fmt(sel.grindSize!)}`,
				`${t('summary.dose')} ${fmt(sel.dose!)}g`,
			];
			if (sel.method === 'filter' && sel.waterTemp) parts.push(`${sel.waterTemp}°C`);
			return parts.join(' · ');
		}
		case 'brewing': {
			const parts: string[] = [];
			if (sel.time) parts.push(formatTimer(sel.time));
			if (sel.yield) parts.push(`${sel.yield}g`);
			return parts.join(' / ');
		}
		case 'saving':
			return '';
	}
}
