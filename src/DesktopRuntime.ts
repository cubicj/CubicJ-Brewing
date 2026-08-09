import type { BleLogger } from './acaia/AcaiaService';
import type { FileLogger } from './utils/FileLogger';
import type CubicJBrewingPlugin from './main';
import { t } from './i18n/index';

export class DesktopRuntime {
	private beforeUnloadHandler: (() => void) | null = null;
	private blePacketLogger: FileLogger | null = null;
	private viewType: string | null = null;

	constructor(private plugin: CubicJBrewingPlugin) {}

	async init(): Promise<void> {
		const { AcaiaService } = await import('./acaia/AcaiaService');
		const { BrewingView, VIEW_TYPE_BREWING } = await import('./views/BrewingView');
		this.viewType = VIEW_TYPE_BREWING;

		const vaultAdapter = {
			read: async (p: string) => this.plugin.app.vault.adapter.read(p),
			write: async (p: string, c: string) => this.plugin.app.vault.adapter.write(p, c),
		};

		let logger: BleLogger | undefined;
		if (this.plugin.pluginLogger) {
			const pl = this.plugin.pluginLogger;
			logger = { log: (msg: string) => pl.log('BLE', msg) };
		}

		if (this.plugin.getLogConfig().packetLog) {
			const { FileLogger } = await import('./utils/FileLogger');
			this.blePacketLogger = new FileLogger(
				vaultAdapter,
				`${this.plugin.manifest.dir}/ble-debug.log`,
				1000,
				5000,
			);
			this.blePacketLogger.start();
			this.blePacketLogger.log(`\n=== session ${new Date().toISOString()} ===`);
		}

		const basePath = (this.plugin.app.vault.adapter as any).getBasePath();
		const noblePath = require('path').join(basePath, this.plugin.manifest.dir, 'noble');
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
			callback: () => this.activateView(),
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
			const popoverBtn = document.querySelector('.bwp-auto') as HTMLButtonElement | null;
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
			id: 'toggle-connect',
			name: t('command.toggleConnect'),
			checkCallback: (checking) => {
				const view = getView();
				if (!view) return false;
				if (!checking) view.toggleConnect();
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
			this.activateView();
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
		if (target) this.plugin.app.workspace.revealLeaf(target);
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
		this.plugin.pluginLogger?.stop();
		this.blePacketLogger?.stop();
	}
}
