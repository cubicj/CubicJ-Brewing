"""Verify the 4x6 font has correct dot positions."""
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.boundsPen import BoundsPen

font = TTFont('fonts/MatrixSansPrint4x6-Regular.woff2')
cmap = font.getBestCmap()
glyph_set = font.getGlyphSet()
hmtx = font['hmtx']

for ch in '0123456789:.-':
    gname = cmap[ord(ch)]
    width = hmtx[gname][0]

    rec = RecordingPen()
    glyph_set[gname].draw(rec)
    moves = [args[0] for op, args in rec.value if op == 'moveTo']

    bp = BoundsPen(glyph_set)
    glyph_set[gname].draw(bp)
    bounds = bp.bounds

    print(f'{ch} ({gname}): width={width}, dots={len(moves)}, bounds={bounds}')

    # Verify against original MatrixSansPrint 5x7
    orig = TTFont('fonts/MatrixSansPrint-Regular.woff2')
    orig_gs = orig.getGlyphSet()
    orig_rec = RecordingPen()
    orig_gs[gname].draw(orig_rec)
    orig_moves = [args[0] for op, args in orig_rec.value if op == 'moveTo']
    print(f'  (orig had {len(orig_moves)} dots)')
