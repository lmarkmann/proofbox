# /// script
# requires-python = ">=3.14"
# dependencies = [
#   "pillow==13.0.0",
#   "resvg-py==0.5.0",
# ]
# ///
"""Browser icons from proofbox-mark.svg.

    uv run build_favicons.py --out ../../apps/web/public

favicon.svg recolours the mark for dark tab bars through a media query, so it
stays readable in both themes. apple-touch-icon.png and favicon.ico put the
mark on a white tile, because neither format can follow the theme.
"""

import argparse
import re
from io import BytesIO
from pathlib import Path

import resvg_py
from PIL import Image

INK = "#17191C"
INK_ON_DARK = "#F4F4F5"
HERE = Path(__file__).parent


def themed_svg(mark: str) -> str:
    style = (
        f"<style>path{{fill:{INK}}}"
        f"@media (prefers-color-scheme:dark){{path{{fill:{INK_ON_DARK}}}}}</style>"
    )
    return re.sub(r"(<svg[^>]*>)", rf"\1{style}", mark, count=1)


def tile(mark: str, side: int, padding: float) -> Image.Image:
    inner = round(side * (1 - 2 * padding))
    png = resvg_py.svg_to_bytes(svg_string=mark, width=inner, height=inner)
    glyph = Image.open(BytesIO(png)).convert("RGBA")
    canvas = Image.new("RGBA", (side, side), "white")
    offset = (side - inner) // 2
    canvas.alpha_composite(glyph, (offset, offset))
    return canvas


def build(out: Path) -> None:
    mark = (HERE / "proofbox-mark.svg").read_text()
    (out / "favicon.svg").write_text(themed_svg(mark))
    tile(mark, 180, 0.14).convert("RGB").save(
        out / "apple-touch-icon.png", optimize=True
    )
    tile(mark, 64, 0.06).save(out / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", type=Path, default=HERE)
    build(parser.parse_args().out)
