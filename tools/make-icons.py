#!/usr/bin/env python3
"""Generate the StudyMW icon set from one set of curves.

    python3 tools/make-icons.py [--font /path/to/InstrumentSans.ttf]

Writes into ``web/assets/img/``:

    icon.svg                  the mark on the teal tile (any size)
    safari-pinned-tab.svg     the mark alone, for Safari's pinned tabs
    favicon.ico               16, 32 and 48 px, for tabs and old crawlers
    icon-16/48/96/144/192/512.png
    apple-touch-icon.png      180 px, square: iOS rounds it itself
    icon-maskable-192/512.png full bleed, mark at 62% (Android's safe zone)
    og-1200x630.png           the card that shows when a link is shared

Needs Pillow (``pip install pillow``). The SVG is written from the same
numbers the PNGs are drawn from, so the two cannot drift apart. Nothing here
runs at request time — the output is committed, and this script is only for
changing the mark.

Google's search results want a square PNG whose size is a multiple of 48 px on
a stable, crawlable URL; that is why 48/96/144/192 all exist and are linked
from every page. Chrome's tab and the installed app use the ICO, the SVG and
the maskable pair.
"""

import argparse
import os
import struct
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover - tooling, not the site
    sys.exit("Pillow is not installed: pip install pillow")

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "..", "web", "assets", "img")
FONTS = os.path.join(HERE, "..", "web", "assets", "fonts")

TEAL = "#006D7C"
CREAM = "#FAF5E9"
MINT = "#CFEBE1"
INSET = 0.219  # the tile's corner radius, as a share of its side

# ---------------------------------------------------------------------------
# The mark, in a 100 x 100 box. One half is described; the other is mirrored
# about x = 50. Everything below — SVG and every PNG — is drawn from these.
# ---------------------------------------------------------------------------
SPINE = 46.8
TOP = ((SPINE, 20.2), (37.5, 21.6), (30.0, 25.6), (25.4, 31.4))
OUTER = ((25.4, 31.4), (24.2, 48.0), (24.2, 60.0), (24.9, 71.6))
BOTTOM = ((24.9, 71.6), (31.0, 78.6), (38.5, 77.6), (SPINE, 70.2))
CUT = ((25.7, 67.5), (31.5, 74.6), (38.6, 73.6), (SPINE - 0.2, 66.8))
STROKE_INNER = ((19.8, 37.0), (18.8, 69.5))   # the first fanned page edge
STROKE_OUTER = ((13.2, 44.0), (12.4, 66.5))   # the second, shorter
CUT_WIDTH = 2.9
INNER_WIDTH = 5.2
OUTER_WIDTH = 4.4


def mirror(points):
    return [(100.0 - x, y) for x, y in points]


def bezier(seg, steps=60):
    """Sample a cubic segment: (p0, p1, p2, p3) -> points."""
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = seg
    out = []
    for i in range(steps + 1):
        t = i / steps
        mt = 1 - t
        out.append((
            mt**3 * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t**3 * x3,
            mt**3 * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t**3 * y3,
        ))
    return out


def mass_points():
    """The filled half-page: top curve, outer edge, bottom curve, spine."""
    pts = bezier(TOP) + bezier(OUTER)[1:] + bezier(BOTTOM)[1:]
    return pts


# ---------------------------------------------------------------------------
# SVG
# ---------------------------------------------------------------------------
def f(v):
    return ("%.2f" % v).rstrip("0").rstrip(".")


def curve_d(seg):
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = seg
    return "C %s %s %s %s %s %s" % tuple(f(v) for v in (x1, y1, x2, y2, x3, y3))


def line_d(seg):
    (x0, y0), (x1, y1) = seg
    return "M %s %s L %s %s" % (f(x0), f(y0), f(x1), f(y1))


def curve_path_d(seg):
    (x0, y0) = seg[0]
    return "M %s %s %s" % (f(x0), f(y0), curve_d(seg))


def stroke_svg(d, colour, width):
    return ('<path d="%s" fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round"/>'
            % (d, colour, f(width)))


def mark_svg(colour=CREAM, accent=MINT, hole=TEAL, mono=False):
    """The mark alone, in the 100 box. `hole` must match whatever is behind it."""
    parts = []
    for flip in (False, True):
        pick = (lambda pts: mirror(pts)) if flip else (lambda pts: list(pts))
        pts = pick(mass_points())
        d = "M " + " ".join("%s %s" % (f(x), f(y)) for x, y in pts) + " Z"
        parts.append('<path d="%s" fill="%s"/>' % (d, colour))
        if not mono:
            parts.append(stroke_svg(curve_path_d(pick(CUT)), hole, CUT_WIDTH))
        parts.append(stroke_svg(line_d(pick(STROKE_INNER)), colour, INNER_WIDTH))
        parts.append(stroke_svg(line_d(pick(STROKE_OUTER)), colour if mono else accent, OUTER_WIDTH))
    return "".join(parts)


def icon_svg(size=512, mark_scale=1.0, rounded=True):
    radius = ' rx="%s"' % f(size * INSET) if rounded else ""
    k = (size / 100.0) * mark_scale
    offset = (size - 100 * k) / 2
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">'
        '<rect width="%d" height="%d"%s fill="%s"/>'
        '<g transform="translate(%s %s) scale(%s)">%s</g></svg>\n'
        % (size, size, size, size, size, size, radius, TEAL,
           f(offset), f(offset), f(k), mark_svg())
    )


def pinned_svg():
    # Safari paints this one shape in the colour of the <link mask-icon>, so it
    # is a silhouette: no tile, no hole, no second colour. The page-block cut is
    # left out — as a hole it would need a mask, and it is invisible at 16 px in
    # a tab strip anyway.
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">%s</svg>\n'
        % mark_svg(mono=True)
    )


# ---------------------------------------------------------------------------
# PNG
# ---------------------------------------------------------------------------
SS = 4  # supersampling: draw big, shrink once


def render(size, mark_scale=1.0, rounded=True, background=TEAL, detail="full"):
    """Draw the icon at `size` px.

    `detail` is how much of the mark survives: at 16 px the fanned edges and the
    page-block cut turn into grey mud, so small sizes keep only the two pages
    and the spine. That is what every icon set does at the bottom end, and it is
    why the 16 px favicon looks drawn rather than shrunk.
    """
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * INSET), fill=background)
    else:
        d.rectangle([0, 0, big, big], fill=background)

    k = (size / 100.0) * mark_scale * SS
    ox = (big - 100 * k) / 2
    oy = (big - 100 * k) / 2

    def P(points):
        return [((x * k) + ox, (y * k) + oy) for x, y in points]

    def stroke(seg, width, colour):
        pts = P(seg)
        d.line(pts, fill=colour, width=int(round(width * k)), joint="curve")
        r = width * k / 2
        for x, y in (pts[0], pts[-1]):
            d.ellipse([x - r, y - r, x + r, y + r], fill=colour)

    for flip in (False, True):
        pts = mirror(mass_points()) if flip else mass_points()
        d.polygon(P(pts), fill=CREAM)
        if detail == "full":
            stroke(mirror(bezier(CUT)) if flip else bezier(CUT), CUT_WIDTH, background)
        if detail != "plain":
            stroke(mirror(STROKE_INNER) if flip else STROKE_INNER, INNER_WIDTH, CREAM)
        if detail == "full":
            stroke(mirror(STROKE_OUTER) if flip else STROKE_OUTER, OUTER_WIDTH, MINT)

    return img.resize((size, size), Image.LANCZOS)


def ico_bytes(frames):
    """A small ICO writer: PNG-compressed frames, exact pixels, no resampling."""
    header = struct.pack("<HHH", 0, 1, len(frames))
    entries, blobs, offset = b"", b"", 6 + 16 * len(frames)
    for size, png in frames:
        side = 0 if size >= 256 else size
        entries += struct.pack("<BBBBHHII", side, side, 0, 0, 1, 32, len(png), offset)
        blobs += png
        offset += len(png)
    return header + entries + blobs


def png_bytes(img):
    import io

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def load_font(path, size, bold=False):
    for candidate in (path,
                      os.path.join(FONTS, "instrument-sans.woff2"),
                      "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                      "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if candidate and os.path.exists(candidate):
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                continue
    return ImageFont.load_default()


def spaced(d, xy, text, font, fill, tracking=0, weight=0):
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill, stroke_width=weight, stroke_fill=fill)
        x += d.textlength(ch, font=font) + tracking
    return x


def og_card(font_path):
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), TEAL)
    d = ImageDraw.Draw(img)
    # A big, quiet copy of the mark fills the right half without competing with
    # the words: at 12% it reads as texture, and the card still looks right in a
    # 120x63 thumbnail.
    ghost = render(430, rounded=False).convert("RGBA")
    ghost.putalpha(ghost.getchannel("A").point(lambda a: int(a * 0.13)))
    img.paste(ghost, (720, 100), ghost)
    mark = render(200, rounded=False)
    img.paste(mark, (88, 72), mark)

    small = load_font(font_path, 30)
    bold = load_font(font_path, 86)
    body = load_font(font_path, 40)

    spaced(d, (88, 296), "STUDYMW", bold, CREAM, tracking=10, weight=2)
    d.text((88, 424), "MSCE & JCE past papers, marking keys,", font=body, fill=CREAM)
    d.text((88, 478), "books and notes. Free, every day.", font=body, fill=MINT)
    d.text((88, 550), "studymw.netlibrary.dpdns.org", font=small, fill=MINT)
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--font", default=None, help="TTF for the share card")
    args = ap.parse_args()

    os.makedirs(IMG, exist_ok=True)
    written = []

    def write(name, data):
        path = os.path.join(IMG, name)
        mode = "wb" if isinstance(data, bytes) else "w"
        with open(path, mode) as fh:
            fh.write(data)
        written.append(name)

    write("icon.svg", icon_svg())
    write("safari-pinned-tab.svg", pinned_svg())

    for size, detail, scale in ((16, "plain", 1.16), (48, "full", 1.0), (96, "full", 1.0),
                                (144, "full", 1.0), (192, "full", 1.0),
                                (512, "full", 1.0)):
        write("icon-%d.png" % size, png_bytes(render(size, mark_scale=scale, detail=detail)))

    # At the root, not in assets/img: a browser that has never seen the page asks
    # for /favicon.ico on its own, and an old crawler will not read a <link>.
    root_ico = os.path.join(HERE, "..", "web", "favicon.ico")
    with open(root_ico, "wb") as fh:
        fh.write(ico_bytes([(s, png_bytes(render(s, mark_scale=1.16, detail="plain"))) for s in (16,)] +
                           [(32, png_bytes(render(32, mark_scale=1.06, detail="simple"))),
                            (48, png_bytes(render(48)))]))
    written.append("favicon.ico (site root)")

    # iOS rounds the corners itself and dislikes transparency: square, full bleed.
    write("apple-touch-icon.png", png_bytes(render(180, mark_scale=0.78, rounded=False)))

    # Android masks to any shape and only guarantees a circle of 80% width:
    # the mark keeps clear of it.
    for size in (192, 512):
        write("icon-maskable-%d.png" % size, png_bytes(render(size, mark_scale=0.72, rounded=False)))

    write("og-1200x630.png", png_bytes(og_card(args.font)))

    for name in sorted(written):
        path = os.path.join(IMG, name)
        if not os.path.exists(path):
            path = os.path.join(HERE, "..", "web", "favicon.ico")
        print("%-26s %8d bytes" % (name, os.path.getsize(path)))


if __name__ == "__main__":
    main()
