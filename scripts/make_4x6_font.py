"""
Generate a true 4×6 dot matrix font for the Pearl S timer display.
Each glyph is built from actual 4-column, 6-row dot patterns.
Dot geometry matches MatrixSansPrint 5×7 (100-unit grid, ~48 unit radius circles).
"""
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
import struct, io

PATTERNS = {
    '0': [
        ' ** ',
        '*  *',
        '*  *',
        '*  *',
        '*  *',
        ' ** ',
    ],
    '1': [
        ' *  ',
        '**  ',
        ' *  ',
        ' *  ',
        ' *  ',
        '*** ',
    ],
    '2': [
        ' ** ',
        '*  *',
        '  * ',
        ' *  ',
        '*   ',
        '****',
    ],
    '3': [
        ' ** ',
        '*  *',
        '  * ',
        '  * ',
        '*  *',
        ' ** ',
    ],
    '4': [
        '  * ',
        ' ** ',
        '* * ',
        '****',
        '  * ',
        '  * ',
    ],
    '5': [
        '****',
        '*   ',
        '*** ',
        '   *',
        '*  *',
        ' ** ',
    ],
    '6': [
        ' ** ',
        '*   ',
        '*** ',
        '*  *',
        '*  *',
        ' ** ',
    ],
    '7': [
        '****',
        '   *',
        '  * ',
        ' *  ',
        ' *  ',
        ' *  ',
    ],
    '8': [
        ' ** ',
        '*  *',
        ' ** ',
        '*  *',
        '*  *',
        ' ** ',
    ],
    '9': [
        ' ** ',
        '*  *',
        '*  *',
        ' ***',
        '   *',
        ' ** ',
    ],
    ':': [
        '    ',
        '*   ',
        '    ',
        '    ',
        '*   ',
        '    ',
    ],
    '.': [
        '    ',
        '    ',
        '    ',
        '    ',
        '    ',
        '*   ',
    ],
    '-': [
        '    ',
        '    ',
        '    ',
        '*** ',
        '    ',
        '    ',
    ],
}

GRID_STEP = 100
DOT_RADIUS = 48
MARGIN_LEFT = 52
COLS = 4
ROWS = 6
UPM = 1000
ASCENDER = 1000
DESCENDER = -300

def y_for_row(row):
    return (ROWS - 1 - row) * GRID_STEP + 50

def x_for_col(col):
    return col * GRID_STEP + MARGIN_LEFT

def draw_circle(pen, cx, cy, r):
    k = int(r * 0.707106781 + 0.5)
    pen.moveTo((cx, cy + r))
    pen.qCurveTo((cx + k, cy + r), (cx + r, cy + k), (cx + r, cy))
    pen.qCurveTo((cx + r, cy - k), (cx + k, cy - r), (cx, cy - r))
    pen.qCurveTo((cx - k, cy - r), (cx - r, cy - k), (cx - r, cy))
    pen.qCurveTo((cx - r, cy + k), (cx - k, cy + r), (cx, cy + r))
    pen.closePath()

def draw_dot_circle(pen, cx, cy, r):
    pen.moveTo((cx - r, cy))
    pen.qCurveTo((cx - r, cy + r), (cx, cy + r))
    pen.qCurveTo((cx + r, cy + r), (cx + r, cy))
    pen.qCurveTo((cx + r, cy - r), (cx, cy - r))
    pen.qCurveTo((cx - r, cy - r), (cx - r, cy))
    pen.closePath()

def glyph_width(pattern):
    max_col = 0
    for row in pattern:
        for c, ch in enumerate(row):
            if ch == '*':
                max_col = max(max_col, c)
    return (max_col + 1) * GRID_STEP + MARGIN_LEFT * 2

def build_glyph(pen, pattern):
    for r, row in enumerate(pattern):
        for c, ch in enumerate(row):
            if ch == '*':
                cx = x_for_col(c)
                cy = y_for_row(r)
                draw_dot_circle(pen, cx, cy, DOT_RADIUS)

src = TTFont('fonts/MatrixSansPrint-Regular.woff2')
cmap = src.getBestCmap()
glyf = src['glyf']
glyph_set = src.getGlyphSet()

for ch, pattern in PATTERNS.items():
    gname = cmap.get(ord(ch))
    if not gname:
        print(f'  skip {ch}: not in cmap')
        continue

    pen = TTGlyphPen(None)
    build_glyph(pen, pattern)
    glyf[gname] = pen.glyph()

    w = glyph_width(pattern)
    src['hmtx'][gname] = (w, MARGIN_LEFT)
    dot_count = sum(row.count('*') for row in pattern)
    print(f'  {ch} ({gname}): width={w}, dots={dot_count}')

# Also handle 'O' glyph (used by zero feature)
if 'O' in [cmap.get(ord(c)) for c in '0']:
    pass
else:
    o_gname = cmap.get(ord('O'))
    if o_gname and o_gname != cmap.get(ord('0')):
        pen = TTGlyphPen(None)
        build_glyph(pen, PATTERNS['0'])
        glyf[o_gname] = pen.glyph()
        w = glyph_width(PATTERNS['0'])
        src['hmtx'][o_gname] = (w, MARGIN_LEFT)
        print(f'  O ({o_gname}): copied from 0, width={w}')

src['name'].setName('MatrixSansPrint4x6', 1, 3, 1, 0x0409)
src['name'].setName('Regular', 2, 3, 1, 0x0409)
src['name'].setName('MatrixSansPrint4x6-Regular', 6, 3, 1, 0x0409)
src['name'].setName('MatrixSansPrint4x6', 4, 3, 1, 0x0409)
src['name'].setName('MatrixSansPrint4x6-Regular', 3, 3, 1, 0x0409)

out_path = 'fonts/MatrixSansPrint4x6-Regular.woff2'
src.flavor = 'woff2'
src.save(out_path)
print(f'\nSaved: {out_path}')
