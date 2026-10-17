# /// script
# requires-python = ">=3.14"
# dependencies = [
#   "fonttools==4.66.1",
#   "skia-pathops==0.9.2",
#   "uharfbuzz==0.56.2",
# ]
# ///
"""ProofBox mark and wordmark.

A sealed parcel in 2:1 axonometric on a 24-unit grid. Its three faces are
separate polygons, split by seams cut out of the geometry; P and B are
Instrument Sans Bold, mapped into the planes of the left and right faces and
knocked out. The wordmark sets "ProofBox" in Instrument Sans SemiBold.

    uv run build_logo.py                 writes ./brand/*.svg
    uv run build_logo.py --out assets    writes ./assets/*.svg

Also importable: build(out_dir) does the same from a notebook or REPL.
"""

import argparse
import io
import os
import urllib.request
from math import hypot
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.removeOverlaps import removeOverlaps
from fontTools.varLib.instancer import instantiateVariableFont

FONT_URL = (
    "https://github.com/google/fonts/raw/main/ofl/instrumentsans/"
    "InstrumentSans%5Bwdth%2Cwght%5D.ttf"
)

INK = "#17191C"

SEAM = 0.6
FACE_CAP = 6.6
FACE_WEIGHT = 700

WORD_WEIGHT = 600
WORD_SIZE = 100
WORD_TRACKING = -12
MARK_TO_CAP = 1.55
GAP_TO_MARK = 0.42
PAD = 8

TOP, LEFT, RIGHT, BOTTOM = (12, 3), (3, 7.5), (21, 7.5), (12, 22.5)
CENTRE = (12, 12)
EDGE = hypot(9, 4.5)
FACE_HEIGHT = 10.5

type Point = tuple[float, float]
type Line = tuple[Point, Point]


def default_font_path() -> Path:
    cache = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache"))
    return cache / "proofbox" / "InstrumentSans-Variable.ttf"


def fetch_font(path: Path) -> Path:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(FONT_URL, path)
    return path


def static_font(variable: Path, weight: int) -> TTFont:
    font = instantiateVariableFont(
        TTFont(variable), {"wght": weight, "wdth": 100}
    )
    removeOverlaps(font)
    buffer = io.BytesIO()
    font.save(buffer)
    buffer.seek(0)
    return TTFont(buffer)


def fmt(v: float) -> str:
    return f"{round(v, 3):g}"


def offset(line: Line, distance: float) -> Line:
    (x0, y0), (x1, y1) = line
    length = hypot(x1 - x0, y1 - y0)
    nx, ny = (y0 - y1) / length * distance, (x1 - x0) / length * distance
    return (x0 + nx, y0 + ny), (x1 + nx, y1 + ny)


def intersect(a: Line, b: Line) -> Point:
    (x1, y1), (x2, y2) = a
    (x3, y3), (x4, y4) = b
    d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d
    return x1 + t * (x2 - x1), y1 + t * (y2 - y1)


def faces() -> tuple[list[Point], list[Point], list[Point]]:
    """The three faces, each bounded by the silhouette and two seam edges."""
    half = SEAM / 2
    to_left, to_right, to_bottom = (
        (CENTRE, LEFT),
        (CENTRE, RIGHT),
        (CENTRE, BOTTOM),
    )

    left_top, left_low = offset(to_left, half), offset(to_left, -half)
    right_top, right_low = offset(to_right, -half), offset(to_right, half)
    bottom_left, bottom_right = (
        offset(to_bottom, half),
        offset(to_bottom, -half),
    )

    rim_left, rim_right = (TOP, LEFT), (TOP, RIGHT)
    base_left, base_right = ((3, 18), BOTTOM), ((21, 18), BOTTOM)
    wall_left, wall_right = (LEFT, (3, 18)), (RIGHT, (21, 18))

    top = [
        TOP,
        intersect(left_top, rim_left),
        intersect(left_top, right_top),
        intersect(right_top, rim_right),
    ]
    left = [
        (3, 18),
        intersect(bottom_left, base_left),
        intersect(bottom_left, left_low),
        intersect(left_low, wall_left),
    ]
    right = [
        (21, 18),
        intersect(right_low, wall_right),
        intersect(right_low, bottom_right),
        intersect(bottom_right, base_right),
    ]
    return top, left, right


def polygon_path(points: list[Point]) -> str:
    return "M" + " L".join(f"{fmt(x)} {fmt(y)}" for x, y in points) + " Z"


def glyph_on_face(font: TTFont, char: str, origin: Point, rise: float) -> str:
    """Draw a glyph in the plane of a side face, centred, as SVG path data.

    The face's top edge runs from origin by (9, rise); its sides are vertical.
    """
    glyphs = font.getGlyphSet()
    glyph = glyphs[font.getBestCmap()[ord(char)]]
    bounds = BoundsPen(glyphs)
    glyph.draw(bounds)
    x_min, _, x_max, _ = bounds.bounds

    scale = FACE_CAP / font["OS/2"].sCapHeight
    ux, uy = 9 / EDGE, rise / EDGE
    across = (EDGE - (x_max - x_min) * scale) / 2 - x_min * scale
    down = (FACE_HEIGHT + FACE_CAP) / 2
    matrix = (
        ux * scale,
        uy * scale,
        0.0,
        -scale,
        origin[0] + ux * across,
        origin[1] + uy * across + down,
    )

    pen = SVGPathPen(glyphs, ntos=fmt)
    glyph.draw(TransformPen(pen, matrix))
    return pen.getCommands()


def mark(font: TTFont) -> str:
    top, left, right = faces()
    p = glyph_on_face(font, "P", LEFT, 4.5)
    b = glyph_on_face(font, "B", CENTRE, -4.5)
    return (
        f'<path d="{polygon_path(top)}" fill="{INK}"/>'
        f'<path d="{polygon_path(left)} {p}" fill="{INK}" fill-rule="evenodd"/>'
        f'<path d="{polygon_path(right)} {b}" fill="{INK}" fill-rule="evenodd"/>'
    )


def set_text(font: TTFont, text: str) -> tuple[str, float, float]:
    """Shape text with kerning; return path data, advance width and cap height."""
    buffer = io.BytesIO()
    font.save(buffer)
    shaper = hb.Font(hb.Face(hb.Blob(buffer.getvalue())))
    run = hb.Buffer()
    run.add_str(text)
    run.guess_segment_properties()
    hb.shape(shaper, run, {"kern": True})

    glyphs, order = font.getGlyphSet(), font.getGlyphOrder()
    scale = WORD_SIZE / font["head"].unitsPerEm
    path, x = "", 0
    for info, position in zip(run.glyph_infos, run.glyph_positions):
        pen = SVGPathPen(glyphs, ntos=fmt)
        glyphs[order[info.codepoint]].draw(
            TransformPen(pen, (scale, 0, 0, -scale, x * scale, 0))
        )
        path += pen.getCommands()
        x += position.x_advance + WORD_TRACKING
    return path, x * scale, font["OS/2"].sCapHeight * scale


def svg(view_box: str, width: float, height: float, body: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" '
        f'viewBox="{view_box}"><title>ProofBox</title>{body}</svg>\n'
    )


def build(
    out_dir: str | Path = "brand", font_path: str | Path | None = None
) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    variable = fetch_font(Path(font_path) if font_path else default_font_path())

    symbol = mark(static_font(variable, FACE_WEIGHT))
    (out / "proofbox-mark.svg").write_text(svg("0 0 24 24", 240, 240, symbol))

    word, word_width, cap = set_text(
        static_font(variable, WORD_WEIGHT), "ProofBox"
    )
    k = cap * MARK_TO_CAP / 19.5
    shift = -cap / 2 - 9.75 * k - 3 * k
    text_x = 21 * k + 19.5 * k * GAP_TO_MARK
    x0, y0 = 3 * k - PAD, shift + 3 * k - PAD
    width, height = text_x + word_width - 3 * k + 2 * PAD, 19.5 * k + 2 * PAD
    body = (
        f'<g transform="translate(0,{shift:.3f}) scale({k:.5f})">{symbol}</g>'
        f'<path transform="translate({text_x:.3f},0)" d="{word}" fill="{INK}"/>'
    )
    view_box = f"{x0:.2f} {y0:.2f} {width:.2f} {height:.2f}"
    (out / "proofbox-wordmark.svg").write_text(
        svg(view_box, width * 2, height * 2, body)
    )

    print(f"wrote {out.resolve()}/proofbox-mark.svg and proofbox-wordmark.svg")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build the ProofBox mark and wordmark."
    )
    parser.add_argument(
        "--out", default="brand", help="output directory (default: ./brand)"
    )
    parser.add_argument(
        "--font", default=None, help="Instrument Sans variable font file"
    )
    args, _ = parser.parse_known_args()
    build(args.out, args.font)


if __name__ == "__main__":
    main()
