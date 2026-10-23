"""Crops one frame out of a sprite sheet so a single pose can be looked at.

The sheets are 12 frames wide, which makes any one frame too small to judge.

    python octopus/tools/crop-frame.py <style> [frame]
"""

import sys
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / ".shots"
OUT.mkdir(parents=True, exist_ok=True)


def main(argv):
    style = argv[1] if len(argv) > 1 else "halftone"
    frame = int(argv[2]) if len(argv) > 2 else 0
    src = Path(__file__).resolve().parent.parent / "assets" / f"octopus-{style}.png"
    if not src.exists():
        print(f"no such sheet: {src.name}")
        return 1

    sheet = Image.open(src)
    size = sheet.height
    img = sheet.crop((frame * size, 0, (frame + 1) * size, size))
    # Upscale a little: the tile is 384 and the screens are fine.
    out = img.resize((size * 2, size * 2), Image.NEAREST)
    path = OUT / f"frame-{style}-{frame}.png"
    out.save(path, optimize=True)
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
