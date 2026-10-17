"""TSPL jobs for 4x6 in direct thermal fanfold at 203 dpi (8 dots/mm)."""

from PIL import Image

# The sheet is 101.6 x 152.4 mm; the sticker on it is about 150 mm long and
# the rest of the 152.4 mm pitch is the gap. The canvas covers the sticker
# only, and REFERENCE shifts it onto the sticker.
LABEL_WIDTH_MM = 101.6
LABEL_LENGTH_MM = 150.0
GAP_MM = 2.4
CANVAS = (776, 1168)
REFERENCE = (40, 28)
DENSITY = 8
SPEED = 4


def encode(label: Image.Image) -> bytes:
    """One print job for a mode "1" image, where 0 bits print black."""
    header = "\r\n".join(
        [
            f"SIZE {LABEL_WIDTH_MM} mm,{LABEL_LENGTH_MM} mm",
            f"GAP {GAP_MM} mm,0 mm",
            "DIRECTION 1",
            f"REFERENCE {REFERENCE[0]},{REFERENCE[1]}",
            f"DENSITY {DENSITY}",
            f"SPEED {SPEED}",
            "CLS",
            f"BITMAP 0,0,{(label.width + 7) // 8},{label.height},0,",
        ]
    )
    return header.encode("ascii") + label.tobytes() + b"\r\nPRINT 1,1\r\n"
