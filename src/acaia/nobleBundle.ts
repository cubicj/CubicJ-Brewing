export const NOBLE_BUNDLE_VERSION = '2.3.16';
export const NOBLE_BUNDLE_SHA256 = '';
export const NOBLE_BUNDLE_ASSET = 'noble.tar.gz';

export function nobleBundleUrl(pluginVersion: string): string {
	return `https://github.com/cubicj/CubicJ-Brewing/releases/download/v${pluginVersion}/${NOBLE_BUNDLE_ASSET}`;
}
