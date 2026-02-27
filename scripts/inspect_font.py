from fontTools.ttLib import TTFont

font = TTFont('fonts/MatrixSansPrint-Regular.woff2')
cmap = font.getBestCmap()
zero_glyph = cmap[ord('0')]
O_glyph = cmap[ord('O')]
print(f'0 -> {zero_glyph}')
print(f'O -> {O_glyph}')

gsub = font.get('GSUB')
if gsub:
    for feat in gsub.table.FeatureList.FeatureRecord:
        print(f'Feature: {feat.FeatureTag}')
else:
    print('No GSUB table')
