from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.boundsPen import BoundsPen

font = TTFont('fonts/MatrixSansPrint-Regular.woff2')
cmap = font.getBestCmap()
glyph_set = font.getGlyphSet()
hmtx = font['hmtx']

for ch in '1089:.- ':
    if ord(ch) not in cmap:
        print(f'{ch}: not in cmap')
        continue
    gname = cmap[ord(ch)]
    width = hmtx[gname][0]
    lsb = hmtx[gname][1]

    bp = BoundsPen(glyph_set)
    glyph_set[gname].draw(bp)
    bounds = bp.bounds

    rec = RecordingPen()
    glyph_set[gname].draw(rec)
    moves = [(op, args) for op, args in rec.value if op == 'moveTo']
    print(f'{ch} ({gname}): width={width}, lsb={lsb}, bounds={bounds}, dots={len(moves)}')

    # For '1', show all operations to understand circle construction
    if ch == '1':
        for op_name, args in rec.value:
            print(f'  {op_name} {args}')

print()
print('--- UPM and metrics ---')
print(f"unitsPerEm: {font['head'].unitsPerEm}")
print(f"ascender: {font['hhea'].ascent}")
print(f"descender: {font['hhea'].descent}")
