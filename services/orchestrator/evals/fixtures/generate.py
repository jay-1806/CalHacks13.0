"""
Draws the accuracy-test screenshots and writes cases.json with the exact
target regions, so every expected answer is known by construction.

  python generate.py          (from this folder; needs Pillow and Windows fonts)

The PNGs and cases.json are committed, so running the evals does not need this.
Coordinates in cases.json are 0–1 fractions of the 1920×1080 screenshot.
"""
import json
import math
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.environ.get('FONT_DIR', r'C:\Windows\Fonts')


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def nbox(x1, y1, x2, y2, pad=0):
    """Pixel box → normalized box, padded by `pad` pixels."""
    return [round((x1 - pad) / W, 4), round((y1 - pad) / H, 4), round((x2 + pad) / W, 4), round((y2 + pad) / H, 4)]


def nseg(x1, y1, x2, y2):
    return [round(x1 / W, 4), round(y1 / H, 4), round(x2 / W, 4), round(y2 / H, 4)]


def text_box(draw, xy, text, fnt, pad=0, anchor='la'):
    b = draw.textbbox(xy, text, font=fnt, anchor=anchor)
    return nbox(*b, pad=pad)


cases = []


def save(img, name):
    img.save(os.path.join(HERE, name), optimize=True)


# ── Math: right triangle ────────────────────────────────────────────────────
def math_triangle():
    img = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(img)
    f, small = font('arial.ttf', 44), font('arial.ttf', 36)
    d.text((120, 80), 'Problem 7. Find x in the right triangle below.', fill='black', font=f)
    A, B, C = (500, 850), (1300, 850), (500, 300)
    d.line([A, B], fill='black', width=5)
    d.line([A, C], fill='black', width=5)
    d.line([C, B], fill='black', width=5)
    d.rectangle([500, 800, 550, 850], outline='black', width=3)
    d.text((470, 870), 'A', fill='black', font=small)
    d.text((1310, 870), 'B', fill='black', font=small)
    d.text((470, 250), 'C', fill='black', font=small)
    d.text((380, 560), 'x + 2', fill='#1010d0', font=small)
    d.text((860, 880), 'x + 9', fill='#1010d0', font=small)
    d.text((930, 520), 'x + 10', fill='#1010d0', font=small)
    save(img, 'math-triangle.png')
    cases.append({
        'id': 'math-triangle',
        'image': 'math-triangle.png',
        'question': 'Find x in this right triangle and explain it step by step.',
        'subject': 'math',
        'targets': [
            {'name': 'right angle at A', 'box': nbox(450, 790, 570, 900)},
            {'name': 'leg AC', 'segment': nseg(*A, *C), 'tolerance': 0.03},
            {'name': 'leg AB', 'segment': nseg(*A, *B), 'tolerance': 0.03},
            {'name': 'hypotenuse BC', 'segment': nseg(*C, *B), 'tolerance': 0.03},
        ],
    })


# ── Math: area under y = |x| ────────────────────────────────────────────────
def math_integral():
    img = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(img)
    f, lab = font('arial.ttf', 40), font('ariali.ttf', 44)
    d.text((120, 70), 'Using definite integrals, find the area of the shaded region.', fill='black', font=f)
    ox, oy, unit = 960, 820, 110  # origin and pixels per unit
    to = lambda x, y: (ox + x * unit, oy - y * unit)
    d.line([to(-5, 0), to(5.5, 0)], fill='#111', width=3)
    d.line([to(0, -1.5), to(0, 5.6)], fill='#111', width=3)
    d.line([to(-5, 5), to(0, 0), to(5, 5)], fill='#1a1aa0', width=5)
    d.polygon([to(2, 0), to(4, 0), to(4, 4), to(2, 2)], fill='#1a1aa0')
    marks = {}
    for v in (2, 4):
        x, y = to(v, 0)
        d.line([(x, y - 10), (x, y + 10)], fill='#111', width=3)
        marks[v] = text_box(d, (x, y + 18), str(v), lab, pad=14, anchor='mt')
        d.text((x, y + 18), str(v), fill='#111', font=lab, anchor='mt')
    d.text(to(2.9, 5.4), 'y = |x|', fill='#1a1aa0', font=lab)
    region = nbox(*to(2, 4), *to(4, 0), pad=10)
    save(img, 'math-integral.png')
    cases.append({
        'id': 'math-integral',
        'image': 'math-integral.png',
        'question': 'Using definite integrals, find the area of the shaded region.',
        'subject': 'math',
        'targets': [
            {'name': 'lower limit 2', 'box': marks[2]},
            {'name': 'upper limit 4', 'box': marks[4]},
            {'name': 'shaded region', 'box': region},
        ],
    })


# ── Software: a photo editor ────────────────────────────────────────────────
TOOLS = ['Move', 'Marquee', 'Lasso', 'Crop', 'Eyedropper', 'Brush', 'Eraser', 'Type', 'Hand', 'Zoom']


def draw_tool_icon(d, name, cx, cy):
    c = '#d8d8d8'
    if name == 'Move':
        d.line([(cx - 10, cy - 12), (cx + 8, cy + 6)], fill=c, width=3)
        d.polygon([(cx - 12, cy - 14), (cx - 2, cy - 12), (cx - 12, cy - 2)], fill=c)
    elif name == 'Marquee':
        for i in range(0, 24, 6):
            d.line([(cx - 12 + i, cy - 10), (cx - 9 + i, cy - 10)], fill=c, width=2)
            d.line([(cx - 12 + i, cy + 10), (cx - 9 + i, cy + 10)], fill=c, width=2)
        d.line([(cx - 12, cy - 10), (cx - 12, cy + 10)], fill=c, width=2)
        d.line([(cx + 12, cy - 10), (cx + 12, cy + 10)], fill=c, width=2)
    elif name == 'Lasso':
        d.ellipse([cx - 13, cy - 11, cx + 13, cy + 5], outline=c, width=3)
        d.line([(cx - 6, cy + 4), (cx - 9, cy + 13)], fill=c, width=3)
    elif name == 'Crop':
        d.line([(cx - 7, cy - 15), (cx - 7, cy + 7), (cx + 15, cy + 7)], fill=c, width=3)
        d.line([(cx - 15, cy - 7), (cx + 7, cy - 7), (cx + 7, cy + 15)], fill=c, width=3)
    elif name == 'Eyedropper':
        d.line([(cx - 11, cy + 11), (cx + 7, cy - 7)], fill=c, width=4)
        d.ellipse([cx + 4, cy - 14, cx + 14, cy - 4], fill=c)
    elif name == 'Brush':
        d.line([(cx + 12, cy - 12), (cx - 2, cy + 2)], fill=c, width=4)
        d.ellipse([cx - 13, cy + 1, cx - 1, cy + 13], fill=c)
    elif name == 'Eraser':
        d.polygon([(cx - 12, cy + 6), (cx + 2, cy - 12), (cx + 13, cy - 2), (cx - 1, cy + 14)], outline=c, width=3)
    elif name == 'Type':
        d.text((cx, cy), 'T', fill=c, font=font('arialbd.ttf', 28), anchor='mm')
    elif name == 'Hand':
        d.rounded_rectangle([cx - 9, cy - 6, cx + 9, cy + 13], radius=6, outline=c, width=3)
        for i in (-6, 0, 6):
            d.line([(cx + i, cy - 6), (cx + i, cy - 14)], fill=c, width=3)
    elif name == 'Zoom':
        d.ellipse([cx - 12, cy - 12, cx + 6, cy + 6], outline=c, width=3)
        d.line([(cx + 4, cy + 4), (cx + 13, cy + 13)], fill=c, width=4)


def photo_editor():
    img = Image.new('RGB', (W, H), '#323232')
    d = ImageDraw.Draw(img)
    ui, ui_b = font('segoeui.ttf', 19), font('segoeuib.ttf', 19)
    # Menu bar
    d.rectangle([0, 0, W, 34], fill='#252525')
    x = 16
    menus = {}
    for m in ['File', 'Edit', 'Image', 'Layer', 'Type', 'Select', 'Filter', 'View', 'Window', 'Help']:
        b = d.textbbox((x, 7), m, font=ui)
        menus[m] = nbox(*b, pad=8)
        d.text((x, 7), m, fill='#e6e6e6', font=ui)
        x = b[2] + 26
    d.text((W - 360, 7), 'PixelStudio  —  beach.jpg @ 66.7%', fill='#9a9a9a', font=ui)
    # Options bar
    d.rectangle([0, 34, W, 76], fill='#2b2b2b')
    d.text((70, 45), 'Auto-Select:  Layer    Show Transform Controls', fill='#bdbdbd', font=ui)
    # Toolbar
    d.rectangle([0, 76, 58, H], fill='#262626')
    tools = {}
    for i, name in enumerate(TOOLS):
        cy = 110 + i * 56
        if name == 'Move':
            d.rounded_rectangle([7, cy - 24, 51, cy + 24], radius=6, fill='#474747')
        draw_tool_icon(d, name, 29, cy)
        tools[name] = nbox(4, cy - 26, 54, cy + 26)
    # Document: a beach photo
    px1, py1, px2, py2 = 300, 150, 1450, 980
    d.rectangle([px1 - 2, py1 - 32, px2 + 2, py1], fill='#3c3c3c')
    d.text((px1 + 12, py1 - 27), 'beach.jpg @ 66.7% (RGB/8)', fill='#e0e0e0', font=ui)
    for yy in range(py1, py2):
        t = (yy - py1) / (py2 - py1)
        if t < 0.45:
            col = (int(120 + 100 * t), int(180 + 60 * t), 235)
        elif t < 0.7:
            col = (30, int(110 + 60 * (t - 0.45)), int(170 + 40 * (t - 0.45)))
        else:
            col = (int(220 + 20 * (t - 0.7)), int(200 + 20 * (t - 0.7)), 150)
        d.line([(px1, yy), (px2, yy)], fill=col)
    d.ellipse([1180, 220, 1290, 330], fill='#fff4c0')
    d.polygon([(560, 860), (640, 700), (700, 860)], fill='#3f6e3a')
    # Layers panel
    lx = 1520
    d.rectangle([lx, 76, W, H], fill='#2b2b2b')
    d.rectangle([lx, 76, W, 116], fill='#323232')
    d.text((lx + 16, 85), 'Layers', fill='#f0f0f0', font=ui_b)
    d.text((lx + 110, 85), 'Channels    Paths', fill='#9a9a9a', font=ui)
    d.rectangle([lx + 8, 170, W - 8, 230], fill='#3d4a5c')
    d.rectangle([lx + 20, 178, lx + 80, 222], fill='#7fb1d8')
    d.text((lx + 96, 188), 'Background', fill='#f0f0f0', font=ui)
    d.text((lx + 16, 132), 'Normal          Opacity: 100%', fill='#bdbdbd', font=ui)
    # Bottom bar of the Layers panel: fx, mask, adjustment, group, new layer, delete
    by = 1040
    d.rectangle([lx, by - 26, W, H], fill='#262626')
    icons = {}
    for i, name in enumerate(['fx', 'mask', 'adjust', 'group', 'new', 'delete']):
        cx = lx + 60 + i * 56
        c = '#d0d0d0'
        if name == 'fx':
            d.text((cx, by), 'fx', fill=c, font=font('ariali.ttf', 20), anchor='mm')
        elif name == 'mask':
            d.rectangle([cx - 10, by - 9, cx + 10, by + 9], outline=c, width=2)
            d.ellipse([cx - 5, by - 5, cx + 5, by + 5], fill=c)
        elif name == 'adjust':
            d.ellipse([cx - 10, by - 10, cx + 10, by + 10], outline=c, width=2)
            d.pieslice([cx - 10, by - 10, cx + 10, by + 10], 90, 270, fill=c)
        elif name == 'group':
            d.rectangle([cx - 11, by - 6, cx + 11, by + 9], outline=c, width=2)
            d.rectangle([cx - 11, by - 10, cx - 2, by - 6], fill=c)
        elif name == 'new':
            d.rectangle([cx - 9, by - 10, cx + 9, by + 10], outline=c, width=2)
            d.line([(cx, by - 5), (cx, by + 5)], fill=c, width=2)
            d.line([(cx - 5, by), (cx + 5, by)], fill=c, width=2)
        elif name == 'delete':
            d.rectangle([cx - 8, by - 6, cx + 8, by + 11], outline=c, width=2)
            d.line([(cx - 11, by - 8), (cx + 11, by - 8)], fill=c, width=2)
        icons[name] = nbox(cx - 22, by - 22, cx + 22, by + 22)
    save(img, 'software-editor.png')
    cases.append({
        'id': 'software-crop',
        'image': 'software-editor.png',
        'question': 'How do I crop this photo?',
        'subject': 'software',
        'targets': [{'name': 'Crop tool', 'box': tools['Crop']}],
        'expectKey': True,
    })
    cases.append({
        'id': 'software-new-layer',
        'image': 'software-editor.png',
        'question': 'How do I add a new layer?',
        'subject': 'software',
        'targets': [{'name': 'New layer button or Layer menu', 'anyOf': [icons['new'], menus['Layer']]}],
    })


# ── Chess: a knight fork ────────────────────────────────────────────────────
PIECES = {'K': '\u265A', 'Q': '\u265B', 'R': '\u265C', 'B': '\u265D', 'N': '\u265E', 'P': '\u265F'}
POSITION = {  # square → piece (upper case White, lower case Black)
    'g1': 'K', 'd5': 'N', 'f2': 'P', 'g2': 'P', 'h2': 'P', 'b2': 'P', 'a2': 'P',
    'e8': 'k', 'a8': 'r', 'f7': 'p', 'g7': 'p', 'h7': 'p', 'b7': 'p', 'a7': 'p',
}


def chess(bottom):
    img = Image.new('RGB', (W, H), '#302e2b')
    d = ImageDraw.Draw(img)
    size, x0, y0 = 104, 544, 124  # 832 px board, centered
    glyph = font('seguisym.ttf', 84)
    coord = font('segoeuib.ttf', 20)

    def cell(sq):
        f, r = ord(sq[0]) - 97, int(sq[1]) - 1
        return (f, 7 - r) if bottom == 'white' else (7 - f, r)

    def box(sq, pad=0):
        c, r = cell(sq)
        return nbox(x0 + c * size, y0 + r * size, x0 + (c + 1) * size, y0 + (r + 1) * size, pad=pad)

    for c in range(8):
        for r in range(8):
            light = (c + r) % 2 == 0
            d.rectangle([x0 + c * size, y0 + r * size, x0 + (c + 1) * size - 1, y0 + (r + 1) * size - 1],
                        fill='#ebecd0' if light else '#779556')
    for i in range(8):
        files = 'abcdefgh' if bottom == 'white' else 'hgfedcba'
        ranks = '87654321' if bottom == 'white' else '12345678'
        d.text((x0 + (i + 1) * size - 6, y0 + 8 * size - 4), files[i], fill='#30302e', font=coord, anchor='rd')
        d.text((x0 + 6, y0 + i * size + 4), ranks[i], fill='#30302e', font=coord, anchor='la')
    for sq, p in POSITION.items():
        c, r = cell(sq)
        cx, cy = x0 + c * size + size / 2, y0 + r * size + size / 2 + 4
        white = p.isupper()
        d.text((cx, cy), PIECES[p.upper()], font=glyph, anchor='mm',
               fill='#ffffff' if white else '#1b1b1b', stroke_width=3 if white else 1,
               stroke_fill='#1b1b1b' if white else '#000000')
    d.text((x0 + 8 * size + 40, y0 + 20), 'White to move', fill='#f0f0f0', font=font('segoeuib.ttf', 34))
    name = f'chess-fork-{bottom}.png'
    save(img, name)
    cases.append({
        'id': f'chess-fork-{bottom}-bottom',
        'image': name,
        'question': "It's White to move. What's the best move here?",
        'subject': 'chess',
        'targets': [
            {'name': 'knight on d5', 'box': box('d5')},
            {'name': 'fork square c7', 'box': box('c7')},
            {'name': 'king e8 or rook a8 (attacked)', 'anyOf': [box('e8'), box('a8')]},
        ],
        'expectBoard': {'squares': nbox(x0, y0, x0 + 8 * size, y0 + 8 * size), 'bottom': bottom},
    })


# ── Language reading ────────────────────────────────────────────────────────
def language_spanish():
    img = Image.new('RGB', (W, H), '#fbf8f1')
    d = ImageDraw.Draw(img)
    f, h = font('georgia.ttf', 52), font('georgiab.ttf', 40)
    d.text((220, 160), 'Lectura — nivel A2', fill='#5a4636', font=h)
    line1 = ['La', 'biblioteca', 'está', 'cerrada', 'hoy', 'porque', 'es', 'domingo.']
    line2 = ['Mañana', 'vamos', 'a', 'estudiar', 'juntos', 'en', 'el', 'parque.']
    words = {}
    for y, line in ((330, line1), (430, line2)):
        x = 220
        for w in line:
            b = d.textbbox((x, y), w, font=f)
            words[w] = nbox(*b, pad=10)
            d.text((x, y), w, fill='#1f1f1f', font=f)
            x = b[2] + d.textlength(' ', font=f)
    save(img, 'language-spanish.png')
    cases.append({
        'id': 'language-spanish',
        'image': 'language-spanish.png',
        'question': "What does 'cerrada' mean in this sentence?",
        'subject': 'language',
        'targets': [{'name': 'the word cerrada', 'box': words['cerrada']}],
    })


def language_japanese():
    img = Image.new('RGB', (W, H), '#ffffff')
    d = ImageDraw.Draw(img)
    f, h = font('YuGothM.ttc', 72), font('segoeuib.ttf', 40)
    d.text((220, 170), 'Japanese reading practice', fill='#333333', font=h)
    parts = ['私は', '毎朝', 'コーヒーを', '飲みます', '。']
    words, x, y = {}, 220, 360
    for p in parts:
        b = d.textbbox((x, y), p, font=f)
        words[p] = nbox(*b, pad=10)
        d.text((x, y), p, fill='#111111', font=f)
        x = b[2] + 4
    save(img, 'language-japanese.png')
    cases.append({
        'id': 'language-japanese',
        'image': 'language-japanese.png',
        'question': 'What does 飲みます mean here?',
        'subject': 'language',
        'targets': [{'name': '飲みます', 'box': words['飲みます']}],
    })


if __name__ == '__main__':
    math_triangle()
    math_integral()
    photo_editor()
    chess('white')
    chess('black')
    language_spanish()
    language_japanese()
    with open(os.path.join(HERE, 'cases.json'), 'w', encoding='utf8') as fh:
        json.dump({'width': W, 'height': H, 'cases': cases}, fh, ensure_ascii=False, indent=2)
    print(f'{len(cases)} cases written')
