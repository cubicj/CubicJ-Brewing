declare const require: ((id: string) => unknown) | undefined;

export function nodeRequire(id: string): unknown {
	const electronRequire =
		typeof window !== 'undefined' ? (window as Window & { require?: (id: string) => unknown }).require : undefined;
	const load = electronRequire ?? (typeof require === 'function' ? require : undefined);
	if (!load) throw new Error(`Node require is unavailable for module: ${id}`);
	return load(id);
}
