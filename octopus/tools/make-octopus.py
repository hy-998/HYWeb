"""Builds one sprite sheet per style, plus a contact sheet for review.

Usage:
    python octopus/tools/make-octopus.py            # all styles
    python octopus/tools/make-octopus.py glass mesh # only these

Each style is a full 12-frame strip at 12fps, so the player can swap between them
without touching the animation timing.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

from rig import FPS, FRAMES, TILE
from styles import STYLES

OUT_DIR = Path(__file__).resolve().parent.parent / "assets"
OUT_DIR.mkdir(parents=True, exist_ok=True)

PAGE = OUT_DIR.parent / "index.html"


def build_style(name, draw):
    sheet = Image.new("RGB", (TILE * FRAMES, TILE))
    for i in range(FRAMES):
        # The loop must close, so the phase runs over the half-open interval.
        sheet.paste(draw(i / FRAMES), (i * TILE, 0))
    path = OUT_DIR / f"octopus-{name}.png"
    sheet.save(path, optimize=True)
    return sheet, path


def contact_sheet(built):
    """One frame of each style side by side, for a single look."""
    n = len(built)
    pad = 12
    label = 22
    cols = 4
    rows = (n + cols - 1) // cols
    w = cols * TILE + (cols + 1) * pad
    h = rows * (TILE + label) + (rows + 1) * pad
    sheet = Image.new("RGB", (w, h), (12, 16, 22))
    dr = ImageDraw.Draw(sheet)
    for i, (name, img) in enumerate(built):
        cx = pad + (i % cols) * (TILE + pad)
        cy = pad + (i // cols) * (TILE + label + pad)
        sheet.paste(img, (cx, cy))
        dr.text((cx + 2, cy + TILE + 4), name, fill=(180, 200, 210))
    path = OUT_DIR.parent / ".shots" / "styles-contact-sheet.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path, optimize=True)
    return path


def inline_meta(meta):
    """Write the frame metadata into the page between its META markers.

    Replacing only what sits between the markers keeps this idempotent, so
    regenerating cannot corrupt the page.
    """
    import re

    if not PAGE.exists():
        return
    source = PAGE.read_text(encoding="utf-8")
    payload = json.dumps(meta, ensure_ascii=False, separators=(", ", ": "))
    pattern = re.compile(r"(/\*META:BEGIN\*/)(.*?)(/\*META:END\*/)", re.S)
    if not pattern.search(source):
        print("note: page has no META markers, skipping inline")
        return
    PAGE.write_text(
        pattern.sub(lambda m: m.group(1) + " " + payload + " " + m.group(3), source),
        encoding="utf-8",
    )


def main(argv):
    wanted = [a for a in argv[1:] if not a.startswith("-")] or list(STYLES)
    unknown = [w for w in wanted if w not in STYLES]
    if unknown:
        print(f"unknown style(s): {', '.join(unknown)}")
        print(f"available: {', '.join(STYLES)}")
        return 1

    built = []
    for name in wanted:
        print(f"  {name}…", end="", flush=True)
        sheet, path = build_style(name, STYLES[name])
        built.append((name, sheet.crop((0, 0, TILE, TILE))))
        print(f"  {sheet.width}x{sheet.height}  {path.stat().st_size / 1024:.0f} KB")

    meta = {
        "name": "Glass Octopus",
        "frameWidth": TILE,
        "frameHeight": TILE,
        "frames": FRAMES,
        "fps": FPS,
        "columns": FRAMES,
        "rows": 1,
        "loopMs": round(FRAMES / FPS * 1000),
        "styles": list(STYLES),
    }
    (OUT_DIR / "octopus.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    inline_meta(meta)

    sheet_path = contact_sheet(built) if len(built) > 1 else None
    print(f"\n{len(built)} style(s); meta inlined into {PAGE.name}")
    if sheet_path:
        print(f"contact sheet: {sheet_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
