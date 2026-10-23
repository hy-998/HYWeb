"""Cute static prints: the same press techniques, on a cute build, with confetti.

No animation. Each piece is a single printed illustration at 512px, meant to be
looked at rather than played:

  hearts       classic two-ink screen
  stars        four-colour process, rosettes
  bubbles      stochastic FM screen, no visible grid
  mixed        coarse newsprint, badly registered
  engraved     cross-hatched line screen, one warm ink
  receipt      dot matrix on a till roll

The decorations are folded into the same coverage field as the creature, so they
are screened by the same plates. Drawn on top afterwards they would look like
stickers rather than part of the same print.
"""

import json
from pathlib import Path

from PIL import Image, ImageDraw

import rig
from rig import (
    SCENES, decoration_mask, edge_band, eye_geometry, full_mask, tint,
)
import prints
from prints import (
    PITCH_UNIT, apply_paper, coverage, dot_screen, line_screen, plate,
    print_plates, stochastic_screen,
)

OUT_DIR = Path(__file__).resolve().parent.parent / "assets"
OUT_DIR.mkdir(parents=True, exist_ok=True)

POSTER = 512          # final poster size
WORK = POSTER * 3     # the rig works supersampled, as everywhere else


def setup():
    """Point the rig at the poster size and switch to the cute proportions.

    Called at the start of every piece rather than once at import time: the rig's
    geometry is module-level, so anything that resizes it has to do so
    deliberately, right before it draws.
    """
    rig.configure(WORK, cute=True)


def _eyes(img, phase, color, cute=True, glint=None):
    """Print the eyes solid, with a big highlight. The glint is the charm."""
    d = ImageDraw.Draw(img)
    for ex, ey, eye_r, ry, _b in eye_geometry(phase, cute=cute):
        if ry < 0.5:
            continue
        d.ellipse([ex - eye_r, ey - ry, ex + eye_r, ey + ry], fill=color + (255,))
        if glint is not None:
            g = eye_r * rig.CUTE["glint"]
            gx, gy = ex - eye_r * 0.30, ey - eye_r * 0.34
            d.ellipse([gx - g / 2, gy - g / 2, gx + g / 2, gy + g / 2], fill=glint + (255,))
    return img


def finish(img):
    """Downscale to the poster size. Static pieces do not share the tile grid."""
    return img.convert("RGB").resize((POSTER, POSTER), Image.LANCZOS)


# ------------------------------------------------------------------ pieces

def piece_hearts(phase=0.0):
    """Classic two-ink screen, hearts, 15 and 75 degrees."""
    setup()
    scene = decoration_mask(phase, SCENES["hearts"])
    cov = coverage(phase, cute=True, decorate=scene)
    navy = dot_screen(cov, 15.0, PITCH_UNIT * 7.0)
    rust = dot_screen(cov, 75.0, PITCH_UNIT * 7.0, shift=PITCH_UNIT * 3.0)
    img = print_plates((240, 234, 221), [
        (rust, (214, 88, 74), 0.82),
        (navy, (38, 56, 96), 0.92),
    ])
    img = _eyes(img, phase, (24, 34, 60), glint=(250, 246, 238))
    return finish(apply_paper(img, 3, 9))


def piece_stars(phase=0.0):
    """Four-colour process. The four screen angles are what make the rosettes."""
    setup()
    scene = decoration_mask(phase, SCENES["stars"])
    cov = coverage(phase, gamma=0.85, cute=True, decorate=scene)
    k = cov * 0.0 + 0.0          # no black plate: this one should stay bright
    c = (cov * 0.95 - 0.10).clip(0, 1)
    m = (cov * 1.02 - 0.22).clip(0, 1)
    y = (cov * 1.10 - 0.34).clip(0, 1)
    pitch = PITCH_UNIT * 6.0
    img = print_plates((247, 244, 235), [
        (dot_screen(y, 0.0, pitch), (252, 206, 46), 0.88),
        (dot_screen(m, 15.0, pitch), (232, 62, 132), 0.88),
        (dot_screen(c, 75.0, pitch), (38, 186, 226), 0.88),
    ])
    img = _eyes(img, phase, (44, 40, 62), glint=(255, 252, 246))
    return finish(apply_paper(img, 7, 9))


def piece_bubbles(phase=0.0):
    """Stochastic screening: a fine random dot field, no grid at all."""
    setup()
    scene = decoration_mask(phase, SCENES["bubbles"])
    cov = coverage(phase, gamma=0.95, cute=True, decorate=scene)
    deep = stochastic_screen(cov, seed=17, density=0.94)
    sand = stochastic_screen((cov - 0.26).clip(0, 1), seed=31, density=0.68)
    img = print_plates((248, 245, 238), [
        (sand, (198, 152, 102), 0.70),
        (deep, (44, 62, 92), 0.94),
    ])
    img = _eyes(img, phase, (26, 38, 58), glint=(252, 250, 244))
    return finish(apply_paper(img, 23, 7))


def piece_mixed(phase=0.0):
    """Coarse newsprint on grey stock, badly registered."""
    setup()
    scene = decoration_mask(phase, SCENES["mixed"])
    cov = coverage(phase, gamma=1.2, cute=True, decorate=scene)
    pitch = PITCH_UNIT * 10.0
    shift = PITCH_UNIT * 5.0
    black = dot_screen(cov, 45.0, pitch)
    cyan = dot_screen(cov, 15.0, pitch, shift=shift)
    magenta = dot_screen(cov, 75.0, pitch, shift=-shift)
    img = print_plates((214, 210, 202), [
        (cyan, (88, 152, 180), 0.60),
        (magenta, (190, 94, 122), 0.60),
        (black, (48, 48, 54), 0.94),
    ])
    img = _eyes(img, phase, (42, 42, 48), glint=(232, 228, 220))
    img = img.transform(img.size, Image.AFFINE,
                        (1, 0.010, -rig.S * 0.004, 0.008, 1, -rig.S * 0.004),
                        resample=Image.BILINEAR)
    return finish(apply_paper(img, 13, 15))


def piece_engraved(phase=0.0):
    """Cross-hatched line screen in one warm ink, with a fine key line.

    Built the other way round from the dot-screen pieces. An engraving is mostly
    solid ink with the hatching reserved for the shaded parts, so the limbs are
    taken to solid and only the mantle keeps a graded screen. Deriving this from
    a general coverage field does not work: the limbs come out as outlines with
    hollow middles, because a line screen holds far less ink per unit area than a
    dot screen at the same pitch.
    """
    setup()
    import numpy as np
    from PIL import ImageDraw, ImageFilter

    scene = decoration_mask(phase, SCENES["hearts"])
    cov = coverage(phase, gamma=0.50, cute=True, decorate=scene)
    mask = np.asarray(full_mask(phase, cute=True), dtype="float32") / 255.0

    # The limbs are the part of the silhouette that is not the mantle, plus the
    # confetti, which prints as solid marks.
    body = Image.new("L", (rig.S, rig.S), 0)
    rig.draw_mantle(ImageDraw.Draw(body), phase, cute=True)
    body = np.asarray(body.filter(ImageFilter.GaussianBlur(rig.SUPERSAMPLE * 1.2)),
                      dtype="float32") / 255.0
    dec = np.asarray(scene, dtype="float32") / 255.0

    limb = np.clip(mask - body, 0, 1)
    # Clipped to the silhouette: the mantle mask is blurred, so unclipped it
    # spreads past the outline and prints hatching in the gaps between the limbs.
    cov = np.clip((cov + limb * 1.6 + dec * 1.6) * mask, 0, 1)

    pitch = PITCH_UNIT * 3.6
    a = line_screen((cov * 1.55).clip(0, 1), 35.0, pitch)
    b = line_screen((cov * 1.20).clip(0, 1), 125.0, pitch)
    c = line_screen((cov * 0.78).clip(0, 1), 80.0, pitch)
    img = print_plates((235, 224, 198), [
        (c, (124, 100, 62), 0.50),
        (b, (98, 76, 46), 0.78),
        (a, (52, 40, 24), 0.95),
    ])
    img = _eyes(img, phase, (44, 34, 20), glint=(246, 238, 220))
    key = edge_band(full_mask(phase, cute=True), inner_px=0.0, outer_px=rig.SUPERSAMPLE * 1.4)
    img = Image.alpha_composite(img, tint(key, (48, 38, 24), 0.80))
    return finish(apply_paper(img, 19, 9))


def piece_receipt(phase=0.0):
    """Dot matrix on a till roll: square grid, ruling, perforated edges."""
    setup()
    paper = (250, 248, 242)
    scene = decoration_mask(phase, SCENES["mixed"])
    cov = coverage(phase, gamma=1.05, cute=True, decorate=scene)

    img = Image.new("RGBA", (rig.S, rig.S), paper + (255,))
    # Faint ruling, like the printed bands on a roll.
    rule = Image.new("L", (rig.S, rig.S), 0)
    rd = ImageDraw.Draw(rule)
    step = int(rig.SUPERSAMPLE * 30)
    for y in range(0, rig.S, step):
        rd.rectangle([0, y, rig.S, y + int(rig.SUPERSAMPLE * 1.6)], fill=44)
    img = Image.alpha_composite(img, prints.tint(rule, (150, 180, 200), 0.32))

    dots = dot_screen(cov, 0.0, PITCH_UNIT * 4.8)
    img = Image.alpha_composite(img, plate(dots, (38, 52, 66), 0.94))

    img = _eyes(img, phase, (26, 38, 52), glint=(250, 250, 246))
    for ex, ey, eye_r, ry, _b in eye_geometry(phase, cute=True):
        if ry < 0.5:
            continue
        ImageDraw.Draw(img).ellipse(
            [ex - eye_r, ey - ry, ex + eye_r, ey + ry],
            outline=(38, 52, 66, 255), width=int(rig.SUPERSAMPLE * 2.2))

    # Perforations along both edges: the whole point of a till roll.
    perf = Image.new("RGBA", (rig.S, rig.S), (0, 0, 0, 0))
    pd = ImageDraw.Draw(perf)
    hole = int(rig.SUPERSAMPLE * 3.0)
    pstep = int(rig.SUPERSAMPLE * 13)
    for y in range(pstep // 2, rig.S, pstep):
        for x in (int(rig.SUPERSAMPLE * 7), rig.S - int(rig.SUPERSAMPLE * 7)):
            pd.ellipse([x - hole, y - hole, x + hole, y + hole], fill=(198, 192, 182, 255))
    img = Image.alpha_composite(img, perf)
    return finish(apply_paper(img, 29, 6))


PIECES = {
    "hearts": piece_hearts,
    "stars": piece_stars,
    "bubbles": piece_bubbles,
    "mixed": piece_mixed,
    "engraved": piece_engraved,
    "receipt": piece_receipt,
}

LABELS = {
    "hearts": ("爱心", "经典双色网屏"),
    "stars": ("星星", "四色印刷，玫瑰斑"),
    "bubbles": ("泡泡", "随机网点，无网格"),
    "mixed": ("综合", "粗网新闻纸，故意错版"),
    "engraved": ("雕刻", "交叉线屏，单色"),
    "receipt": ("小票", "针式打印，带齿孔"),
}


def contact_sheet(items):
    """All the pieces side by side, for one look at the set."""
    pad, label = 14, 24
    cols = 3
    rows = (len(items) + cols - 1) // cols
    cell = POSTER // 2
    w = cols * cell + (cols + 1) * pad
    h = rows * (cell + label) + (rows + 1) * pad
    sheet = Image.new("RGB", (w, h), (16, 20, 26))
    d = ImageDraw.Draw(sheet)
    for i, (name, img) in enumerate(items):
        cx = pad + (i % cols) * (cell + pad)
        cy = pad + (i // cols) * (cell + label + pad)
        sheet.paste(img.resize((cell, cell), Image.LANCZOS), (cx, cy))
        d.text((cx + 2, cy + cell + 6), LABELS[name][0], fill=(190, 208, 216))
    path = OUT_DIR.parent / ".shots" / "cute-contact-sheet.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path, optimize=True)
    return path


def main():
    made = []
    thumbs = []
    for name, fn in PIECES.items():
        img = fn()
        path = OUT_DIR / f"cute-{name}.png"
        img.save(path, optimize=True)
        made.append(name)
        thumbs.append((name, img))
        print(f"  {name:9s} {img.width}x{img.height}  {path.stat().st_size / 1024:.0f} KB")

    meta = {
        "poster": POSTER,
        "pieces": [
            {"id": n, "label": LABELS[n][0], "note": LABELS[n][1]}
            for n in made
        ],
    }
    (OUT_DIR / "cute.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    inline_pieces(meta["pieces"])
    print(f"\n{len(made)} pieces")
    print(f"contact sheet: {contact_sheet(thumbs)}")
    return 0


def inline_pieces(pieces):
    """Write the piece list into the page, between the markers it ships with.

    Same idempotent pattern the sprite generator uses, so the page works off disk
    without a fetch and regenerating cannot corrupt it.
    """
    import re

    page = OUT_DIR.parent / "index.html"
    if not page.exists():
        return
    source = page.read_text(encoding="utf-8")
    payload = json.dumps(pieces, ensure_ascii=False, separators=(", ", ": "))
    pattern = re.compile(r"(/\*PRINTS:BEGIN\*/)(.*?)(/\*PRINTS:END\*/)", re.S)
    if not pattern.search(source):
        print("note: page has no PRINTS markers, skipping inline")
        return
    page.write_text(
        pattern.sub(lambda m: m.group(1) + " " + payload + " " + m.group(3), source),
        encoding="utf-8",
    )
    print("        piece list inlined into index.html")


if __name__ == "__main__":
    raise SystemExit(main())
