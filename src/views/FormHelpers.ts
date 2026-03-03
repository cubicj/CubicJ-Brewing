export function createToggleGroup<T extends string>(
	container: HTMLElement,
	items: { value: T; label: string }[],
	selected: T | null,
	onChange: (value: T | null) => void,
): HTMLElement[] {
	const group = container.createDiv({ cls: 'brew-flow-toggle-group' });
	const buttons: HTMLElement[] = [];

	for (const item of items) {
		const btn = group.createDiv({ cls: 'brew-flow-toggle', text: item.label });
		if (item.value === selected) btn.addClass('is-active');
		btn.addEventListener('click', () => {
			const deselecting = btn.hasClass('is-active');
			buttons.forEach(b => b.removeClass('is-active'));
			if (deselecting) {
				onChange(null);
			} else {
				btn.addClass('is-active');
				onChange(item.value);
			}
		});
		buttons.push(btn);
	}

	return buttons;
}

export function createSelectField(
	container: HTMLElement,
	label: string,
	options: string[],
	selected: string,
	onChange: (value: string) => void,
): HTMLSelectElement {
	const group = container.createDiv({ cls: 'brew-flow-field' });
	group.createEl('label', { text: label });
	const select = group.createEl('select');
	for (const opt of options) {
		select.createEl('option', { text: opt, value: opt });
	}
	select.value = selected;
	select.addEventListener('change', () => onChange(select.value));
	return select;
}

export function attachScaleAutoBtn(
	stepper: { el: HTMLElement; setValue(v: number): void },
	getWeightText: () => string,
): void {
	const label = stepper.el.querySelector('label') as HTMLElement;
	const btn = label.createEl('button', {
		text: 'auto', cls: 'brew-flow-stepper-scale-btn',
		attr: { 'aria-label': '저울 무게 가져오기' },
	});
	btn.addEventListener('click', () => {
		const w = parseFloat(getWeightText());
		if (!isNaN(w)) stepper.setValue(w);
	});
}

export function createAccessoryChecklist(
	container: HTMLElement,
	accessories: string[],
	initial: string[],
	onChange?: (selected: string[]) => void,
): Set<string> {
	const group = container.createDiv({ cls: 'brew-flow-accessories' });
	group.createEl('label', { text: '악세서리' });
	const selected = new Set(initial);
	for (const acc of accessories) {
		const row = group.createDiv({ cls: 'brew-flow-accessory-item' });
		const cb = row.createEl('input', { type: 'checkbox' });
		cb.checked = selected.has(acc);
		row.createSpan({ text: acc });
		cb.addEventListener('change', () => {
			if (cb.checked) selected.add(acc);
			else selected.delete(acc);
			onChange?.([...selected]);
		});
		row.addEventListener('click', (e) => {
			if (e.target !== cb) cb.click();
		});
	}
	return selected;
}
