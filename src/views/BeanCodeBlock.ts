import type { App, MarkdownPostProcessorContext } from 'obsidian';
import type { VaultDataService } from '../services/VaultDataService';
import type { BeanInfo } from '../brew/types';

export class BeanCodeBlock {
	private containers: WeakRef<HTMLElement>[] = [];

	constructor(
		private app: App,
		private vaultData: VaultDataService,
	) {}

	register(registerFn: (lang: string, handler: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void) => void): void {
		registerFn('beans', (_source, el, _ctx) => {
			this.containers.push(new WeakRef(el));
			this.render(el);
		});
	}

	refreshAll(): void {
		this.containers = this.containers.filter(ref => {
			const el = ref.deref();
			if (!el || !el.isConnected) return false;
			this.render(el);
			return true;
		});
	}

	render(el: HTMLElement): void {
		el.empty();
		el.addClass('bean-hub');

		const header = el.createDiv({ cls: 'bean-hub-header' });
		const newBtn = header.createEl('button', { text: '+ 새 원두', cls: 'bean-hub-btn bean-hub-new-btn' });
		newBtn.addEventListener('click', () => this.createNewBean());

		const beans = this.vaultData.getAllBeans();
		const active = [...beans.filter(b => b.status === 'active')].sort((a, b) => a.name.localeCompare(b.name));
		const finished = [...beans.filter(b => b.status === 'finished')].sort((a, b) => a.name.localeCompare(b.name));

		if (active.length > 0) {
			el.createDiv({ cls: 'bean-hub-section-title', text: '현재 보유 원두' });
			for (const bean of active) this.renderActiveRow(el, bean);
		}

		if (finished.length > 0) {
			el.createDiv({ cls: 'bean-hub-section-title bean-hub-section-past', text: '과거 원두' });
			for (const bean of finished) this.renderFinishedRow(el, bean);
		}

		if (beans.length === 0) {
			el.createDiv({ cls: 'bean-hub-empty', text: 'type: bean frontmatter가 있는 노트가 없어요' });
		}
	}

	private renderActiveRow(container: HTMLElement, bean: BeanInfo): void {
		const row = container.createDiv({ cls: 'bean-hub-row' });

		const nameEl = row.createEl('a', { cls: 'bean-hub-name', text: bean.name });
		nameEl.addEventListener('click', (e) => {
			e.preventDefault();
			this.app.workspace.openLinkText(bean.path, '');
		});

		const days = this.vaultData.getDaysSinceRoast(bean);
		if (days !== null) {
			row.createSpan({ cls: 'bean-hub-days', text: `로스팅 ${days}일차` });
		}

		const actions = row.createDiv({ cls: 'bean-hub-actions' });
		const statusBtn = actions.createEl('button', { text: '소진', cls: 'bean-hub-btn bean-hub-status-btn' });
		statusBtn.addEventListener('click', async () => {
			await this.vaultData.setBeanStatus(bean.path, 'finished');
		});
	}

	private renderFinishedRow(container: HTMLElement, bean: BeanInfo): void {
		const row = container.createDiv({ cls: 'bean-hub-row is-finished' });

		const nameEl = row.createEl('a', { cls: 'bean-hub-name', text: bean.name });
		nameEl.addEventListener('click', (e) => {
			e.preventDefault();
			this.app.workspace.openLinkText(bean.path, '');
		});

		const actions = row.createDiv({ cls: 'bean-hub-actions' });
		const statusBtn = actions.createEl('button', { text: '재구매', cls: 'bean-hub-btn bean-hub-status-btn' });
		statusBtn.addEventListener('click', () => {
			actions.style.display = 'none';

			const dateRow = row.createDiv({ cls: 'bean-hub-date-row' });
			const input = dateRow.createEl('input', { type: 'date' });
			input.value = new Date().toISOString().slice(0, 10);

			const btns = dateRow.createDiv({ cls: 'bean-hub-date-btns' });

			const confirmBtn = btns.createEl('button', { text: '확인', cls: 'bean-hub-btn bean-hub-add-btn' });
			confirmBtn.addEventListener('click', async () => {
				if (!input.value) return;
				await this.vaultData.setRoastDate(bean.path, input.value);
				await this.vaultData.setBeanStatus(bean.path, 'active');
			});

			const cancelBtn = btns.createEl('button', { text: '취소', cls: 'bean-hub-btn' });
			cancelBtn.addEventListener('click', () => {
				dateRow.remove();
				actions.style.display = '';
			});
		});
	}

	private async createNewBean(): Promise<void> {
		const folder = '3. Resources';
		let name = '새 원두';
		let path = `${folder}/${name}.md`;
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(path)) {
			counter++;
			name = `새 원두 ${counter}`;
			path = `${folder}/${name}.md`;
		}

		const template = [
			'---',
			'type: bean',
			'roaster:',
			'status: active',
			'roast_date:',
			'---',
			'',
			'### [[원두 데이터|원두 데이터로 돌아가기]]',
			'',
			'```brews',
			'```',
			'',
		].join('\n');

		await this.app.vault.create(path, template);
		await this.app.workspace.openLinkText(path, '');
	}
}
