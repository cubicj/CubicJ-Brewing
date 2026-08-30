export const NOBLE_BUNDLE_VERSION = '2.8.0';
export const NOBLE_BUNDLE_SHA256 = '9b8b8e8e1481f2c00a5062d5cdde6d4db8b94dab66aaa28b2018faf7e444f5eb';
export const NOBLE_BUNDLE_ASSET = 'noble.tar.gz';

export function nobleBundleUrl(pluginVersion: string): string {
	return `https://github.com/cubicj/CubicJ-Brewing/releases/download/${pluginVersion}/${NOBLE_BUNDLE_ASSET}`;
}
