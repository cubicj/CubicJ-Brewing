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
