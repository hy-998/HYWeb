"""Halftone prints: six ways a press can turn the rig into dots.

The measure of a halftone print is that the screen *is* the shading: coverage
varies across the form, so the dot size carries the volume. A single flat
coverage would only stencil the silhouette, which is what the first version of
this style did.

Each variant is a real printing method, not a recolour:

  classic      two inks at 15 and 75 degrees, a little out of register
  process      four CMYK separations at the classic 15/75/0/45 angles
  newsprint    a coarse screen on grey stock, badly registered
  engraved     line screen instead of dots, one ink, cross-hatched
  stochastic   no grid: a fine random FM screen
  receipt      dot matrix on a till roll, with the perforations

Everything geometric comes from rig.py, so the motion is shared with the other
styles.
"""

import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import rig
from rig import (
    CUTE, arm_points, downscale, edge_band, eye_geometry, full_mask, mantle, tint,
)

PITCH_UNIT = rig.SUPERSAMPLE      # one unit of "screen pitch" in working pixels

# (crown, bottom) for the light ramp.
#
# These are not alphas -- they are the value the coverage is derived from, and
# `coverage` inverts them, so a low number here means a lot of ink. The rule that
# matters: the creature is printed as a solid mass of ink with the screen
# modulating it, not as a photograph of a lit object. That is what the animated
# halftone style does, and it is the version that read best.
#
# Pushing `bottom` toward 1.0 is the mistake to avoid: coverage collapses toward
# zero and the creature becomes a pale ghost with a few dots on it. The values
# here keep it between roughly 0.35 and 1.0.
RAMP = (1.00, 0.02)


def S():
    """The rig's current working size.

    Read through a call, never captured at import: the rig can be resized for a
    different output size, and a stale copy would silently be the wrong shape.
    """
    return rig.S


def SUPERSAMPLE():
    return rig.SUPERSAMPLE


# --------------------------------------------------------------- shading pass

def coverage(phase, gamma=1.0, cute=False, decorate=None, arm_ink=0.30):
    """How much ink each pixel should get, as a field in 0..1.

    Dark where the creature is solid, opening up where light should pass, so the
    screen reads as a lit volume rather than as a stencil. The eyes are held back
    to zero: they are printed solid afterwards, and screening them twice would
    only muddy the face.

    `arm_ink` is how much ink the limbs hold relative to the body. The dot
    screens want them a little lighter than the body; a line screen holds far
    less ink and wants them nearly solid, or the arms read as outlines.

    `decorate` is an optional mask of floating shapes; it is folded in here so
    they are printed by the same plates as the creature.
    """
    kw = CUTE_LIMB if cute else None
    mask_image = full_mask(phase, cute=cute, limb=kw)
    mask = np.asarray(mask_image, dtype="float32") / 255.0

    # A lit volume, but a printed one: mostly solid ink, opening toward the crown
    # so the screen still carries a highlight. It has to be one gradient across
    # the whole creature -- giving the limbs their own tone leaves a seam, and at
    # the size of these pieces that seam reads as the head wearing a helmet.
    #
    # Below the crown the ramp settles near full ink, which is how the animated
    # halftone style prints and what makes the creature a bold mass. See RAMP for
    # the values and the failure mode to avoid.
    crown, bottom = RAMP
    yy = np.linspace(0.0, 1.0, S(), dtype="float32")[:, None]
    value = crown - (crown - bottom) * np.clip((yy - 0.10) / 0.70, 0, 1) ** 0.9

    # A little extra ink where the creature meets the page: contact shadowing,
    # which is the cheapest way to make the print sit on the paper rather than
    # float. Blurred and clipped to the silhouette, so it adds no edges of its
    # own -- an inner rim band, built like the rim lights elsewhere.
    soft = np.asarray(mask_image.filter(ImageFilter.GaussianBlur(SUPERSAMPLE() * 1.8)),
                      dtype="float32") / 255.0
    inner = np.asarray(mask_image.filter(ImageFilter.GaussianBlur(SUPERSAMPLE() * 1.8)),
                       dtype="float32") / 255.0
    inner = np.clip(inner - 0.30, 0, 1) / 0.70
    contact = np.clip(soft - inner, 0, 1)

    cov = np.clip(1.0 - value, 0.0, 1.0) ** gamma
    cov = np.clip(cov + contact * 0.22, 0, 1)
    cov = cov * mask

    if decorate is not None:
        dec = np.asarray(decorate, dtype="float32") / 255.0
        # Decorations sit a little lighter than the body, so they read as
        # confetti in front rather than as part of the creature.
        cov = np.maximum(cov, dec * 0.72)

    # Back off the eyes, so the solid eye stands clear of the screen. The falloff
    # follows an ellipse: a rectangular backoff prints a rectangle, which is
    # exactly the kind of straight line this style must not have on a face.
    for ex, ey, eye_r, ry, _b in eye_geometry(phase, cute=cute):
        if ry < 0.5:
            continue
        rx, ry_ = eye_r * 1.30, ry * 1.30
        x0, x1 = max(0, int(ex - rx)), min(S(), int(ex + rx) + 1)
        y0, y1 = max(0, int(ey - ry_)), min(S(), int(ey + ry_) + 1)
        if x1 <= x0 or y1 <= y0:
            continue
        gx = (np.arange(x0, x1) - ex) / rx
        gy = (np.arange(y0, y1) - ey) / ry_
        rr = np.sqrt(gx[None, :] ** 2 + gy[:, None] ** 2)
        # 0.10 in the middle of the eye, easing back to full coverage at the rim.
        fall = 0.10 + 0.90 * np.clip((rr - 0.45) / 0.55, 0, 1) ** 1.4
        cov[y0:y1, x0:x1] *= fall
    return cov


# The cute arm proportions, as the keyword set arm_points and full_mask take.
CUTE_LIMB = {
    "base": CUTE["arm_base"],
    "tip": CUTE["arm_tip"],
    "length": CUTE["arm_length"],
    "curl": CUTE["arm_curl"],
    "spread": CUTE["arm_spread"],
}


# ------------------------------------------------------------------ screens

_GRID = None


def grid():
    """The pixel coordinate grids, built once per working size."""
    global _GRID
    if _GRID is None:
        yy, xx = np.mgrid[0:S(), 0:S()].astype("float32")
        _GRID = (xx, yy)
    return _GRID


def reset_grid():
    """Drop the cached coordinate mesh. Called when the rig is resized."""
    global _GRID
    _GRID = None


def dot_screen(cov, angle_deg, pitch, shift=0.0):
    """A rotated grid of dots whose area follows the coverage."""
    xx, yy = grid()
    ang = math.radians(angle_deg)
    u = xx * math.cos(ang) + yy * math.sin(ang) + shift
    v = -xx * math.sin(ang) + yy * math.cos(ang) + shift * 0.6
    du = (u / pitch) - np.floor(u / pitch) - 0.5
    dv = (v / pitch) - np.floor(v / pitch) - 0.5
    dist = np.sqrt(du * du + dv * dv)
    # Area, not radius, tracks the coverage: that is what a screen does.
    radius = np.sqrt(np.clip(cov, 0, 1)) * 0.70
    return (dist < radius).astype("float32")


def line_screen(cov, angle_deg, pitch, shift=0.0):
    """Lines instead of dots, for engraving. Width follows the coverage."""
    xx, yy = grid()
    ang = math.radians(angle_deg)
    u = xx * math.cos(ang) + yy * math.sin(ang) + shift
    du = (u / pitch) - np.floor(u / pitch) - 0.5
    return (np.abs(du) < np.clip(cov, 0, 1) * 0.52).astype("float32")


def stochastic_screen(cov, seed=5, density=1.0):
    """FM screening: fine dots placed at random, no visible grid."""
    rng = np.random.default_rng(seed)
    noise = rng.random((S(), S()), dtype="float32")
    return (noise < np.clip(cov, 0, 1) * density).astype("float32")


def plate(dots, color, ink=1.0):
    """Turn a boolean dot field into a paintable plate."""
    arr = np.zeros((S(), S(), 4), dtype="uint8")
    arr[..., 0], arr[..., 1], arr[..., 2] = color
    arr[..., 3] = (np.clip(dots, 0, 1) * 255 * ink).astype("uint8")
    return Image.fromarray(arr)


def print_plates(page_color, plates):
    """Composite plates in order onto a page, the way an ink sequence lays down."""
    img = Image.new("RGBA", (S(), S()), page_color + (255,))
    for dots, color, ink in plates:
        img = Image.alpha_composite(img, plate(dots, color, ink))
    return img


# ----------------------------------------------------------------- variants

def halftone_plate(cov, angle=15.0, pitch_units=7.0, shift=0.0, dot=0.70):
    """One screen plate, from a coverage field.

    `pitch_units` is in units of the supersample factor, which is what keeps the
    screen the same physical size whether the piece is a 384px sprite or a 512px
    poster. get that wrong and the dots come out a different size on every
    output, which is how the two halftone paths here ended up looking unlike each
    other in the first place.
    """
    return dot_screen(cov, angle, PITCH_UNIT * pitch_units, shift=shift) \
        if dot >= 1.0 else _scaled_dot_screen(cov, angle, PITCH_UNIT * pitch_units, shift, dot)


def _scaled_dot_screen(cov, angle_deg, pitch, shift, dot):
    xx, yy = grid()
    ang = math.radians(angle_deg)
    u = xx * math.cos(ang) + yy * math.sin(ang) + shift
    v = -xx * math.sin(ang) + yy * math.cos(ang) + shift * 0.6
    du = (u / pitch) - np.floor(u / pitch) - 0.5
    dv = (v / pitch) - np.floor(v / pitch) - 0.5
    dist = np.sqrt(du * du + dv * dv)
    return (dist < np.sqrt(np.clip(cov, 0, 1)) * dot).astype("float32")


def draw_halftone(phase):
    """Two inks at 15 and 75 degrees, a little out of register.

    The one halftone used by every output, so a sprite frame and a poster of the
    same pose are the same image at two sizes. The misregistration is deliberate
    and small: a few working pixels, which is what makes it read as a printed
    screen rather than as a texture.
    """
    cov = coverage(phase)
    navy = halftone_plate(cov, 15.0, 7.0)
    rust = halftone_plate(cov, 75.0, 7.0, shift=PITCH_UNIT * 3.0)
    img = print_plates((238, 232, 218), [
        (rust, (208, 76, 62), 0.82),
        (navy, (32, 52, 92), 0.94),
    ])
    d = ImageDraw.Draw(img)
    for ex, ey, eye_r, ry, _b in eye_geometry(phase):
        if ry < 0.5:
            continue
        d.ellipse([ex - eye_r, ey - ry, ex + eye_r, ey + ry], fill=(20, 30, 56, 255))
    return downscale(apply_paper(img, 3, 8))


def draw_process(phase):
    """Two inks at 15 and 75 degrees, a little out of register.

    The misregistration is deliberate and small: a few working pixels, which is
    what makes it read as a printed screen rather than as a texture.
    """
    cov = coverage(phase)
    navy = dot_screen(cov, 15.0, PITCH_UNIT * 7.0)
    rust = dot_screen(cov, 75.0, PITCH_UNIT * 7.0, shift=PITCH_UNIT * 3.0)
    img = print_plates((238, 232, 218), [
        (rust, (208, 76, 62), 0.80),
        (navy, (32, 52, 92), 0.92),
    ])
    half = phase
    d = ImageDraw.Draw(img)
    for ex, ey, eye_r, ry, _b in eye_geometry(half):
        if ry < 0.5:
            continue
        d.ellipse([ex - eye_r, ey - ry, ex + eye_r, ey + ry], fill=(20, 30, 56, 255))
    return downscale(apply_paper(img, 3, 8))


def draw_process(phase):
    """Four separations at the classic screen angles.

    At 15/75/0/45 the four grids interfere into rosettes, which is the signature
    of process colour work. The angles have to be those four: pick different ones
    and the rosettes turn into moire.
    """
    cov = coverage(phase, gamma=0.85)

    # Rough separations: the cyan plate carries the darkest part of the form,
    # the yellow plate the lightest, which is how a real separation splits it.
    k = np.clip(cov * 1.05 - 0.34, 0, 1)
    c = np.clip(cov * 0.90 - 0.06, 0, 1)
    m = np.clip(cov * 1.00 - 0.16, 0, 1)
    y = np.clip(cov * 1.10 - 0.30, 0, 1)

    pitch = PITCH_UNIT * 6.0
    img = print_plates((245, 242, 233), [
        (dot_screen(y, 0.0, pitch), (250, 214, 54), 0.85),
        (dot_screen(m, 15.0, pitch), (226, 62, 122), 0.85),
        (dot_screen(c, 75.0, pitch), (34, 174, 218), 0.85),
        (dot_screen(k, 45.0, pitch), (34, 38, 48), 0.92),
    ])
    d = ImageDraw.Draw(img)
    for ex, ey, eye_r, ry, _b in eye_geometry(phase):
        if ry < 0.5:
            continue
        d.ellipse([ex - eye_r, ey - ry, ex + eye_r, ey + ry], fill=(26, 28, 38, 255))
    return downscale(apply_paper(img, 7, 10))


def draw_newsprint(phase):
    """A coarse screen on grey stock, badly registered.

    Coarse and misregistered on purpose: this is the look of a photograph
    reprinted too small, where the screen is visible as its own texture and the
    plates have drifted.
    """
    cov = coverage(phase, gamma=1.25)
    pitch = PITCH_UNIT * 10.5
    shift = PITCH_UNIT * 5.5
    black = dot_screen(cov, 45.0, pitch)
    cyan = dot_screen(cov, 15.0, pitch, shift=shift)
    magenta = dot_screen(cov, 75.0, pitch, shift=-shift)
    img = print_plates((214, 210, 202), [
        (cyan, (86, 150, 178), 0.62),
        (magenta, (188, 92, 120), 0.62),
        (black, (46, 46, 52), 0.95),
    ])
    d = ImageDraw.Draw(img)
    for ex, ey, eye_r, ry, _b in eye_geometry(phase):
        if ry < 0.5:
            continue
        d.ellipse([ex - eye_r, ey - ry, ex + eye_r, ey + ry], fill=(40, 40, 46, 255))
    # Newsprint is absorbent and never quite registered, so the whole page gets
    # a slight drift as well as the plates.
    img = img.transform(img.size, Image.AFFINE, (1, 0.012, -SUPERSAMPLE(), 0.010, 1, -SUPERSAMPLE()),
                        resample=Image.BILINEAR)
    return downscale(apply_paper(img, 13, 16))


def draw_engraved(phase):
    """Line screen, one ink: the look of a banknote or steel engraving.

    Two line screens cross-hatched at 90 degrees: the crossing reads as
    darkening, so the form still has volume with only one ink.
    """
    cov = coverage(phase, gamma=0.75)
    pitch = PITCH_UNIT * 4.2
    a = line_screen(cov * 1.05, 35.0, pitch)
    b = line_screen(cov * 0.80, 125.0, pitch)
    img = print_plates((240, 233, 214), [
        (b, (92, 74, 48), 0.70),
        (a, (58, 46, 30), 0.90),
    ])
    d = ImageDraw.Draw(img)
    for ex, ey, eye_r, ry, _b in eye_geometry(phase):
        if ry < 0.5:
            continue
        d.ellipse([ex - eye_r, ey - ry, ex + eye_r, ey + ry], fill=(48, 38, 25, 255))
    # A fine inner key line, the way an engraving is finished.
    key = edge_band(full_mask(phase, cute=True), inner_px=0.0, outer_px=SUPERSAMPLE() * 1.6)
    img = Image.alpha_composite(img, tint(key, (52, 42, 28), 0.75))
    return downscale(apply_paper(img, 19, 7))


def draw_stochastic(phase):
    """FM screening: a fine random screen with no grid at all.

    Where the classic screen varies dot size on a fixed grid, this keeps the dot
    size fixed and varies how many there are. At print scale the two look
    different, and this one keeps fine detail in the arms that a coarse grid
    would lose.
    """
    cov = coverage(phase, gamma=0.95)
    navy = stochastic_screen(cov, seed=17, density=0.92)
    sand = stochastic_screen(np.clip(cov - 0.28, 0, 1), seed=31, density=0.70)
    img = print_plates((247, 244, 236), [
        (sand, (196, 148, 96), 0.72),
        (navy, (40, 58, 86), 0.94),
    ])
    d = ImageDraw.Draw(img)
    for ex, ey, eye_r, ry, _b in eye_geometry(phase):
        if ry < 0.5:
            continue
        d.ellipse([ex - eye_r, ey - ry, ex + eye_r, ey + ry], fill=(24, 34, 52, 255))
    return downscale(apply_paper(img, 23, 6))


def draw_receipt(phase):
    """A dot-matrix print on a till roll.

    The grid is square rather than rotated, and the paper has the perforated
    edges and the faint ruling a till roll has, so it reads as a piece of paper
    rather than as a texture.
    """
    paper = (250, 248, 242)
    img = Image.new("RGBA", (S(), S()), paper + (255,))

    # Faint horizontal ruling, like the printed bands on a roll.
    rule = Image.new("L", (S(), S()), 0)
    rd = ImageDraw.Draw(rule)
    for y in range(0, S(), int(SUPERSAMPLE() * 26)):
        rd.rectangle([0, y, S(), y + int(SUPERSAMPLE() * 1.5)], fill=40)
    img = Image.alpha_composite(img, tint(rule, (150, 180, 200), 0.35))

    cov = coverage(phase, gamma=1.05)
    # A square dot grid, the pattern a dot-matrix head actually lays down.
    dots = dot_screen(cov, 0.0, PITCH_UNIT * 5.2)
    img = Image.alpha_composite(img, plate(dots, (38, 52, 66), 0.94))

    d = ImageDraw.Draw(img)
    for ex, ey, eye_r, ry, _b in eye_geometry(phase):
        if ry < 0.5:
            continue
        d.ellipse([ex - eye_r, ey - ry, ex + eye_r, ey + ry], fill=(26, 38, 52, 255))

    # Perforations along two edges, which is the whole point of a till roll.
    perf = Image.new("RGBA", (S(), S()), (0, 0, 0, 0))
    pd = ImageDraw.Draw(perf)
    hole = int(SUPERSAMPLE() * 3.2)
    step = int(SUPERSAMPLE() * 13)
    for y in range(step // 2, S(), step):
        for x in (int(SUPERSAMPLE() * 7), S() - int(SUPERSAMPLE() * 7)):
            pd.ellipse([x - hole, y - hole, x + hole, y + hole], fill=(196, 190, 180, 255))
    img = Image.alpha_composite(img, perf)
    return downscale(apply_paper(img, 29, 5))


def apply_paper(img, seed, amount):
    """Paper is never a flat colour, and ink never lays down perfectly evenly.

    A small amount of noise across the page is what keeps a screen looking
    printed instead of computed.
    """
    rng = np.random.default_rng(seed)
    small = rng.normal(0.0, 1.0, size=(S() // 2, S() // 2)).astype("float32")
    noise = np.asarray(
        Image.fromarray(((small - small.min()) / (small.ptp() or 1) * 255).astype("uint8"))
        .resize((S(), S()), Image.BILINEAR),
        dtype="float32",
    )
    arr = np.asarray(img.convert("RGB"), dtype="float32")
    # Broadcast the noise across the three channels.
    arr = np.clip(arr + (noise - noise.mean())[..., None] * (amount / 100.0), 0, 255)
    out = Image.fromarray(arr.astype("uint8")).convert("RGBA")
    out.putalpha(img.getchannel("A"))
    return out


PRINTS = {
    "halftone": draw_halftone,
    "process": draw_process,
    "newsprint": draw_newsprint,
    "engraved": draw_engraved,
    "stochastic": draw_stochastic,
    "receipt": draw_receipt,
}
