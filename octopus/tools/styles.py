"""Eight ways to draw the same octopus.

Each renderer rebuilds the picture from the rig rather than recolouring a
finished one, so the styles differ in construction:

  flat      hard-edged shapes with a bold outline
  lowpoly   a crinkled convex hull, cut into flat-shaded triangles
  pixel     48x48 cells, ordered dither, five-value palette
  sketch    jittered pencil strokes over paper tooth
  halftone  a rotated dot screen, two inks, misregistered
  clay      matte shading, soft pores, subsurface scatter
  glass     translucent body, rim light, bloom
  mesh      a wireframe on scanlines

`python make-octopus.py` writes one sprite sheet per style, plus a contact sheet
showing one frame of each.
"""

import math
from pathlib import Path

import numpy as np

import rig
from PIL import Image, ImageDraw, ImageFilter

from rig import (
    ARM_COUNT, BODY_R, S, TILE, SUPERSAMPLE,
    apply_grain, arm_layers, arm_outline, arm_points, draw_mantle, downscale,
    edge_band, eye_geometry, full_mask, grain, lerp_rgb, mantle, tint,
    vertical_ramp,
)
OUT_DIR = Path(__file__).resolve().parent.parent / "assets"
OUT_DIR.mkdir(parents=True, exist_ok=True)


# --------------------------------------------------------------- utilities

def draft(draw, points):
    """A polyline through (x, y, r) points, which is how an arm is stroked."""
    draw.line([(x, y) for x, y, _ in points], fill=255, width=1, joint="curve")


def flood_from(mask_img, seed_xy):
    """Keep only the blob connected to seed_xy, as a binary mask."""
    w, h = mask_img.size
    arr = np.asarray(mask_img, dtype="uint8")
    solid = arr > 78
    seen = np.zeros_like(solid, dtype=bool)
    sx, sy = seed_xy
    if not solid[sy, sx]:
        # Find the nearest solid cell in the seed column.
        col = np.flatnonzero(solid[:, sx])
        if col.size == 0:
            return Image.new("L", (w, h), 0)
        sy = int(col[np.argmin(np.abs(col - sy))])
    stack = [(sx, sy)]
    seen[sy, sx] = True
    while stack:
        x, y = stack.pop()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and solid[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                stack.append((nx, ny))
    out = np.zeros((h, w), dtype="uint8")
    out[seen] = 255
    return Image.fromarray(out)


def convex_hull(points):
    """Monotone chain. Used by the low-poly style to crinkle the silhouette."""
    pts = sorted(set(points))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def silhouette_points(phase, step=3):
    """Sampled points around the creature, used by the faceted styles."""
    pts = []
    for pts_arm in arm_points_all(phase):
        for i in range(0, len(pts_arm), step):
            x, y, r = pts_arm[i]
            pts.append((x, y))
    x, y, r = mantle(phase)
    for i in range(48):
        a = i / 48 * math.tau
        pts.append((x + math.cos(a) * r, y + math.sin(a) * r * 0.95))
    del x, y, r
    return pts


def arm_points_all(phase):
    return [arm_points(i, phase) for i in range(ARM_COUNT)]


def disc_mask(phase, grow=0):
    """A soft silhouette body used as the shading mask in several styles."""
    mask = full_mask(phase)
    if grow:
        mask = mask.filter(ImageFilter.MaxFilter(3)) if grow > 0 else mask
    return mask


# ------------------------------------------------------------------- styles

def draw_flat(phase):
    """Poster shapes: three flat tones and a heavy outline."""
    ground_top, ground_bottom = (26, 40, 64), (16, 26, 44)
    body, body_light, ink = (52, 122, 156), (108, 190, 208), (10, 18, 30)

    img = vertical_ramp([(0.0, ground_top), (1.0, ground_bottom)]).convert("RGBA")

    # Two flat tones, layered, so the silhouette has a light and a dark half.
    dark = Image.new("L", (S, S), 0)
    dd = ImageDraw.Draw(dark)
    behind, front = arm_layers(phase)
    for pts in behind:
        dd.polygon(arm_outline(pts), fill=255)
    draw_mantle(dd, phase)
    for pts in front:
        dd.polygon(arm_outline(pts), fill=255)
    img = Image.alpha_composite(img, tint(dark, body))

    light = Image.new("L", (S, S), 0)
    ld = ImageDraw.Draw(light)
    draw_mantle(ld, phase)
    x, y, r = mantle(phase)
    ld.ellipse([x - r, y - r * 1.05, x + r, y + r * 0.10], fill=255)
    img = Image.alpha_composite(img, tint(light, body_light))

    # Outline, stroke by stroke.
    line = Image.new("L", (S, S), 0)
    dr = ImageDraw.Draw(line)
    w = int(SUPERSAMPLE * 2.4)
    for pts in behind + front:
        outline = arm_outline(pts)
        dr.line(outline + [outline[0]], fill=255, width=w, joint="curve")
    dr.line(rig.mantle_polygon(phase) + [rig.mantle_polygon(phase)[0]],
            fill=255, width=w, joint="curve")
    img = Image.alpha_composite(img, tint(line, ink))

    # Eyes on top, flat.
    for ex, ey, eye_r, ry, _b in eye_geometry(phase):
        if ry < 0.5:
            continue
        eye = ImageDraw.Draw(img)
        eye.ellipse([ex - eye_r, ey - ry, ex + eye_r, ey + ry], fill=(14, 22, 34, 255))
        eye.ellipse([ex - eye_r, ey - ry, ex + eye_r, ey + ry], outline=ink + (255,), width=w // 2)
    return downscale(img)


def draw_lowpoly(phase):
    """Faceted surfaces: every panel is a flat-shaded polygon.

    The facets are built along each limb rather than over a single hull of the
    whole creature. A hull swallows the arms into one blob, which loses the one
    thing the shape needs to say.
    """
    rng = np.random.default_rng(7)
    light = np.array([-0.45, -0.82, 0.36])
    light = light / np.linalg.norm(light)
    base = np.array([74, 150, 182], dtype="float32")

    img = Image.new("RGBA", (S, S), (11, 18, 30, 255))
    dr = ImageDraw.Draw(img)

    def shade(tri):
        (ax, ay), (bx, by), (cx, cy) = tri
        ux, uy = bx - ax, by - ay
        vx, vy = cx - ax, cy - ay
        nz = ux * vy - uy * vx
        if abs(nz) < 1e-6:
            return tuple(int(v) for v in base * 0.6) + (255,)
        # Normal in the plane, plus a constant out-of-plane term so the facets
        # facing the light stay clearly brighter than the ones facing away.
        ln = math.hypot(ux, uy) or 1.0
        normal = np.array([-uy / ln, ux / ln, 0.62])
        normal = normal / np.linalg.norm(normal)
        lam = abs(float(np.dot(normal, light)))
        rgb = np.clip(base * (0.34 + 0.80 * lam), 0, 255).astype("uint8")
        return tuple(int(v) for v in rgb) + (255,)

    def jitter(p, amt):
        return (p[0] + rng.uniform(-amt, amt), p[1] + rng.uniform(-amt, amt))

    # Arms: quad panels down the length, jittered so no two are parallel.
    behind, front = arm_layers(phase)
    for pts in behind + front:
        n = len(pts)
        segs = 5
        for s in range(segs):
            i0 = int(s / segs * (n - 1))
            i1 = int((s + 1) / segs * (n - 1))
            if i1 <= i0:
                continue
            x0, y0, r0 = pts[i0]
            x1, y1, r1 = pts[i1]
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2
            dx, dy = x1 - x0, y1 - y0
            ln = math.hypot(dx, dy) or 1.0
            nx, ny = -dy / ln, dx / ln
            quad = [
                jitter((x0 + nx * r0, y0 + ny * r0), SUPERSAMPLE * 1.4),
                jitter((x1 + nx * r1, y1 + ny * r1), SUPERSAMPLE * 1.4),
                jitter((x1 - nx * r1, y1 - ny * r1), SUPERSAMPLE * 1.4),
                jitter((x0 - nx * r0, y0 - ny * r0), SUPERSAMPLE * 1.4),
            ]
            # Split each panel in two, so the facets stay small.
            dr.polygon([quad[0], quad[1], quad[2]], fill=shade((quad[0], quad[1], quad[2])))
            dr.polygon([quad[0], quad[2], quad[3]], fill=shade((quad[0], quad[2], quad[3])))
            del mx, my

    # Mantle: a ring of facets around the dome.
    x, y, r = mantle(phase)
    ring_out, ring_in = [], []
    for i in range(14):
        a = i / 14 * math.tau
        ring_out.append(jitter((x + math.cos(a) * r, y + math.sin(a) * r * 0.95), SUPERSAMPLE * 1.6))
        ring_in.append(jitter((x + math.cos(a) * r * 0.42, y + math.sin(a) * r * 0.40), SUPERSAMPLE * 1.2))
    for i in range(14):
        j = (i + 1) % 14
        dr.polygon([ring_out[i], ring_out[j], ring_in[i]],
                   fill=shade((ring_out[i], ring_out[j], ring_in[i])))
        dr.polygon([ring_in[i], ring_out[j], ring_in[j]],
                   fill=shade((ring_in[i], ring_out[j], ring_in[j])))

    for ex, ey, eye_r, ry, _b in eye_geometry(phase):
        if ry < 0.5:
            continue
        dr.polygon([(ex - eye_r, ey), (ex, ey - ry), (ex + eye_r, ey), (ex, ey + ry)],
                   fill=(13, 22, 36, 255))
    return downscale(img)


def _outline_cells(idx, m, outline_index):
    """Put an outline colour on the boundary cells of the creature.

    This is what makes a quantised picture read as pixel art rather than as a
    downscaled render: the silhouette gets its own value, so the arms separate
    from each other and from the ground.
    """
    solid = m > 0.5
    # A cell is on the boundary if any of its four neighbours is empty.
    empty = ~solid
    edge = np.zeros_like(solid)
    edge[1:, :] |= solid[1:, :] & empty[:-1, :]
    edge[:-1, :] |= solid[:-1, :] & empty[1:, :]
    edge[:, 1:] |= solid[:, 1:] & empty[:, :-1]
    edge[:, :-1] |= solid[:, :-1] & empty[:, 1:]
    out = idx.copy()
    out[edge] = outline_index
    return out


def _pixelate(phase, pal, value_stops, ground_index=0, eye_index=None,
              outline_index=None, dither=0.85, cells=48, limb=None):
    """Quantise the rig to a grid of flat cells.

    `pal` is the index palette and `value_stops` maps the vertical position
    inside the creature to one of its entries, so a palette can be laid out any
    way -- dark-to-light for a sober mosaic, or a run of loud hues for something
    else entirely. The ordered dither only breaks up the boundaries between
    bands; it is kept low so the colours stay flat and readable.

    `limb` overrides the arm width and length for this style, as
    (base, tip, length) multipliers on the rig's defaults.
    """
    cell = S // cells
    bayer = np.array([
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5],
    ], dtype="float32") / 16.0

    if limb:
        base, tip, length = limb
        mask = Image.new("L", (S, S), 0)
        draw = ImageDraw.Draw(mask)
        parts = [arm_points(i, phase, base=base, tip=tip, length=length) for i in range(ARM_COUNT)]
        cut = mantle(phase)[1] - mantle(phase)[2] * 0.10
        for pts in parts:
            if pts[0][1] < cut:
                draw.polygon(arm_outline(pts), fill=255)
        draw_mantle(draw, phase)
        for pts in parts:
            if pts[0][1] >= cut:
                draw.polygon(arm_outline(pts), fill=255)
        mask = mask.resize((cells, cells), Image.BOX)
    else:
        mask = full_mask(phase).resize((cells, cells), Image.BOX)
    m = np.asarray(mask, dtype="float32") / 255.0

    # Vertical position inside the creature, remapped through the palette stops.
    yy = np.linspace(0.0, 1.0, cells, dtype="float32")[:, None]
    stops = np.array(value_stops, dtype="float32")
    bands = np.zeros((cells, 1), dtype="float32")
    for b in range(len(stops) - 1):
        bands += ((yy >= stops[b]) & (yy < stops[b + 1])).astype("float32") * (b + 1)
    # Broadcast the row band across the grid; the silhouette is applied below.
    value = np.broadcast_to(bands, (cells, cells))

    dith = np.tile(bayer, (cells // 4 + 1, cells // 4 + 1))[:cells, :cells]
    scaled = value + (dith - 0.5) * dither
    idx_on = np.clip(np.round(scaled), 0, len(pal) - 1).astype("int")
    idx = np.where(m > 0.5, idx_on, ground_index)
    if outline_index is not None:
        idx = _outline_cells(idx, m, outline_index)

    img = Image.fromarray(pal[idx]).resize((S, S), Image.NEAREST)

    # The eyes go in last and are not part of the palette run: a face buried in
    # a colour band has no expression. They are set to whole cells so the grid
    # still reads as a grid, with a single bright cell as the glint.
    eye_rgb = None if eye_index is None else pal[eye_index]
    glint_rgb = (255, 255, 255) if eye_index is None else pal[3]
    arr = np.asarray(img).copy()
    for ex, ey, eye_r, ry, _b in eye_geometry(phase):
        if ry < 0.5:
            continue
        cx0, cy0 = int(ex // cell), int(ey // cell)
        rr = max(1, int(eye_r // cell))
        y0, y1 = max(0, cy0 - rr), cy0 + rr
        x0, x1 = max(0, cx0 - rr), cx0 + rr
        if eye_rgb is not None:
            arr[y0:y1, x0:x1] = eye_rgb
        # The glint goes in the upper-left cell of the eye.
        arr[y0:y0 + 1, x0:x0 + 1] = glint_rgb
    return downscale(Image.fromarray(arr))


def draw_pixel(phase):
    """A sober mosaic: five value steps, ordered dither, a dark outline."""
    pal = np.array([
        [16, 28, 44],      # 0 ground
        [30, 62, 84],      # 1 dark
        [56, 112, 132],    # 2 mid
        [104, 178, 190],   # 3 light
        [196, 240, 238],   # 4 lightest
        [240, 255, 255],   # 5 glint
        [9, 16, 26],       # 6 outline
    ], dtype="uint8")
    return _pixelate(phase, pal, [0.0, 0.20, 0.40, 0.60, 0.80, 1.0],
                     ground_index=0, eye_index=6, outline_index=6)


def draw_pixelneon(phase):
    """Dopamine pixel art: loud flat colour, hard cells, heavy outline.

    Two saturated hues split the creature rather than one hue per band. That is
    a deliberate limit: the arms taper to two or three cells, so a hue change
    near the tip leaves colour only in the outline's gaps and the whole picture
    speckles. Two big areas of colour plus one non-colour is what actually reads
    as pixel art at this scale.

    The limbs are drawn thicker here than the smooth styles draw them. At a
    72-cell grid a slender arm is one cell of fill between two cells of outline,
    which reads as a hollow loop rather than a limb.
    """
    pal = np.array([
        [30, 10, 58],      # 0 deep violet ground
        [255, 46, 138],    # 1 hot pink: upper half
        [0, 224, 255],     # 2 cyan: lower half
        [255, 226, 58],    # 3 yellow, the glint
        [22, 8, 44],       # 4 outline, darker than the ground
    ], dtype="uint8")
    return _pixelate(
        phase, pal,
        [0.0, 0.46, 1.0],
        ground_index=0, eye_index=4, outline_index=4, dither=0.30, cells=72,
        limb=(0.30, 0.085, 2.5),
    )


def draw_sketch(phase):
    """Pencil: jittered strokes, doubled lines, paper tooth."""
    img = Image.new("RGBA", (S, S), (243, 240, 232, 255))
    # Paper tooth: fine noise, so the strokes sit on a surface.
    tooth = np.asarray(img.convert("RGB"), dtype="float32")
    tooth = np.clip(tooth - np.abs(grain(11, 26))[..., None] * 1.6, 0, 255)
    img = Image.fromarray(tooth.astype("uint8")).convert("RGBA")

    rng = np.random.default_rng(23)

    def jitter(points, amp):
        return [(x + rng.normal(0, amp), y + rng.normal(0, amp)) for x, y in points]

    strokes = Image.new("L", (S, S), 0)
    dr = ImageDraw.Draw(strokes)
    behind, front = arm_layers(phase)

    for pts in behind + front:
        centre = [(x, y) for x, y, _ in pts]
        for _pass in range(3):
            dr.line(jitter(centre, SUPERSAMPLE * 1.6), fill=190, width=SUPERSAMPLE * 2,
                    joint="curve")
        for x, y, r in (pts[0], pts[-1]):
            dr.ellipse([x - r, y - r, x + r, y + r], outline=190, width=SUPERSAMPLE * 2)

    mp = rig.mantle_polygon(phase)
    for _pass in range(3):
        dr.line(jitter(mp + [mp[0]], SUPERSAMPLE * 1.4),
                fill=190, width=SUPERSAMPLE * 2, joint="curve")

    strokes = strokes.filter(ImageFilter.GaussianBlur(SUPERSAMPLE * 0.35))
    img = Image.alpha_composite(img, tint(strokes, (58, 64, 74), 0.85))

    # Eyes: outline plus a light fill, the way a pencil drawing builds a face.
    for ex, ey, eye_r, ry, _b in eye_geometry(phase):
        if ry < 0.5:
            continue
        eye = Image.new("L", (S, S), 0)
        ed = ImageDraw.Draw(eye)
        ed.ellipse([ex - eye_r, ey - ry, ex + eye_r, ey + ry], fill=120)
        ed.ellipse([ex - eye_r, ey - ry, ex + eye_r, ey + ry], outline=210, width=SUPERSAMPLE * 2)
        img = Image.alpha_composite(img, tint(eye, (70, 78, 88), 0.75))
    return downscale(apply_grain(img, 5, 6))


def draw_halftone(phase):
    """A rotated dot screen in two inks, out of register.

    Delegates to prints.draw_halftone: the printed pieces and the animated styles
    must produce the same image, and two copies of a screen drift apart the
    moment either ramp or pitch is touched.
    """
    import prints  # local: prints imports rig, and rig must not import styles
    return prints.draw_halftone(phase)


def draw_clay(phase):
    """Matte clay: soft shading, pores, and light bleeding through the edges."""
    img = vertical_ramp([(0.0, (36, 48, 62)), (1.0, (22, 30, 44))]).convert("RGBA")
    mask = full_mask(phase)

    # Matte body: a gentle ramp, not a glossy one.
    body = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    body.paste(
        vertical_ramp([
            (0.00, (236, 196, 176)),
            (0.34, (206, 142, 118)),
            (0.72, (150, 90, 78)),
            (1.00, (110, 66, 62)),
        ]),
        (0, 0), mask,
    )
    body.putalpha(mask)
    img = Image.alpha_composite(img, body)

    # Subsurface scatter: a warm rim just inside the silhouette, where light
    # passes through thin clay.
    scatter = edge_band(mask, inner_px=0.0, outer_px=SUPERSAMPLE * 5.0)
    img = Image.alpha_composite(img, tint(scatter, (255, 176, 132), 0.50))

    # Pores: coarse noise, multiplied in, clipped to the body.
    pores = apply_grain(body, 31, 20)
    pores.putalpha(Image.fromarray(
        (np.asarray(pores.getchannel("A"), dtype="int16")
         & np.asarray(mask, dtype="int16")).astype("uint8")
    ))
    img = Image.alpha_composite(img, tint(pores.getchannel("L") if False else pores.convert("L"),
                                          (120, 74, 64), 0.22))

    # A soft specular, matte rather than sharp.
    spec = Image.new("L", (S, S), 0)
    x, y, r = mantle(phase)
    ImageDraw.Draw(spec).ellipse(
        [x - r * 0.70, y - r * 1.10, x - r * 0.10, y - r * 0.42], fill=150
    )
    spec = spec.filter(ImageFilter.GaussianBlur(SUPERSAMPLE * 4.5))
    spec = Image.fromarray(np.clip(
        np.asarray(spec, dtype="int16") + np.asarray(mask, dtype="int16") - 255, 0, 255
    ).astype("uint8"))
    img = Image.alpha_composite(img, tint(spec, (255, 240, 226), 0.44))

    for ex, ey, eye_r, ry, _b in eye_geometry(phase):
        if ry < 0.5:
            continue
        d = ImageDraw.Draw(img)
        d.ellipse([ex - eye_r, ey - ry, ex + eye_r, ey + ry], fill=(46, 26, 26, 255))
        g = eye_r * 0.32
        d.ellipse([ex - eye_r * 0.34 - g, ey - eye_r * 0.36 - g,
                   ex - eye_r * 0.34 + g, ey - eye_r * 0.36 + g], fill=(255, 244, 232, 220))
    return downscale(img)


def draw_glass(phase):
    """Translucent body, rim light, bloom and a soft shadow beneath."""
    img = vertical_ramp([(0.0, (9, 20, 32)), (1.0, (4, 10, 18))]).convert("RGBA")
    mask = full_mask(phase)

    bloom = mask.filter(ImageFilter.GaussianBlur(SUPERSAMPLE * 5.0))
    img = Image.alpha_composite(img, tint(bloom, (74, 178, 198), 0.26))

    shadow = mask.transform(
        mask.size, Image.AFFINE, (1, 0, -SUPERSAMPLE * 4, 0, 1, -SUPERSAMPLE * 7),
        resample=Image.BILINEAR,
    ).filter(ImageFilter.GaussianBlur(SUPERSAMPLE * 2.4))
    shadow = Image.fromarray(np.clip(
        np.asarray(shadow, dtype="int16") - np.asarray(mask, dtype="int16"), 0, 255
    ).astype("uint8"))
    img = Image.alpha_composite(img, tint(shadow, (2, 26, 34), 0.42))

    body = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    body.paste(
        vertical_ramp([
            (0.00, (240, 255, 255)),
            (0.16, (196, 250, 246)),
            (0.40, (74, 178, 198)),
            (0.78, (12, 54, 74)),
            (1.00, (74, 178, 198)),
        ]),
        (0, 0), mask,
    )
    body.putalpha(mask.point(lambda v: int(v * 0.90)))
    img = Image.alpha_composite(img, body)

    x, y, r = mantle(phase)
    sheen = Image.new("L", (S, S), 0)
    ImageDraw.Draw(sheen).ellipse(
        [x - r * 0.86, y - r * 1.20, x - r * 0.06, y - r * 0.30], fill=200
    )
    sheen = sheen.filter(ImageFilter.GaussianBlur(SUPERSAMPLE * 3.4))
    sheen = Image.fromarray(np.clip(
        np.asarray(sheen, dtype="int16") + np.asarray(mask, dtype="int16") - 255, 0, 255
    ).astype("uint8"))
    img = Image.alpha_composite(img, tint(sheen, (240, 255, 255), 0.62))

    rim = edge_band(mask, inner_px=0.0, outer_px=SUPERSAMPLE * 1.15)
    img = Image.alpha_composite(img, tint(rim, (240, 255, 255), 0.44))

    for ex, ey, eye_r, ry, blink in eye_geometry(phase):
        if ry < 0.5:
            continue
        d = ImageDraw.Draw(img)
        d.ellipse([ex - eye_r, ey - ry, ex + eye_r, ey + ry], fill=(8, 22, 30, 255))
        if blink < 0.35:
            g = eye_r * 0.36
            d.ellipse([ex - eye_r * 0.30 - g, ey - eye_r * 0.34 - g,
                       ex - eye_r * 0.30 + g, ey - eye_r * 0.34 + g], fill=(240, 255, 255, 255))
    return downscale(img)


def draw_mesh(phase):
    """A wireframe trace on a screen: scanlines, vertices, a slow sweep.

    The trace is drawn at full strength and the body beneath it is left almost
    empty. Filling the body more would hide the one thing this style is: the
    construction.
    """
    ground = (5, 9, 14)
    trace = (108, 246, 232)
    img = Image.new("RGBA", (S, S), ground + (255,))

    # Body as a very dark fill, so the wireframe reads as a volume.
    mask = full_mask(phase)
    img = Image.alpha_composite(img, tint(mask, (8, 24, 28), 0.9))

    wire = Image.new("L", (S, S), 0)
    dr = ImageDraw.Draw(wire)
    w = max(1, int(SUPERSAMPLE * 1.1))
    behind, front = arm_layers(phase)
    for pts in behind + front:
        centre = [(x, y) for x, y, _ in pts]
        dr.line(centre, fill=235, width=w, joint="curve")
        # Cross-section ticks along the arm: the arm is a tube, and this shows it.
        for i in range(2, len(pts) - 1, 4):
            x0, y0, r0 = pts[i]
            x1, y1, r1 = pts[i + 1]
            tx, ty = x1 - x0, y1 - y0
            ln = math.hypot(tx, ty) or 1.0
            nx, ny = -ty / ln, tx / ln
            dr.line([(x0 + nx * r0, y0 + ny * r0), (x0 - nx * r0, y0 - ny * r0)],
                    fill=150, width=w)
    mp2 = rig.mantle_polygon(phase)
    dr.line(mp2 + [mp2[0]], fill=235, width=w, joint="curve")
    x, y, r = mantle(phase)
    for i in range(5):
        ry = r * (0.20 * i - 0.70)
        half = math.sqrt(max(0.0, 1 - (ry / r) ** 2)) * r
        dr.line([(x - half, y + ry), (x + half, y + ry)], fill=140, width=w)

    img = Image.alpha_composite(img, tint(wire, trace, 0.96))

    # Vertices, brighter than the lines.
    verts = Image.new("L", (S, S), 0)
    vd = ImageDraw.Draw(verts)
    for pts in behind + front:
        for i in range(0, len(pts), 4):
            px, py, _ = pts[i]
            vd.ellipse([px - SUPERSAMPLE * 1.8, py - SUPERSAMPLE * 1.8,
                        px + SUPERSAMPLE * 1.8, py + SUPERSAMPLE * 1.8], fill=255)
    img = Image.alpha_composite(img, tint(verts, (230, 255, 252), 1.0))

    # Eyes as two bright rings.
    for ex, ey, eye_r, ry, _b in eye_geometry(phase):
        if ry < 0.5:
            continue
        d = ImageDraw.Draw(img)
        d.ellipse([ex - eye_r, ey - ry, ex + eye_r, ey + ry],
                  outline=(215, 255, 250, 255), width=max(2, int(SUPERSAMPLE * 1.8)))
        d.ellipse([ex - eye_r * 0.22, ey - eye_r * 0.26,
                   ex + eye_r * 0.22, ey + eye_r * 0.26], fill=(215, 255, 250, 255))

    # Scanlines and a slow bright band, so it reads as a screen rather than a
    # drawing that happens to be cyan. The lines are kept wide apart: at every
    # other row they swamp the wireframe they are meant to sit behind.
    arr = np.asarray(img.convert("RGB"), dtype="float32")
    rows = np.arange(S)[:, None]
    band = np.exp(-((rows - (phase * S * 1.4 % S)) ** 2) / (2 * (S * 0.075) ** 2))
    arr = arr * (0.94 + 0.22 * band) + band * 14
    arr[::4, :, :] *= 0.88
    img = Image.fromarray(np.clip(arr, 0, 255).astype("uint8")).convert("RGBA")
    return downscale(img)


STYLES = {
    "flat": draw_flat,
    "lowpoly": draw_lowpoly,
    "pixel": draw_pixel,
    "pixelneon": draw_pixelneon,
    "sketch": draw_sketch,
    "halftone": draw_halftone,
    "clay": draw_clay,
    "glass": draw_glass,
    "mesh": draw_mesh,
}
