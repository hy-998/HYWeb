"""Compares light ramps for the cute build, so the volume can be judged.

The earlier animated halftone read as a lit volume because the screen carried the
shading across the whole creature. A single flat value would print it as a
silhouette, which loses exactly that. This renders the same screen with several
ramps side by side to pick one.

    python octopus/tools/compare-ramps.py
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import rig
from rig import SCENES, decoration_mask, eye_geometry, full_mask

OUT = Path(__file__).resolve().parent.parent / ".shots"
OUT.mkdir(parents=True, exist_ok=True)

POSTER = 300
WORK = POSTER * 3

# (label, top value, bottom value, gamma) -- value is 0 at the crown and 1 at the
# bottom of the frame, and coverage is (1 - value) ** gamma.
RAMPS = [
    ("flat",      0.00, 0.00, 1.0),
    ("top-light", 0.86, 0.20, 1.0),
    ("crown-lit", 1.00, 0.26, 1.0),
    ("crown-lit", 1.00, 0.26, 0.75),
    ("deep",      1.00, 0.10, 1.0),
    ("deep",      1.00, 0.10, 0.65),
]


def render(lo, hi, gamma, phase=0.0):
    rig.configure(WORK, cute=True)
    mask = np.asarray(full_mask(phase, cute=True), dtype="float32") / 255.0

    yy = np.linspace(0.0, 1.0, rig.S, dtype="float32")[:, None]
    value = hi - (hi - lo) * yy
    cov = (np.clip(1.0 - value, 0, 1) ** gamma) * mask

    # Eyes held back, on an ellipse rather than a rectangle.
    for ex, ey, er, ry, _b in eye_geometry(phase, cute=True):
        if ry < 0.5:
            continue
        rx, ry2 = er * 1.3, ry * 1.3
        x0, x1 = max(0, int(ex - rx)), min(rig.S, int(ex + rx) + 1)
        y0, y1 = max(0, int(ey - ry2)), min(rig.S, int(ey + ry2) + 1)
        gx = (np.arange(x0, x1) - ex) / rx
        gy = (np.arange(y0, y1) - ey) / ry2
        rr = np.sqrt(gx[None, :] ** 2 + gy[:, None] ** 2)
        cov[y0:y1, x0:x1] *= 0.10 + 0.90 * np.clip((rr - 0.45) / 0.55, 0, 1) ** 1.4

    import math
    th = math.radians(15.0)
    xx, yyv = np.mgrid[0:rig.S, 0:rig.S].astype("float32")
    pitch = rig.SUPERSAMPLE * 7.0
    plates = []
    for ang, shift, color, ink in ((15.0, 0.0, (32, 52, 92), 0.92),
                                   (75.0, rig.SUPERSAMPLE * 3.0, (208, 76, 62), 0.80)):
        a = math.radians(ang)
        u = xx * math.cos(a) + yyv * math.sin(a) + shift
        v = -xx * math.sin(a) + yyv * math.cos(a) + shift * 0.6
        du = (u / pitch) - np.floor(u / pitch) - 0.5
        dv = (v / pitch) - np.floor(v / pitch) - 0.5
        dots = (np.sqrt(du * du + dv * dv) < np.sqrt(np.clip(cov, 0, 1)) * 0.70)
        plates.append((dots, color, ink))

    img = Image.new("RGBA", (rig.S, rig.S), (238, 232, 218, 255))
    for dots, color, ink in plates:
        arr = np.zeros((rig.S, rig.S, 4), dtype="uint8")
        arr[..., 0], arr[..., 1], arr[..., 2] = color
        arr[..., 3] = (dots * 255 * ink).astype("uint8")
        img = Image.alpha_composite(img, Image.fromarray(arr))

    d = ImageDraw.Draw(img)
    for ex, ey, er, ry, _b in eye_geometry(phase, cute=True):
        if ry < 0.5:
            continue
        d.ellipse([ex - er, ey - ry, ex + er, ey + ry], fill=(20, 30, 56, 255))
    return img.convert("RGB").resize((POSTER, POSTER), Image.LANCZOS)


def main():
    pad, label = 10, 20
    cols = 2
    rows = (len(RAMPS) + cols - 1) // cols
    w = cols * POSTER + (cols + 1) * pad
    h = rows * (POSTER + label) + (rows + 1) * pad
    sheet = Image.new("RGB", (w, h), (16, 20, 26))
    dr = ImageDraw.Draw(sheet)
    for i, (name, lo, hi, g) in enumerate(RAMPS):
        img = render(lo, hi, g)
        cx = pad + (i % cols) * (POSTER + pad)
        cy = pad + (i // cols) * (POSTER + label + pad)
        sheet.paste(img, (cx, cy))
        dr.text((cx + 2, cy + POSTER + 4),
                f"{name}  bottom={lo:.2f} top={hi:.2f} gamma={g}", fill=(190, 208, 216))
    path = OUT / "ramp-compare.png"
    sheet.save(path, optimize=True)
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
