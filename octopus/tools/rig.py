"""Shared geometry for the octopus styles.

One rig, eight renderers. The point of splitting it this way is that a style
differs in how it *builds the picture* -- flat fills, a crinkled hull, a dot
screen, a mesh -- not only in what colour it uses. Every renderer draws from the
same rig, so the motion stays identical while the construction changes.

Coordinates are in a supersampled working space of S x S. The rig reports the
mantle, eight arms as placed point lists, and the eyes; a renderer decides what
to do with them.
"""

import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# --------------------------------------------------------------------- rig

SUPERSAMPLE = 3
TILE = 384
S = TILE * SUPERSAMPLE
FRAMES = 12
FPS = 12

CENTER_X = S // 2
BODY_Y = int(S * 0.36)
BODY_R = int(S * 0.145)

ARM_COUNT = 8

# Cute proportions, applied on top of the rig by the `cute` argument.
#
# "Cute" in character design is mostly two ratios: eye size against head size,
# and head size against body. The mantle also sits lower and the head reads
# taller, so the creature looks like it is looking up at you.
CUTE = {
    "body_r": 0.180,     # a bigger mantle relative to the frame
    "body_y": 0.42,      # sat low, so the arms hang below it rather than beside it
    "eye_r": 0.34,       # against the mantle
    "eye_dx": 0.42,      # wide enough apart to leave a face between them
    "eye_dy": 0.09,      # low in the head, leaving a forehead above
    "glint": 0.46,       # a large highlight is most of the charm
    "arm_base": 0.26,    # narrower at the shoulder, so the join is not a wide bar
    "arm_tip": 0.095,    # rounded tips, not points
    "arm_length": 1.95,  # short and springy
    "arm_curl": 1.60,    # curled up, like a resting baby octopus
    "arm_spread": 0.56,  # a narrow fan: these hang, they do not sprawl
}


def configure(size=S, cute=False):
    """Point the rig at a different working size, and optionally use the cute set.

    Anything that caches pixel grids has to be told: `prints.grid()` keeps a
    coordinate mesh, and a stale one is a shape mismatch rather than a wrong
    picture, so it is dropped here instead of being left to fail later.
    """
    global S, TILE, CENTER_X, BODY_Y, BODY_R, SUPERSAMPLE
    SUPERSAMPLE = max(1, size // TILE)
    S = size
    CENTER_X = S // 2
    if cute:
        BODY_Y = int(S * CUTE["body_y"])
        BODY_R = int(S * CUTE["body_r"])
    else:
        BODY_Y = int(S * 0.36)
        BODY_R = int(S * 0.145)
    try:
        import prints
        prints.reset_grid()
    except Exception:
        pass


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_rgb(a, b, t):
    return tuple(int(round(lerp(a[i], b[i], t))) for i in range(3))


def mantle(phase):
    """Breathing: the mantle swells and relaxes once per loop."""
    breath = math.sin(phase * math.tau)
    r = BODY_R * (1.0 + 0.05 * breath)
    y = BODY_Y + BODY_R * -0.025 * breath
    return CENTER_X, y, r


def arm_points(index, phase, count=ARM_COUNT, base=None, tip=None, length=None,
               curl=None, spread=None):
    """One arm as (x, y, radius) points, from the body out to the tip.

    Arms fan around the lower hemisphere and curl as they descend. The curl is a
    travelling wave along the arm, offset per arm, so the ring ripples instead of
    moving as one piece. The tip curls inward and upward.

    Every proportion is a parameter because a renderer that quantises the picture
    needs thicker limbs than one that draws smooth edges, and a "cute" build
    needs both shorter limbs and rounder tips than the default rig.
    """
    base = 0.185 if base is None else base
    tip = 0.032 if tip is None else tip
    length = 3.6 if length is None else length
    curl_amt = 1.0 if curl is None else curl
    spread_w = 1.05 if spread is None else spread

    angle = math.pi / 2 + (index / (count - 1) - 0.5) * math.pi * spread_w

    arm_length = BODY_R * (length + 0.34 * math.sin(index * 1.7))
    base_r = BODY_R * base
    tip_r = BODY_R * tip

    points = []
    steps = 48
    for step in range(steps + 1):
        t = step / steps
        # The limbs leave from low on the mantle, over a narrow fan, so they hang
        # below the head. A wide fan at a high attachment makes a shoulder line
        # that caps the head and reads as a helmet brim.
        r = BODY_R * 0.86
        x = CENTER_X + math.cos(angle) * r
        y = BODY_Y + math.sin(angle) * r * 0.42

        wave = math.sin(phase * math.tau + t * 3.6 + index * 0.66)
        along = arm_length * t
        fan = t ** 1.8

        # The fan eases toward vertical, and the tip curls in over the last part
        # of the limb. Both use gentle exponents: a steep falloff leaves a crease
        # at the elbow that no amount of smoothing removes.
        fan = t ** 1.45

        x += math.cos(angle) * along * (1.0 - fan * 0.52)
        y += math.sin(angle) * along * (1.0 - fan * 0.52) + along * 0.42 * fan

        tip_t = max(0.0, (t - 0.40) / 0.60)
        curl_v = tip_t ** 1.7 * BODY_R * curl_amt * (0.95 + 0.32 * math.sin(index * 2.3 + phase * math.tau))
        x -= math.cos(angle) * curl_v * 0.20
        y -= curl_v * 0.78

        x += wave * BODY_R * 0.26 * t ** 1.8
        y += wave * BODY_R * 0.08 * t ** 1.8

        points.append((x, y, lerp(base_r, tip_r, t ** 0.80)))
    return points


def arm_outline(points):
    """Both edges of a tapered limb, as one closed outline.

    Drawing the arm as a series of discs would make it overlap itself wherever
    it curves, and any style that composites translucently would show that as a
    brighter rib. One outline per arm keeps the fill uniform.
    """
    left, right = [], []
    for i, (x, y, r) in enumerate(points):
        if i == 0:
            tx, ty = points[1][0] - x, points[1][1] - y
        elif i == len(points) - 1:
            tx, ty = x - points[i - 1][0], y - points[i - 1][1]
        else:
            tx = points[i + 1][0] - points[i - 1][0]
            ty = points[i + 1][1] - points[i - 1][1]
        length = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / length, tx / length
        left.append((x + nx * r, y + ny * r))
        right.append((x - nx * r, y - ny * r))
    return left + right[::-1]


def eye_geometry(phase, cute=False):
    """Eye centres and radii.

    With `cute`, the eyes are built as a fraction of the *mantle* rather than of
    the frame, so they scale with a bigger head instead of staying a fixed size
    in a bigger face. That ratio is most of what makes a character read as cute.
    """
    x, y, r = mantle(phase)
    blink = 0.0
    if 0.58 < phase < 0.70:
        blink = math.sin((phase - 0.58) / 0.12 * math.pi)
    gaze = math.sin(phase * math.tau) * r * 0.05

    if cute:
        eye_r = r * CUTE["eye_r"]
        dx, dy = r * CUTE["eye_dx"], r * CUTE["eye_dy"]
    else:
        eye_r = r * 0.300
        dx, dy = r * 0.44, -r * 0.14

    eyes = []
    for side in (-1, 1):
        ex = x + side * dx + gaze * side
        ey = y + dy
        eyes.append((ex, ey, eye_r, eye_r * (1 - blink * 0.94), blink))
    return eyes


def decoration_mask(phase, scene, cute=True):
    """A mask holding whatever is floating around the creature.

    Decorations are built into the same coverage field as the creature, so they
    are screened and printed by exactly the same plates. Drawn on top afterwards
    they would read as stickers rather than as part of the same print.
    """
    img = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(img)
    x, y, r = mantle(phase)

    def heart(cx, cy, size):
        d.ellipse([cx - size, cy - size * 0.95, cx, cy + size * 0.10], fill=255)
        d.ellipse([cx, cy - size * 0.95, cx + size, cy + size * 0.10], fill=255)
        d.polygon([(cx - size * 1.02, cy), (cx + size * 1.02, cy), (cx, cy + size * 1.55)], fill=255)

    def star(cx, cy, size):
        pts = []
        for i in range(10):
            a = -math.pi / 2 + i * math.pi / 5
            rad = size if i % 2 == 0 else size * 0.42
            pts.append((cx + math.cos(a) * rad, cy + math.sin(a) * rad))
        d.polygon(pts, fill=255)

    def bubble(cx, cy, size):
        d.ellipse([cx - size, cy - size, cx + size, cy + size], outline=255,
                  width=max(1, int(size * 0.42)))

    for kind, cx, cy, size in scene:
        # The scene coordinates are in mantle radii; the factor maps them into
        # the frame, deliberately less than the mantle's own extent so the
        # confetti sits around the creature instead of at the page edge.
        px, py = x + cx * r * 1.9, y + cy * r * 1.9
        size = size * r * 0.80
        if kind == "heart":
            heart(px, py, size)
        elif kind == "star":
            star(px, py, size)
        elif kind == "sparkle":
            star(px, py, size * 0.8)
            star(px, py, size * 0.36)
        elif kind == "bubble":
            bubble(px, py, size)
        elif kind == "dot":
            d.ellipse([px - size * 0.5, py - size * 0.5, px + size * 0.5, py + size * 0.5], fill=255)
    return img


# A few scenes: where the decorations sit, in units of the mantle radius.
SCENES = {
    "hearts": [
        ("heart", -0.92, -0.72, 0.17),
        ("heart", 0.96, -0.48, 0.13),
        ("heart", -1.15, 0.30, 0.10),
        ("sparkle", 0.62, -1.05, 0.12),
        ("dot", -0.55, -1.10, 0.10),
        ("dot", 1.18, -0.10, 0.08),
    ],
    "stars": [
        ("star", -0.88, -0.86, 0.20),
        ("sparkle", 0.92, -0.66, 0.16),
        ("star", 1.14, 0.22, 0.13),
        ("star", -1.18, -0.14, 0.11),
        ("dot", 0.30, -1.22, 0.09),
        ("dot", -0.34, -1.16, 0.07),
    ],
    "bubbles": [
        ("bubble", -0.95, -0.78, 0.17),
        ("bubble", 0.88, -0.96, 0.12),
        ("bubble", 1.20, -0.22, 0.09),
        ("dot", -1.22, -0.10, 0.09),
        ("dot", 0.48, -1.18, 0.07),
        ("bubble", -0.35, -1.24, 0.08),
    ],
    "mixed": [
        ("heart", -1.00, -0.60, 0.15),
        ("star", 1.02, -0.78, 0.17),
        ("bubble", -1.16, 0.18, 0.10),
        ("sparkle", 0.66, -1.10, 0.13),
        ("dot", 1.24, -0.06, 0.08),
        ("dot", -0.44, -1.18, 0.07),
    ],
}


def mantle_polygon(phase, cute=False, steps=120):
    """The head as one closed outline.

    A superellipse, not a pair of overlapping ellipses. Two ellipses bound a
    shape whose union has a slight waist where they meet, and anything that
    screens the union -- which every print style here does -- shows that waist as
    a division across the head. A single outline has no interior edges at all.

    The exponent sets how boxy the result is: 2 is an ellipse, higher is squarer.
    It is raised for the non-cute build, whose head should look flatter and more
    creature-like, and kept low for the cute one so the head is round.
    """
    x, y, r = mantle(phase)
    if cute:
        # Low exponent, width just over height: a soft dome.
        #
        # The exponent is what controls boxiness and it climbs fast -- 2.0 gives
        # an ellipse, and anything past about 2.4 starts to read as a crate with
        # rounded corners. A shape whose top nearly closes flat also reads square
        # however round its corners are, so this stays under 2.1 and keeps the
        # crown curved all the way across.
        n, w, h, cy = 2.08, r * 1.03, r * 1.10, y + r * 0.03
    else:
        n, w, h, cy = 2.50, r * 1.00, r * 1.06, y - r * 0.03

    pts = []
    for i in range(steps):
        a = i / steps * math.tau
        ca, sa = math.cos(a), math.sin(a)
        # |x|^n + |y|^n = 1, evaluated through the parametrisation.
        scale = (abs(ca) ** n + abs(sa) ** n) ** (-1.0 / n)
        pts.append((x + ca * scale * w, cy + sa * scale * h))
    return pts


def draw_mantle(draw, phase, cute=False, fill=255):
    draw.polygon(mantle_polygon(phase, cute=cute), fill=fill)


def arm_layers(phase):
    """Arms split into those behind the mantle and those in front of it."""
    pairs = [(i, arm_points(i, phase)) for i in range(ARM_COUNT)]
    x, y, r = mantle(phase)
    cutoff = y - r * 0.10
    behind = [pts for _, pts in pairs if pts[0][1] < cutoff]
    front = [pts for _, pts in pairs if pts[0][1] >= cutoff]
    return behind, front


# ------------------------------------------------------------------- masks

def full_mask(phase, cute=False, limb=None):
    """The whole creature as a hard silhouette.

    The head is drawn last, over every arm rather than between them. An octopus's
    arms do emerge from under the mantle, and drawing them in front would put
    their outlines across the face -- which, once screened, reads as the head
    being divided into panels.
    """
    kw = limb or {}
    mask = Image.new("L", (S, S), 0)
    draw = ImageDraw.Draw(mask)

    def limb_path(pts):
        draw.polygon(arm_outline(pts), fill=255)
        for px, py, pr in (pts[0], pts[-1]):
            draw.ellipse([px - pr, py - pr, px + pr, py + pr], fill=255)

    for i in range(ARM_COUNT):
        limb_path(arm_points(i, phase, **kw))
    draw_mantle(draw, phase, cute=cute)
    return mask


def edge_band(mask, inner_px, outer_px):
    """A ring band just inside the silhouette, as an alpha mask.

    Subtracting two eroded copies is stable and needs no rank filter, whose
    kernel size is capped.
    """
    a = np.asarray(mask, dtype="int16")
    if inner_px > 0:
        inner = np.asarray(mask.filter(ImageFilter.GaussianBlur(inner_px)), dtype="int16")
    else:
        inner = a
    outer = np.asarray(mask.filter(ImageFilter.GaussianBlur(outer_px)), dtype="int16")
    return Image.fromarray(np.clip(inner - outer, 0, 255).astype("uint8"))


def tint(mask, color, alpha_scale=1.0):
    """A solid colour layer shaped by a mask, with one alpha applied once."""
    layer = Image.new("RGBA", mask.size, color + (0,))
    layer.putalpha(mask if alpha_scale >= 1.0 else mask.point(lambda v: int(v * alpha_scale)))
    return layer


def vertical_ramp(stops):
    """A one-pixel-wide colour ramp scaled up; smooth and allocation-light."""
    strip = Image.new("RGB", (1, S))
    sp = strip.load()
    for y in range(S):
        t = y / (S - 1)
        for i in range(len(stops) - 1):
            t0, t1 = stops[i][0], stops[i + 1][0]
            if t <= t1 or i == len(stops) - 2:
                local = 0.0 if t1 == t0 else (t - t0) / (t1 - t0)
                sp[0, y] = lerp_rgb(stops[i][1], stops[i + 1][1], max(0.0, min(1.0, local)))
                break
    return strip.resize((S, S), Image.BILINEAR)


def grain(seed, amount=10):
    """A fixed value-noise field, for surfaces that should not look synthetic."""
    rng = np.random.default_rng(seed)
    noise = rng.integers(0, 255, size=(S // 3, S // 3), dtype="uint8")
    img = Image.fromarray(noise).resize((S, S), Image.BILINEAR)
    arr = np.asarray(img, dtype="float32")
    arr = (arr - arr.mean()) * (amount / 255.0) * 4.0
    return arr


def apply_grain(img, seed, amount=10):
    """Add or subtract a noise field across an RGBA image."""
    arr = np.asarray(img.convert("RGB"), dtype="float32")
    arr = np.clip(arr + grain(seed, amount)[..., None], 0, 255)
    out = Image.fromarray(arr.astype("uint8")).convert("RGBA")
    out.putalpha(img.getchannel("A"))
    return out


def downscale(img):
    return img.convert("RGB").resize((TILE, TILE), Image.LANCZOS)
