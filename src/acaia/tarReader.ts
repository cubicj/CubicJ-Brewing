export interface TarEntry {
	path: string;
	type: 'file' | 'dir';
	data: Uint8Array;
}

export class TarFormatError extends Error {}

const BLOCK = 512;

function readText(bytes: Uint8Array, offset: number, length: number): string {
	let end = offset;
	const max = offset + length;
	while (end < max && bytes[end] !== 0) end++;
	return new TextDecoder().decode(bytes.subarray(offset, end));
}

function readOctal(bytes: Uint8Array, offset: number, length: number): number {
	const end = offset + length;
	let cursor = offset;
	let value = 0;
	while (cursor < end && bytes[cursor] >= 0x30 && bytes[cursor] <= 0x37) {
		value = value * 8 + bytes[cursor] - 0x30;
		cursor++;
	}
	if (cursor === offset) throw new TarFormatError(`invalid octal field at ${offset}`);
	if (cursor < end) {
		if (bytes[cursor] !== 0 && bytes[cursor] !== 0x20) {
			throw new TarFormatError(`invalid octal field at ${offset}`);
		}
		cursor++;
	}
	while (cursor < end) {
		if (bytes[cursor] !== 0 && bytes[cursor] !== 0x20) {
			throw new TarFormatError(`invalid octal field at ${offset}`);
		}
		cursor++;
	}
	return value;
}

function isZeroBlock(bytes: Uint8Array, offset: number): boolean {
	for (let i = offset; i < offset + BLOCK; i++) {
		if (bytes[i] !== 0) return false;
	}
	return true;
}

function verifyChecksum(bytes: Uint8Array, offset: number): void {
	const stored = readOctal(bytes, offset + 148, 8);
	let sum = 0;
	for (let i = 0; i < BLOCK; i++) {
		sum += i >= 148 && i < 156 ? 0x20 : bytes[offset + i];
	}
	if (sum !== stored) throw new TarFormatError('header checksum mismatch');
}

function verifyMagic(bytes: Uint8Array, offset: number): void {
	const magic = [0x75, 0x73, 0x74, 0x61, 0x72, 0];
	for (let i = 0; i < magic.length; i++) {
		if (bytes[offset + 257 + i] !== magic[i]) throw new TarFormatError('invalid ustar magic');
	}
}

function validatePath(path: string, root: string): void {
	if (path.includes('\\')) throw new TarFormatError(`backslash in path: ${path}`);
	if (path.startsWith('/')) throw new TarFormatError(`absolute path: ${path}`);
	if (path.split('/').includes('..')) throw new TarFormatError(`path traversal: ${path}`);
	const normalizedRoot = root.replace(/\/+$/, '');
	if (path !== normalizedRoot && !path.startsWith(`${normalizedRoot}/`)) {
		throw new TarFormatError(`path outside ${root}: ${path}`);
	}
}

export function readTar(bytes: Uint8Array, options: { root: string }): TarEntry[] {
	const entries: TarEntry[] = [];
	let offset = 0;
	while (offset + BLOCK <= bytes.length) {
		if (isZeroBlock(bytes, offset)) return entries;
		verifyChecksum(bytes, offset);
		verifyMagic(bytes, offset);
		const name = readText(bytes, offset, 100);
		const prefix = readText(bytes, offset + 345, 155);
		const path = prefix ? `${prefix}/${name}` : name;
		const size = readOctal(bytes, offset + 124, 12);
		const typeByte = bytes[offset + 156];
		const typeflag = typeByte === 0 ? '0' : String.fromCharCode(typeByte);
		validatePath(path, options.root);
		offset += BLOCK;
		if (typeflag === '5') {
			entries.push({ path, type: 'dir', data: new Uint8Array(0) });
			continue;
		}
		if (typeflag !== '0') throw new TarFormatError(`unsupported entry type '${typeflag}': ${path}`);
		const dataEnd = offset + size;
		const paddedEnd = offset + Math.ceil(size / BLOCK) * BLOCK;
		if (paddedEnd > bytes.length) throw new TarFormatError(`truncated archive at ${path}`);
		entries.push({ path, type: 'file', data: bytes.slice(offset, dataEnd) });
		offset = paddedEnd;
	}
	throw new TarFormatError('missing end-of-archive marker');
}
