export interface StepperConfig {
	label: string;
	initial: number;
	min: number;
	max: number;
	step: number;
	format: (v: number) => string;
	pxPerStep: number;
	onChange?: (v: number) => void;
}

export function createStepper(container: HTMLElement, config: StepperConfig): { getValue: () => number; setValue: (v: number) => void } {
	let value = config.initial;
	const group = container.createDiv({ cls: 'brew-flow-stepper' });
	group.createEl('label', { text: config.label });
	const controls = group.createDiv({ cls: 'brew-flow-stepper-controls' });

	const precision = Math.max(0, -Math.floor(Math.log10(config.step)));
	const round = (v: number) => parseFloat(v.toFixed(precision));
	const clamp = (v: number) => Math.max(config.min, Math.min(config.max, round(v)));
	const display = controls.createDiv({ cls: 'brew-flow-stepper-value is-draggable' });
	let initialized = false;
	const update = () => { display.textContent = config.format(value); if (initialized) config.onChange?.(value); };

	const decBtn = controls.createEl('button', { text: '◀', cls: 'brew-flow-stepper-btn' });
	controls.insertBefore(decBtn, display);
	decBtn.addEventListener('click', () => { value = clamp(value - config.step); update(); });

	update();
	initialized = true;

	const incBtn = controls.createEl('button', { text: '▶', cls: 'brew-flow-stepper-btn' });
	incBtn.addEventListener('click', () => { value = clamp(value + config.step); update(); });

	let dragStartX = 0;
	let dragStartVal = 0;
	let dragged = false;
	const onMove = (e: MouseEvent) => {
		const dx = e.clientX - dragStartX;
		if (Math.abs(dx) > 3) dragged = true;
		const raw = dragStartVal + (dx / config.pxPerStep) * config.step;
		value = clamp(Math.round(raw / config.step) * config.step);
		update();
	};
	const onUp = () => {
		document.removeEventListener('mousemove', onMove);
		document.removeEventListener('mouseup', onUp);
		display.removeClass('is-dragging');
	};
	display.addEventListener('mousedown', (e: MouseEvent) => {
		e.preventDefault();
		dragStartX = e.clientX;
		dragStartVal = value;
		dragged = false;
		display.addClass('is-dragging');
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	});

	let editing = false;
	display.addEventListener('dblclick', () => {
		if (editing) return;
		editing = true;
		const input = document.createElement('input');
		input.type = 'number';
		input.step = 'any';
		input.value = String(value);
		input.className = 'brew-flow-stepper-input';
		display.textContent = '';
		display.appendChild(input);
		input.focus();
		input.select();
		const commit = () => {
			if (!editing) return;
			editing = false;
			const parsed = parseFloat(input.value);
			if (!isNaN(parsed)) value = clamp(parsed);
			input.remove();
			update();
		};
		input.addEventListener('blur', commit);
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') commit();
			if (e.key === 'Escape') { editing = false; input.remove(); update(); }
		});
	});

	return {
		getValue: () => value,
		setValue: (v: number) => { value = clamp(v); update(); },
	};
}
