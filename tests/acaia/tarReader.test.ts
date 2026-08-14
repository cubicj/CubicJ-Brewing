import { describe, expect, it } from 'vitest';
import { readTar, TarFormatError } from '../../src/acaia/tarReader';
import { buildTar, buildTarHeader } from '../helpers/tarFixture';

const text = (s: string) => new TextEncoder().encode(s);

describe('readTar', () => {
	it('reads directories and files with content', () => {
		const tar = buildTar([
			{ path: 'noble/', type: 'dir' },
			{ path: 'noble/package.json', type: 'file', data: text('{"version":"2.3.16"}') },
			{ path: 'noble/lib/', type: 'dir' },
			{ path: 'noble/lib/index.js', type: 'file', data: text('module.exports = 1;') },
		]);
		const entries = readTar(tar, { root: 'noble/' });
		expect(entries.map((e) => [e.path, e.type])).toEqual([
			['noble/', 'dir'],
			['noble/package.json', 'file'],
			['noble/lib/', 'dir'],
			['noble/lib/index.js', 'file'],
		]);
		expect(new TextDecoder().decode(entries[1].data)).toBe('{"version":"2.3.16"}');
	});

	it('joins the ustar prefix field for long paths', () => {
		const longPath =
			'noble/node_modules/@stoprocent/bluetooth-hci-socket/prebuilds/darwin-x64+arm64/@stoprocent+bluetooth-hci-socket.node';
		const tar = buildTar([{ path: longPath, type: 'file', data: text('bin') }]);
		const entries = readTar(tar, { root: 'noble/' });
		expect(entries[0].path).toBe(longPath);
	});

	it('handles file data that is not a multiple of 512', () => {
		const data = new Uint8Array(700).fill(7);
		const tar = buildTar([{ path: 'noble/a.bin', type: 'file', data }]);
		const entries = readTar(tar, { root: 'noble/' });
		expect(entries[0].data.length).toBe(700);
		expect(entries[0].data[699]).toBe(7);
	});

	it('rejects entries outside the root', () => {
		const tar = buildTar([{ path: 'other/file.js', type: 'file', data: text('x') }]);
		expect(() => readTar(tar, { root: 'noble/' })).toThrow(TarFormatError);
	});

	it('rejects paths that only share the root prefix', () => {
		const tar = buildTar([{ path: 'noble-evil/file.js', type: 'file', data: text('x') }]);
		expect(() => readTar(tar, { root: 'noble' })).toThrow(TarFormatError);
	});

	it('rejects path traversal', () => {
		const tar = buildTar([{ path: 'noble/../../evil.js', type: 'file', data: text('x') }]);
		expect(() => readTar(tar, { root: 'noble/' })).toThrow(TarFormatError);
	});

	it('rejects absolute paths', () => {
		const tar = buildTar([{ path: '/noble/a.js', type: 'file', data: text('x') }]);
		expect(() => readTar(tar, { root: 'noble/' })).toThrow(TarFormatError);
	});

	it('rejects unsupported entry types', () => {
		const header = buildTarHeader({ path: 'noble/link', type: 'file' }, { typeflag: '2' });
		const tar = new Uint8Array(header.length + 1024);
		tar.set(header);
		expect(() => readTar(tar, { root: 'noble/' })).toThrow(TarFormatError);
	});

	it('rejects a corrupted header checksum', () => {
		const header = buildTarHeader({ path: 'noble/a.js', type: 'file' }, { checksum: 1 });
		const tar = new Uint8Array(header.length + 1024);
		tar.set(header);
		expect(() => readTar(tar, { root: 'noble/' })).toThrow(TarFormatError);
	});

	it('rejects a non-ustar header', () => {
		const header = buildTarHeader({ path: 'noble/a.js', type: 'file' }, { magic: 'notar\0' });
		const tar = new Uint8Array(header.length + 1024);
		tar.set(header);
		expect(() => readTar(tar, { root: 'noble/' })).toThrow(TarFormatError);
	});

	it('rejects malformed size octal', () => {
		const header = buildTarHeader({ path: 'noble/a.js', type: 'file' }, { size: '00000000008\0' });
		const tar = new Uint8Array(header.length + 1024);
		tar.set(header);
		expect(() => readTar(tar, { root: 'noble/' })).toThrow('invalid octal field at 124');
	});

	it('rejects invalid size bytes after the terminator', () => {
		const header = buildTarHeader({ path: 'noble/a.js', type: 'file' }, { size: '0000000000\0X' });
		const tar = new Uint8Array(header.length + 1024);
		tar.set(header);
		expect(() => readTar(tar, { root: 'noble/' })).toThrow('invalid octal field at 124');
	});

	it('rejects malformed checksum octal', () => {
		const header = buildTarHeader({ path: 'noble/a.js', type: 'file' }, { checksumText: '000008' });
		const tar = new Uint8Array(header.length + 1024);
		tar.set(header);
		expect(() => readTar(tar, { root: 'noble/' })).toThrow('invalid octal field at 148');
	});

	it('rejects a truncated archive', () => {
		const full = buildTar([{ path: 'noble/a.bin', type: 'file', data: new Uint8Array(600) }]);
		const truncated = full.slice(0, 700);
		expect(() => readTar(truncated, { root: 'noble/' })).toThrow(TarFormatError);
	});
});
