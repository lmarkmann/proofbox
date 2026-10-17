from collections.abc import Sequence
from io import BytesIO
from pathlib import Path

import resvg_py
import segno
from PIL import Image, ImageDraw, ImageFont

from proofbox_printer.tspl import CANVAS

ASSETS = Path(__file__).parent
MARGIN = 40
WORDMARK_WIDTH = 440
QR_SIDE = 560
QUIET_MODULES = 4


def font(size: int, weight: int) -> ImageFont.FreeTypeFont:
    face = ImageFont.truetype(ASSETS / "InstrumentSans-Variable.ttf", size)
    face.set_variation_by_axes([100, weight])
    return face


def fitted(
    text: str, size: int, weight: int, width: int
) -> ImageFont.FreeTypeFont:
    while (face := font(size, weight)).getlength(text) > width:
        size -= 4
    return face


def wordmark() -> Image.Image:
    png = resvg_py.svg_to_bytes(
        svg_path=str(ASSETS / "proofbox-wordmark.svg"), width=WORDMARK_WIDTH
    )
    alpha = Image.open(BytesIO(png)).getchannel("A")
    return alpha.point(lambda a: 0 if a >= 128 else 255).convert("1")


def qr_code(url: str) -> Image.Image:
    """Includes the quiet zone, so nothing pasted beside it can touch the code."""
    qr = segno.make(url, error="m", micro=False)
    rows = list(qr.matrix_iter(border=QUIET_MODULES))
    modules = Image.new("1", (len(rows), len(rows)), 1)
    modules.putdata([0 if dark else 1 for row in rows for dark in row])
    scale = QR_SIDE // len(rows)
    return modules.resize(
        (len(rows) * scale, len(rows) * scale), Image.Resampling.NEAREST
    )


def render(order_id: str, proof_url: str, lines: Sequence[str]) -> Image.Image:
    """The shipping-box label: wordmark, order ID, QR to the proof, detail lines."""
    label = Image.new("1", CANVAS, 1)
    draw = ImageDraw.Draw(label)
    width = CANVAS[0] - 2 * MARGIN
    centre = CANVAS[0] // 2

    mark = wordmark()
    label.paste(mark, (MARGIN, MARGIN))
    y = MARGIN + mark.height + 28
    draw.line((MARGIN, y, CANVAS[0] - MARGIN, y), fill=0, width=4)

    y += 36
    draw.text((MARGIN, y), "ORDER", font=font(30, 600), fill=0, anchor="lt")
    y += 48
    order_font = fitted(order_id, 120, 700, width)
    draw.text((MARGIN, y), order_id, font=order_font, fill=0, anchor="lt")
    y += round(order_font.size)

    qr = qr_code(proof_url)
    label.paste(qr, (centre - qr.width // 2, y))
    y += qr.width
    draw.text(
        (centre, y),
        "Scan for packing proof",
        font=font(34, 600),
        fill=0,
        anchor="mt",
    )

    for index, line in enumerate(reversed(lines)):
        draw.text(
            (MARGIN, CANVAS[1] - MARGIN - index * 46),
            line,
            font=fitted(line, 34, 400, width),
            fill=0,
            anchor="ls",
        )
    return label
