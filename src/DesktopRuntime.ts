import { Platform, type FileSystemAdapter } from 'obsidian';
import type { BleLogger } from './acaia/AcaiaService';
import type CubicJBrewingPlugin from './main';
import { t } from './i18n/index';

export class DesktopRuntime {
	private beforeUnloadHandler: (() => void) | null = null;
	private viewType: string | null = null;

	constructor(private plugin: CubicJBrewingPlugin) {}

	async init(): Promise<void> {
		if (!Platform.isDesktop) return;
		const { AcaiaService } = await import('./acaia/AcaiaService');
		const { BrewingView, VIEW_TYPE_BREWING } = await import('./views/BrewingView');
		const { createNobleInstaller, isNobleModuleLoaded } = await import('./acaia/NobleInstaller');
		const basePath = (this.plugin.app.vault.adapter as FileSystemAdapter).getBasePath();
		const path = require('path') as typeof import('path');
		const noblePath = path.join(basePath, this.plugin.manifest.dir as string, 'noble');
		this.plugin.nobleInstaller = createNobleInstaller(this.plugin, () => isNobleModuleLoaded(noblePath));
		this.viewType = VIEW_TYPE_BREWING;

		let logger: BleLogger | undefined;
		if (this.plugin.pluginLogger) {
			const pl = this.plugin.pluginLogger;
			logger = { log: (msg: string) => pl.log('BLE', msg) };
		}

		this.plugin.acaiaService = new AcaiaService({ logger, noblePath });

		this.plugin.beanBlock.setScaleWeightGetter(() => {
			if (this.plugin.acaiaService?.state !== 'connected') return null;
			return this.plugin.acaiaService.lastWeight;
		});

		this.plugin.registerView(VIEW_TYPE_BREWING, (leaf) => new BrewingView(leaf, this.plugin));

		const getView = (): InstanceType<typeof BrewingView> | null => {
			const leaves = this.plugin.app.workspace.getLeavesOfType(VIEW_TYPE_BREWING);
			return leaves.length > 0 ? (leaves[0].view as InstanceType<typeof BrewingView>) : null;
		};

		this.plugin.addCommand({
			id: 'open-view',
			name: t('command.openView'),
			callback: () => void this.activateView(),
		});

		this.plugin.addCommand({
			id: 'tare',
			name: t('command.tare'),
			checkCallback: (checking) => {
				const view = getView();
				if (!view) return false;
				if (!checking) view.tare();
				return true;
			},
		});

		const doAutoFill = () => {
			const popoverBtn = document.querySelector<HTMLButtonElement>('.bwp-auto');
			if (popoverBtn) {
				popoverBtn.click();
				return;
			}
			getView()?.autoFill();
		};

		this.plugin.addCommand({
			id: 'auto-fill',
			name: t('command.autoFill'),
			checkCallback: (checking) => {
				const view = getView();
				const hasPopover = !!document.querySelector('.bean-weight-popover');
				if (!view && !hasPopover) return false;
				if (!checking) doAutoFill();
				return true;
			},
		});

		this.plugin.addCommand({
			id: 'toggle-brewing',
			name: t('command.toggleBrewing'),
			checkCallback: (checking) => {
				const view = getView();
				if (!view) return false;
				if (!checking) view.toggleBrewing();
				return true;
			},
		});

		this.plugin.addCommand({
			id: 'toggle-timer',
			name: t('command.toggleTimer'),
			checkCallback: (checking) => {
				const view = getView();
				if (!view || this.plugin.acaiaService?.state !== 'connected') return false;
				if (!checking) view.toggleTimer();
				return true;
			},
		});

		this.plugin.addCommand({
			id: 'toggle-connect',
			name: t('command.toggleConnect'),
			checkCallback: (checking) => {
				const view = getView();
				if (!view) return false;
				if (!checking) void view.toggleConnect();
				return true;
			},
		});

		this.plugin.addCommand({
			id: 'power-off-scale',
			name: t('command.powerOff'),
			checkCallback: (checking) => {
				const view = getView();
				if (!view || this.plugin.acaiaService?.state !== 'connected') return false;
				if (!checking) view.powerOff();
				return true;
			},
		});

		this.plugin.addRibbonIcon('coffee', 'CubicJ Brewing', () => {
			void this.activateView();
		});

		this.beforeUnloadHandler = () => this.teardown(false);
		window.addEventListener('beforeunload', this.beforeUnloadHandler);
	}

	async activateView(): Promise<void> {
		if (!this.viewType) return;
		const leaves = this.plugin.app.workspace.getLeavesOfType(this.viewType);
		if (leaves.length === 0) {
			const leaf = this.plugin.app.workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: this.viewType, active: true });
		}
		const target = this.plugin.app.workspace.getLeavesOfType(this.viewType)[0];
		if (target) await this.plugin.app.workspace.revealLeaf(target);
	}

	destroy(): void {
		this.teardown(true);
	}

	private teardown(removeListener: boolean): void {
		if (removeListener && this.beforeUnloadHandler) {
			window.removeEventListener('beforeunload', this.beforeUnloadHandler);
			this.beforeUnloadHandler = null;
		}
		this.plugin.acaiaService?.destroy();
		void this.plugin.pluginLogger?.stop();
	}
}
