import { Notice } from 'obsidian';
import { t } from '../../i18n/index';

export interface SortableListControllerOptions<T> {
	listEl: HTMLElement;
	items: T[];
	renderItems: () => void;
	saveEquipment: () => Promise<void>;
}

interface ActiveDrag {
	cancel: () => void;
}

export class SortableListController<T> {
	private abortController = new AbortController();
	private activeDrag: ActiveDrag | null = null;
	private active = false;
	private disposed = false;

	constructor(private options: SortableListControllerOptions<T>) {
		options.listEl.addEventListener('pointerdown', (event) => this.handlePointerDown(event), {
			signal: this.abortController.signal,
		});
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.abortController.abort();
		this.activeDrag?.cancel();
		this.activeDrag = null;
		this.active = false;
	}

	private handlePointerDown(event: PointerEvent): void {
		if (this.disposed || this.active) return;
		const { listEl, items, renderItems, saveEquipment } = this.options;
		const row = (event.target as HTMLElement).closest<HTMLElement>('.dm-equip-row');
		if (!row || (event.target as HTMLElement).closest('.dm-equip-del-btn, .dm-equip-edit-btn')) return;

		const rows = Array.from(listEl.querySelectorAll<HTMLElement>('.dm-equip-row'));
		const dragIdx = rows.indexOf(row);
		if (dragIdx === -1 || rows.length < 2) return;
		this.active = true;

		const startY = event.clientY;
		const rowHeight = row.getBoundingClientRect().height;
		const gap = rows.length > 1 ? rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().bottom : 0;
		const stride = rowHeight + gap;
		const minDy = -dragIdx * stride;
		const maxDy = (rows.length - 1 - dragIdx) * stride;
		let dragging = false;
		let hoverIdx = dragIdx;
		let dy = 0;
		let cleaned = false;
		let cleanupTimer: number | undefined;

		const updateTransforms = (currentIdx: number) => {
			for (let i = 0; i < rows.length; i++) {
				if (i === dragIdx) continue;
				let shift = 0;
				if (dragIdx < currentIdx && i > dragIdx && i <= currentIdx) shift = -stride;
				else if (dragIdx > currentIdx && i >= currentIdx && i < dragIdx) shift = stride;
				rows[i].setCssProps({ transform: shift ? `translateY(${shift}px)` : '' });
			}
		};

		const clearVisualState = (rerender: boolean) => {
			if (cleaned) return;
			cleaned = true;
			if (cleanupTimer !== undefined) window.clearTimeout(cleanupTimer);
			row.removeEventListener('transitionend', onTransitionEnd);
			for (const currentRow of rows) {
				currentRow.setCssProps({ transition: '', transform: '' });
			}
			row.removeClass('is-dragging');
			this.active = false;
			this.activeDrag = null;
			if (rerender && hoverIdx !== dragIdx) renderItems();
		};

		const removeDocumentListeners = () => {
			document.removeEventListener('pointermove', onMove);
			document.removeEventListener('pointerup', onPointerUp);
		};

		const onTransitionEnd = () => clearVisualState(true);

		const onMove = (moveEvent: PointerEvent) => {
			dy = Math.max(minDy, Math.min(maxDy, moveEvent.clientY - startY));
			if (!dragging) {
				if (Math.abs(dy) < 5) return;
				dragging = true;
				row.addClass('is-dragging');
				for (const currentRow of rows) {
					if (currentRow !== row) currentRow.setCssProps({ transition: 'transform 200ms ease' });
				}
			}

			row.setCssProps({ transform: `translateY(${dy}px)` });
			let newIdx = dragIdx + Math.round(dy / stride);
			newIdx = Math.max(0, Math.min(rows.length - 1, newIdx));
			if (newIdx !== hoverIdx) {
				hoverIdx = newIdx;
				updateTransforms(hoverIdx);
			}
		};

		const onUp = async () => {
			removeDocumentListeners();
			if (this.disposed || !dragging) {
				clearVisualState(false);
				return;
			}

			const finalY = (hoverIdx - dragIdx) * stride;
			row.setCssProps({ transition: 'transform 200ms ease', transform: `translateY(${finalY}px)` });

			if (hoverIdx !== dragIdx) {
				const [item] = items.splice(dragIdx, 1);
				items.splice(hoverIdx, 0, item);
				try {
					await saveEquipment();
				} catch (err) {
					console.error('[DataManageModal] equipment reorder failed:', err);
					new Notice(t('error.equipSave'));
				}
			}

			if (this.disposed) return;
			row.addEventListener('transitionend', onTransitionEnd, { once: true });
			cleanupTimer = window.setTimeout(onTransitionEnd, 250);
		};
		const onPointerUp = () => {
			void onUp();
		};

		this.activeDrag = {
			cancel: () => {
				removeDocumentListeners();
				clearVisualState(false);
			},
		};

		document.addEventListener('pointermove', onMove, { signal: this.abortController.signal });
		document.addEventListener('pointerup', onPointerUp, { signal: this.abortController.signal });
	}
}
