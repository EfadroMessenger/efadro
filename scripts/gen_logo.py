#!/usr/bin/env python3
"""Regenerate efadro's brand assets (styled transparent "e" letter).

    python3 scripts/gen_logo.py

Extracts the lowercase "e" outline from the Poppins Bold font (OFL licensed,
shipped in scripts/vendor/) and emits:
  public/img/logo.svg            brand mark — gradient glyph, no background
  public/img/apple-touch-icon.svg  white glyph on a rounded indigo tile
  public/img/og-image.svg        social card (1200x630, dark, big gradient e)
"""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
FONT_PATH = os.path.join(ROOT, 'scripts', 'vendor', 'Poppins-Bold.ttf')

INDIGO = '#6366f1'
INDIGO_D = '#4f46e5'
VIOLET = '#8b5cf6'
VIOLET_L = '#a78bfa'
BG_DARK = '#0f0d1c'


def glyph_path(letter='e'):
    """SVG path data for the letter, normalized into a 512x512 box (y-down)."""
    font = TTFont(FONT_PATH)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    glyph_name = cmap[ord(letter)]
    upm = font['head'].unitsPerEm

    pen = SVGPathPen(glyph_set)
    glyph_set[glyph_name].draw(pen)
    raw = pen.getCommands()

    bounds = glyph_set[glyph_name].boundingBox() if hasattr(
        glyph_set[glyph_name], 'boundingBox') else None
    # bounds from the glyf table for stability
    glyf = font['glyf'][glyph_name]
    x_min, y_min, x_max, y_max = glyf.xMin, glyf.yMin, glyf.xMax, glyf.yMax
    w, h = x_max - x_min, y_max - y_min

    # fit glyph into 512 with even padding, centered
    pad = 44
    scale = (512 - 2 * pad) / max(w, h)
    ox = (512 - w * scale) / 2 - x_min * scale
    oy = (512 - h * scale) / 2 - y_min * scale

    def tp(x, y):
        # font coords are y-up; svg is y-down
        return x * scale + ox, (upm - y) * 0 + (512 - (y * scale + oy) - 0)

    # re-render with a transform pen instead of rewriting path text
    from fontTools.pens.transformPen import TransformPen
    pen2 = SVGPathPen(glyph_set)
    tpen = TransformPen(pen2, (
        scale, 0,
        0, -scale,
        x_min * -scale + ox - 0,
        y_max * scale + ((512 - h * scale) / 2),
    ))
    glyph_set[glyph_name].draw(tpen)
    return pen2.getCommands(), w, h, upm


BRAND_GRADIENT = f'''<defs>
    <linearGradient id="efg" x1="0" y1="-60" x2="512" y2="572" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="{VIOLET_L}"/>
      <stop offset=".45" stop-color="{INDIGO}"/>
      <stop offset="1" stop-color="{INDIGO_D}"/>
    </linearGradient>
  </defs>'''


def brand_svg(d, size=512):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" '
            f'width="{size}" height="{size}">\n  {BRAND_GRADIENT}\n'
            f'  <path d="{d}" fill="url(#efg)"/>\n</svg>\n')


def chip_svg(d, tile=180, radius=44):
    s = tile / 512
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {tile} {tile}" '
            f'width="{tile}" height="{tile}">\n'
            f'  <rect width="{tile}" height="{tile}" rx="{radius}" fill="{INDIGO}"/>\n'
            f'  <g transform="scale({s})"><path d="{d}" fill="#ffffff"/></g>\n</svg>\n')


def og_svg(d):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" '
            f'width="1200" height="630">\n  {BRAND_GRADIENT}\n'
            f'  <rect width="1200" height="630" fill="{BG_DARK}"/>\n'
            f'  <g transform="translate(349,59)"><path d="{d}" fill="url(#efg)"/></g>\n'
            f'</svg>\n')


def main():
    d, w, h, upm = glyph_path('e')
    img = os.path.join(ROOT, 'public', 'img')
    with open(os.path.join(img, 'logo.svg'), 'w') as f:
        f.write(brand_svg(d))
    with open(os.path.join(img, 'apple-touch-icon.svg'), 'w') as f:
        f.write(chip_svg(d))
    with open(os.path.join(img, 'og-image.svg'), 'w') as f:
        f.write(og_svg(d))
    print('[gen_logo] wrote logo.svg, apple-touch-icon.svg, og-image.svg')


if __name__ == '__main__':
    main()
