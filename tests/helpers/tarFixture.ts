export interface FixtureEntry {
	path: string;
	type: 'file' | 'dir';
	data?: Uint8Array;
}

function writeOctal(header: Uint8Array, offset: number, length: number, value: number): void {
	const text = value.toString(8).padStart(length - 1, '0');
	for (let i = 0; i < text.length; i++) header[offset + i] = text.charCodeAt(i);
	header[offset + length - 1] = 0;
}

function writeText(header: Uint8Array, offset: number, text: string): void {
	for (let i = 0; i < text.length; i++) header[offset + i] = text.charCodeAt(i);
}

export function buildTarHeader(
	entry: FixtureEntry,
	overrides?: { checksum?: number; checksumText?: string; magic?: string; size?: string; typeflag?: string },
): Uint8Array {
	const header = new Uint8Array(512);
	let name = entry.path;
	let prefix = '';
	if (name.length > 100) {
		const cut = name.lastIndexOf('/', 154);
		prefix = name.slice(0, cut);
		name = name.slice(cut + 1);
	}
	writeText(header, 0, name);
	writeOctal(header, 100, 8, entry.type === 'dir' ? 0o755 : 0o644);
	writeOctal(header, 108, 8, 0);
	writeOctal(header, 116, 8, 0);
	writeOctal(header, 124, 12, entry.data?.length ?? 0);
	if (overrides?.size !== undefined) writeText(header, 124, overrides.size);
	writeOctal(header, 136, 12, 0);
	writeText(header, 156, overrides?.typeflag ?? (entry.type === 'dir' ? '5' : '0'));
	writeText(header, 257, overrides?.magic ?? 'ustar\0');
	writeText(header, 263, '00');
	writeText(header, 345, prefix);
	for (let i = 148; i < 156; i++) header[i] = 0x20;
	let sum = overrides?.checksum;
	if (sum === undefined) {
		sum = 0;
		for (let i = 0; i < 512; i++) sum += header[i];
	}
	const chk = overrides?.checksumText ?? sum.toString(8).padStart(6, '0');
	writeText(header, 148, chk);
	header[154] = 0;
	header[155] = 0x20;
	return header;
}

export function buildTar(entries: FixtureEntry[]): Uint8Array {
	const blocks: Uint8Array[] = [];
	for (const entry of entries) {
		blocks.push(buildTarHeader(entry));
		if (entry.type === 'file') {
			const data = entry.data ?? new Uint8Array(0);
			const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
			padded.set(data);
			blocks.push(padded);
		}
	}
	blocks.push(new Uint8Array(1024));
	const total = blocks.reduce((n, b) => n + b.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const b of blocks) {
		out.set(b, offset);
		offset += b.length;
	}
	return out;
}
