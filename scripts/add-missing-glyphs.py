#!/usr/bin/env python3
"""
Дорисовывает в Helvetica Neue Cyrillic символы, которых в файлах нет,
но которые встречаются на главной и на странице рассылки:

    ×  U+00D7  знак умножения        «сеткой 3×3»
    ←  U+2190  стрелка влево          «← Архив дневника»
    ↗  U+2197  стрелка вправо-вверх   «Репозитории ↗»
    ☀  U+2600  солнце                 кнопка темы в тёмном режиме
    ☾  U+263E  месяц                  кнопка темы в светлом режиме

Зачем. В CSS у этих страниц стек из одного имени — --archive-font:
"HelveticaNeueCyr", без запасных вариантов. Если глифа в файле нет,
браузер берёт его из системного шрифта. На macOS это Helvetica (Roman),
на Windows — Arial, на Linux — что-то вроде DejaVu Sans. В результате
внутри строки, набранной Helvetica Neue, оказываются чужие знаки: у них
другая толщина штриха, другой наклон и другая посадка на базовую линию.
Именно это читается как «Arial» и «Helvetica Roman» на странице.

Альтернатива — заменить символы в разметке — хуже: правок было бы больше,
символы живут в 12 HTML-файлах и в diary.js, а при следующей правке
текста проблема вернулась бы незаметно.

Геометрия. Контуры рисуются в системе 1000 units/em по пропорциям самого
файла: высота заглавных 700, строчных 500, выносной элемент «l» 712.
Толщина штриха берётся от глифа «l» каждого начертания, поэтому знаки
получаются той же плотности, что и буквы: roman ≈ 86, bold ≈ 142,
heavy ≈ 170. Горизонталь знака «×» стоит на высоте 501 — ровно как у «+»
в этом шрифте (его bounds 0…501), поэтому «×» и «+» выглядят роднёй.

Скрипт не трогает существующие глифы, не удаляет ничего и не пишет
hinting (в файлах его нет). Идемпотентен: повторный запуск ничего не
добавит. Запуск:

    python3 scripts/add-missing-glyphs.py

Требует fontTools с brotli (woff2) и skia-pathops (объединение контуров
без самопересечений):  pip install fonttools brotli skia-pathops
"""

import math

from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
import pathops

FACES = [
    'fonts/helveticaneuecyr-roman.woff2',
    'fonts/helveticaneuecyr-italic.woff2',
    'fonts/helveticaneuecyr-bold.woff2',
    'fonts/helveticaneuecyr-bolditalic.woff2',
    'fonts/helveticaneuecyr-heavy.woff2',
]

GLYPHS = {
    0x00D7: 'multiply',      # ×
    0x2190: 'arrowleft',     # ←
    0x2197: 'arrowupright',  # ↗
    0x2600: 'sun',           # ☀
    0x263E: 'moon',          # ☾
}


# ── вспомогательное ─────────────────────────────────────────────────────────

def _outline(gs, name):
    """Контуры глифа списком ломаных (наши буквы без кривых не нужны,
    но кривые сплющиваем в отрезки — для замера толщины этого хватает)."""
    rp = RecordingPen()
    gs[name].draw(rp)
    contours, cur, last = [], [], None
    for op, args in rp.value:
        if op == 'moveTo':
            if cur:
                contours.append(cur)
            cur = [args[0]]
            last = args[0]
        elif op == 'lineTo':
            cur.append(args[0])
            last = args[0]
        elif op == 'qCurveTo':
            # квадратичная кривая: точки args[:-1] — контрольные
            offs = list(args[:-1])
            end = args[-1]
            prev = last
            for i, off in enumerate(offs):
                t = (i + 1) / (len(offs) + 1)
                if i == len(offs) - 1:
                    mid = end
                else:
                    mid = (prev[0] + 2 * off[0] + end[0]) / 3, (prev[1] + 2 * off[1] + end[1]) / 3
                for k in range(1, 5):
                    s2 = k / 4
                    x = (1 - s2) ** 2 * prev[0] + 2 * (1 - s2) * s2 * off[0] + s2 ** 2 * (mid[0])
                    y = (1 - s2) ** 2 * prev[1] + 2 * (1 - s2) * s2 * off[1] + s2 ** 2 * (mid[1])
                    cur.append((x, y))
                prev = mid
            cur.append(end)
            last = end
        elif op in ('closePath', 'endPath'):
            if cur:
                contours.append(cur)
                cur = []
            last = None
    if cur:
        contours.append(cur)
    return contours


def stroke_width(font):
    """Толщина вертикального штриха — задаёт плотность всех наших знаков.

    Меряем не bounding box буквы «l», а срез по горизонтали на середине
    высоты строчных. У курсива «l» наклонена, и её bbox включает наклон:
    для italic он даёт 200+ вместо честных ~86, из-за чего стрелки и «×»
    получались вдвое толще букв и вылезали за площадку.
    """
    gs = font.getGlyphSet()
    name = font.getBestCmap()[ord('l')]
    y = 250.0                      # середина высоты строчных (sxHeight 500)
    xs = []
    for cont in _outline(gs, name):
        for i in range(len(cont)):
            x1, y1 = cont[i]
            x2, y2 = cont[(i + 1) % len(cont)]
            if (y1 <= y < y2) or (y2 <= y < y1):
                t = (y - y1) / (y2 - y1)
                xs.append(x1 + t * (x2 - x1))
    if len(xs) < 2:
        raise SystemExit(f'не удалось измерить штрих в глифе {name}')
    xs.sort()
    return max(xs) - min(xs)


def to_path(contours):
    """Список контуров (списки точек) → pathops.Path."""
    path = pathops.Path()
    pen = path.getPen()
    for cont in contours:
        pen.moveTo(cont[0])
        for pt in cont[1:]:
            pen.lineTo(pt)
        pen.closePath()
    return path


def unite(paths):
    """Объединение фигур: общие края не оставляют швов и наложений."""
    out = paths[0]
    for p in paths[1:]:
        out = pathops.op(out, p, pathops.PathOp.UNION)
    return out


def contours_of(path):
    """pathops.Path → список контуров из точек (наши знаки без кривых)."""
    rp = RecordingPen()
    path.draw(rp)
    contours, cur = [], []
    for op, args in rp.value:
        if op == 'moveTo':
            if cur:
                contours.append(cur)
            cur = [args[0]]
        elif op == 'lineTo':
            cur.append(args[0])
        elif op in ('closePath', 'endPath'):
            if cur:
                contours.append(cur)
                cur = []
        else:
            raise SystemExit(f'неожиданная операция контура: {op}')
    if cur:
        contours.append(cur)
    return contours


def emit(path):
    """pathops.Path → TTGlyph."""
    pen = TTGlyphPen(None)
    path.draw(pen)
    return pen.glyph()


def rotate(contours, deg, ox=0.0, oy=0.0):
    r = math.radians(deg)
    co, si = math.cos(r), math.sin(r)
    return [[(ox + (px - ox) * co - (py - oy) * si,
              oy + (px - ox) * si + (py - oy) * co) for px, py in c]
            for c in contours]


def translate(contours, dx, dy):
    return [[(px + dx, py + dy) for px, py in c] for c in contours]


def shift_to(contours, left, baseline):
    """Сдвиг так, чтобы левый край контура и низ встали в заданные точки."""
    xs = [p[0] for c in contours for p in c]
    ys = [p[1] for c in contours for p in c]
    return translate(contours, left - min(xs), baseline - min(ys))


def circle(cx, cy, r, steps=96):
    return [(cx + r * math.cos(2 * math.pi * i / steps),
             cy + r * math.sin(2 * math.pi * i / steps)) for i in range(steps)]


def arrow_left_contours(h, shaft=470):
    """Стрелка, смотрящая влево; остриё в (0, 0), ось — y = 0.

    Наконечник с вогнутой пятой: углы (head_len, ±head_half), выемка ближе
    к острию — (notch, 0). Такой же силуэт у стрелок в Helvetica: без
    выемки наконечник выглядит тяжёлым и не попадает в ритм шрифта.

    Наконечник растёт вместе со штрихом. Если держать его постоянным, у
    bold и heavy он становится уже стебля и после объединения контуров
    пропадает — стрелка превращается в косой прямоугольник.
    """
    head_len = max(130.0, h * 0.95)
    head_half = max(165.0, h * 1.5)
    notch = head_len * 0.60
    head = [(0, 0), (head_len, head_half), (notch, 0), (head_len, -head_half)]
    stem = [(notch - 2, -h / 2), (shaft, -h / 2), (shaft, h / 2), (notch - 2, h / 2)]
    return [head, stem]


# ── знаки ───────────────────────────────────────────────────────────────────

def build_multiply(h):
    """× — два штриха под 45°, крест-накрест, кеглем с осью на 250."""
    # Размах зависит от толщины, иначе у толстых начертаний концы штрихов
    # смыкаются и знак читается ромбом, а не крестом. Просвет между
    # соседними концами держим равным толщине штриха: 2.5·h.
    #
    # Центр и ширина. Площадка «×» — 596, между «+» (600) и «3» (556),
    # а центр смещён влево: крестик стоит между двумя цифрами, и без этого
    # «3×3» смотрится разреженным.
    #
    # Числа здесь не «на глаз». Наклонный штрих толщиной h занимает по
    # горизонтали h/2·√2 с каждой стороны, поэтому левый край силуэта —
    # cx − half_len − 0.71·h, и он должен попасть в 0, иначе после сдвига
    # в ноль уедет сама ось крестика.
    half_len = max(196.0, h * 2.5)
    cx = int(round(half_len + 0.71 * h))
    cy = 250
    # Площадка тоже растёт: у heavy силуэт занимает 1090 при площадке 600,
    # и «3×3» слипается. Держим по 40 единиц просвета с каждой стороны.
    advance = int(round(cx + half_len + 0.71 * h + 40))

    def bar(dx, dy):
        ln = math.hypot(dx, dy)
        nx, ny = -dy / ln * h, dx / ln * h
        ax, ay = cx - dx, cy - dy
        bx, by = cx + dx, cy + dy
        return [(ax + nx, ay + ny), (bx + nx, by + ny),
                (bx - nx, by - ny), (ax - nx, ay - ny)]

    a = to_path([bar(half_len, half_len)])
    b = to_path([bar(half_len, -half_len)])
    return unite([a, b]), advance


def build_arrow_left(h):
    """← — остриё слева, ось по высоте строчной (250)."""
    head_half = max(165.0, h * 1.5)
    centre = max(250.0, head_half + 22)
    paths = [to_path([c]) for c in arrow_left_contours(h)]
    arrow = unite(paths)
    arrow = translate(contours_of(arrow), 72, centre)
    return to_path(arrow), 560


def build_arrow_upright(h):
    """↗ — та же стрелка, отражённая по x и повёрнутая на +45°.

    Отражение нужно потому, что строим мы левую стрелку: без него
    поворот даёт стрелку вниз-вправо, а нужна вверх-вправо.
    Поворот вокруг острия, затем сдвиг в левый нижний угол площадки.
    """
    mirrored = [[(-px, py) for px, py in c] for c in arrow_left_contours(h)]
    rotated = rotate(mirrored, 45)
    # остриё осталось в нуле; сдвигаем всю фигуру в площадку 0…700
    xs = [p[0] for c in rotated for p in c]
    ys = [p[1] for c in rotated for p in c]
    dx, dy = 62 - min(xs), 62 - min(ys)
    rotated = translate(rotated, dx, dy)
    arrow = unite([to_path([c]) for c in rotated])
    return arrow, 600


def build_moon():
    """☾ — круг минус смещённый круг: серп, растущий влево."""
    outer = to_path([circle(300, 355, 300)])
    inner = to_path([circle(452, 400, 285)])
    return pathops.op(outer, inner, pathops.PathOp.DIFFERENCE), 600


def build_sun(h):
    """☀ — диск и восемь лучей, разнесённых на 45°."""
    r_core, r_tip = 205, 330
    shapes = [to_path([circle(330, 345, r_core)])]
    for i in range(8):
        ang = math.radians(i * 45)
        ca, sa = math.cos(ang), math.sin(ang)
        w = max(h // 2, 26)
        base = r_core - 25
        shapes.append(to_path([[
            (330 + base * ca - w * sa, 345 + base * sa + w * ca),
            (330 + r_tip * ca,        345 + r_tip * sa),
            (330 + base * ca + w * sa, 345 + base * sa - w * ca),
        ]]))
    return unite(shapes), 690


def build(font):
    upm = font['head'].unitsPerEm
    assert upm == 1000, f'ожидался upm 1000, а в файле {upm}'
    h = stroke_width(font)

    out = {}
    for cp, (path, adv) in {
        0x00D7: build_multiply(h),
        0x2190: build_arrow_left(h),
        0x2197: build_arrow_upright(h),
        0x2600: build_sun(h),
        0x263E: build_moon(),
    }.items():
        out[cp] = (GLYPHS[cp], emit(path), adv)
    return out


# ── запись ──────────────────────────────────────────────────────────────────

def main():
    for path in FACES:
        font = TTFont(path)
        cmap = font.getBestCmap()
        missing = {cp: n for cp, n in GLYPHS.items() if cp not in cmap}
        if not missing:
            print(f'{path}: все символы уже есть — пропуск')
            continue

        built = build(font)
        order = font.getGlyphOrder()
        added = []
        for cp in sorted(missing):
            gname, glyph, adv = built[cp]
            if gname in order:
                continue
            order = order + [gname]
            font['glyf'][gname] = glyph
            font['hmtx'][gname] = (adv, 0)
            for table in font['cmap'].tables:
                if table.isUnicode():
                    table.cmap[cp] = gname
            added.append(f'{chr(cp)} U+{cp:04X}')

        font.setGlyphOrder(order)
        font['maxp'].numGlyphs = len(order)
        font.save(path)
        print(f'{path}: добавлено {len(added)} — ' + ', '.join(added))


if __name__ == '__main__':
    main()
