export const NOBLE_BUNDLE_VERSION = '2.3.16';
export const NOBLE_BUNDLE_SHA256 = '93385e24c453d4fde5182da0e7442df450a19337bf15d141c511dc1aeff3c5ee';
export const NOBLE_BUNDLE_ASSET = 'noble.tar.gz';

export function nobleBundleUrl(pluginVersion: string): string {
	return `https://github.com/cubicj/CubicJ-Brewing/releases/download/v${pluginVersion}/${NOBLE_BUNDLE_ASSET}`;
}
