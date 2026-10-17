# /// script
# requires-python = ">=3.14"
# dependencies = ["pillow"]
# ///
"""Renders the dev sample pack: a synthetic clip of three items going into a carton,
and the detection track the vision agent would have stored for it.

Both come from the same geometry, so the replayed boxes sit exactly on the items.
Writes apps/web/src/debug/fixtures/pack-demo.mp4 and pack-demo-track.json.
"""

import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "apps/web/src/debug/fixtures"
WIDTH, HEIGHT, FPS, SECONDS = 960, 540, 24, 12
TRACK_HZ = 10
CARTON = (330, 190, 640, 470)

# label, track id, size, colour, start position, rest position, move start and end in seconds
ITEMS = [
    ("mug", 1, (90, 90), (232, 226, 214), (-120, 230), (350, 215), 1.5, 3.0),
    ("coffee beans", 2, (120, 70), (107, 74, 43), (1080, 260), (490, 240), 4.5, 6.0),
    ("card", 3, (130, 60), (201, 79, 79), (380, -100), (370, 385), 7.5, 9.0),
]


def ease(u: float) -> float:
    u = min(max(u, 0.0), 1.0)
    return u * u * (3 - 2 * u)


def item_box(item, t: float) -> tuple[float, float, float, float] | None:
    _, _, (w, h), _, (sx, sy), (rx, ry), start, end = item
    if t < start:
        return None
    k = ease((t - start) / (end - start))
    x, y = sx + (rx - sx) * k, sy + (ry - sy) * k
    if x + w <= 0 or x >= WIDTH or y + h <= 0 or y >= HEIGHT:
        return None
    return x, y, x + w, y + h


def frame(t: float) -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), (58, 52, 46))
    draw = ImageDraw.Draw(image)
    for i in range(0, WIDTH, 48):
        draw.line([(i, 0), (i, HEIGHT)], fill=(62, 56, 50), width=2)
    draw.rectangle(CARTON, fill=(176, 132, 86), outline=(120, 86, 52), width=8)
    draw.rectangle(
        (CARTON[0] + 14, CARTON[1] + 14, CARTON[2] - 14, CARTON[3] - 14),
        fill=(150, 108, 66),
    )
    for item in ITEMS:
        box = item_box(item, t)
        if box:
            draw.rounded_rectangle(
                box, radius=12, fill=item[3], outline=(30, 30, 30), width=2
            )
    return image


def track() -> list[dict]:
    points = []
    for step in range(SECONDS * TRACK_HZ):
        t = step / TRACK_HZ
        for index, item in enumerate(ITEMS):
            box = item_box(item, t)
            if box is None:
                continue
            x1, y1, x2, y2 = box
            points.append(
                {
                    "t_ms": round(t * 1000),
                    "track": item[1],
                    "label": item[0],
                    "conf": round(0.86 + 0.03 * index + 0.01 * (step % 3), 3),
                    "box": [
                        round(max(x1, 0) / WIDTH, 4),
                        round(max(y1, 0) / HEIGHT, 4),
                        round(min(x2, WIDTH) / WIDTH, 4),
                        round(min(y2, HEIGHT) / HEIGHT, 4),
                    ],
                }
            )
    return points


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    encoder = subprocess.Popen(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-s",
            f"{WIDTH}x{HEIGHT}",
            "-r",
            str(FPS),
            "-i",
            "-",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "28",
            "-movflags",
            "+faststart",
            str(OUT / "pack-demo.mp4"),
        ],
        stdin=subprocess.PIPE,
    )
    assert encoder.stdin
    for index in range(SECONDS * FPS):
        encoder.stdin.write(frame(index / FPS).tobytes())
    encoder.stdin.close()
    encoder.wait()
    (OUT / "pack-demo-track.json").write_text(json.dumps(track()) + "\n")


if __name__ == "__main__":
    main()
