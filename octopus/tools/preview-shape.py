"""Renders the rig as a plain silhouette, with no print effects.

Used while shaping the character: the halftone screens hide the outline, so it is
hard to tell whether the head reads as a dome or as a box until the screen is
taken away.

    python octopus/tools/preview-shape.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

import rig
from rig import CUTE, S, draw_mantle, eye_geometry, full_mask, mantle

OUT = Path(__file__).resolve().parent.parent / ".shots"
OUT.mkdir(parents=True, exist_ok=True)


def main():
    for size in (384, 768):
        rig.configure(size * 3, cute=True)
        img = Image.new("L", (rig.S, rig.S), 0)
        d = ImageDraw.Draw(img)

        # The body silhouette only, so the outline is what is being judged.
        mask = full_mask(0.0, cute=True)
        img.paste(mask, (0, 0))

        # The head outline on its own, drawn over.
        d.line(rig.mantle_polygon(0.0, cute=True) + [rig.mantle_polygon(0.0, cute=True)[0]],
               fill=140, width=int(rig.SUPERSAMPLE * 1.2), joint="curve")

        # Eye positions.
        for ex, ey, er, ry, _b in eye_geometry(0.0, cute=True):
            d.ellipse([ex - er, ey - ry, ex + er, ey + ry], outline=190,
                      width=int(rig.SUPERSAMPLE * 1.2))

        # Bounding box of the head, to see how square it actually is.
        poly = rig.mantle_polygon(0.0, cute=True)
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        w, h = max(xs) - min(xs), max(ys) - min(ys)
        d.rectangle([min(xs), min(ys), max(xs), max(ys)], outline=90,
                    width=int(rig.SUPERSAMPLE))
        print(f"  head {w:.0f}x{h:.0f}  wobble={w / h:.3f}  (1.00 would be a circle)")

        out = img.convert("RGB").resize((size, size), Image.LANCZOS)
        out.save(OUT / f"shape-{size}.png")

        # A second view with the head filled, to judge it alone.
        solo = Image.new("L", (rig.S, rig.S), 0)
        draw_mantle(ImageDraw.Draw(solo), 0.0, cute=True)
        for ex, ey, er, ry, _b in eye_geometry(0.0, cute=True):
            ImageDraw.Draw(solo).ellipse([ex - er, ey - ry, ex + er, ey + ry], fill=0)
        solo.convert("RGB").resize((size, size), Image.LANCZOS).save(OUT / f"shape-head-{size}.png")

    print(f"\nwrote {OUT}/shape-384.png and shape-head-384.png")


if __name__ == "__main__":
    main()
