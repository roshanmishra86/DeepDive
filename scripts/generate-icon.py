#!/usr/bin/env python3
"""Generate the Deep Work app icon master (assets/icon.png, 1024x1024).

The mark is the app's central motif: the pomodoro progress ring. A cream
270-degree arc with round caps on the accent-green rounded square. Rendered
at 4x and downscaled for smooth edges. No text, so no font dependency.

Usage:  python3 scripts/generate-icon.py
Then:   ./node_modules/.bin/tauri icon assets/icon.png
"""

import math
import os
from PIL import Image, ImageDraw

SIZE = 1024
SS = 4  # supersample factor
S = SIZE * SS

ACCENT = (47, 93, 80, 255)       # --accent #2f5d50
CREAM = (247, 245, 241, 255)     # --bg-window #f7f5f1

CORNER_RADIUS = 224              # ~22% of 1024, squircle-ish
RING_RADIUS = 300
RING_WIDTH = 92
ARC_START_DEG = 270              # top (PIL: 0 = 3 o'clock, clockwise)
ARC_SWEEP_DEG = 270              # three quarters, echoing the 3-pomodoro block


def main() -> None:
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    r = CORNER_RADIUS * SS
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=ACCENT)

    cx = cy = S // 2
    rr = RING_RADIUS * SS
    w = RING_WIDTH * SS
    bbox = [cx - rr, cy - rr, cx + rr, cy + rr]
    end = (ARC_START_DEG + ARC_SWEEP_DEG) % 360
    d.arc(bbox, start=ARC_START_DEG, end=end, fill=CREAM, width=w)

    # Round caps: filled circles at both arc endpoints.
    for deg in (ARC_START_DEG, end):
        rad = math.radians(deg)
        x = cx + rr * math.cos(rad)
        y = cy + rr * math.sin(rad)
        cap = w // 2
        d.ellipse([x - cap, y - cap, x + cap, y + cap], fill=CREAM)

    img = img.resize((SIZE, SIZE), Image.LANCZOS)

    out = os.path.join(os.path.dirname(__file__), "..", "assets", "icon.png")
    out = os.path.abspath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
