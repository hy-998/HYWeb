"""Solves for the light ramp that lands the creature's coverage in a usable band.

The trap with a screened style is that coverage is easy to push to 1.0, and at
1.0 the dots merge and the screen disappears -- you get a solid silhouette with a
texture on it, which is the thing this style must not be.

This walks a few ramps and reports the coverage they actually produce, so the
choice is made on numbers rather than on a look that is hard to judge.
"""

import math

import numpy as np

import rig
from rig import full_mask

POSTER = 384
WORK = POSTER * 3
rig.configure(WORK, cute=True)

mask = np.asarray(full_mask(0.0, cute=True), dtype="float32") / 255.0
inside = mask > 0.5
print(f"creature occupies {inside.mean() * 100:.1f}% of the frame\n")

print(f"{'crown':>6} {'bottom':>7} {'gamma':>6}  {'mean':>5} {'p10':>5} {'median':>6} {'p90':>5}  {'solid%':>7}")
for crown, bottom, gamma in [
    (0.86, 0.20, 1.00),
    (0.92, 0.26, 1.00),
    (1.00, 0.26, 0.75),
    (1.00, 0.26, 1.00),
    (1.00, 0.34, 1.00),
    (2.00, 0.80, 1.00),
]:
    yy = np.linspace(0.0, 1.0, rig.S, dtype="float32")[:, None]
    value = crown - (crown - bottom) * yy
    cov = (np.clip(1.0 - value, 0, 1) ** gamma)
    # Broadcast the row values across the grid before sampling inside the mask.
    cov = np.broadcast_to(cov, (rig.S, rig.S))
    c = cov[inside]
    # "solid" is the share of the creature where the dots have merged into fill.
    solid = (c >= 0.995).mean() * 100
    print(f"{crown:6.2f} {bottom:7.2f} {gamma:6.2f}  {c.mean():5.2f} "
          f"{np.percentile(c, 10):5.2f} {np.median(c):6.2f} {np.percentile(c, 90):5.2f}  {solid:6.1f}%")

print("\nA screen reads when most of the creature sits between about 0.25 and 0.85;")
print("above that the dots merge and the style turns into a silhouette.")

# Now the real thing: run the actual pipeline and measure the printed result. The
# formula above only describes the ramp; contact shadowing and the plate
# compositing also contribute, and guessing at those is how the earlier pass
# ended up nearly solid.
print("\nactual printed pieces, measured inside the creature:")
import prints  # noqa: E402
from PIL import Image  # noqa: E402

for crown, bottom in [(0.72, 0.38), (0.65, 0.30), (0.60, 0.25), (0.55, 0.20)]:
    prints.RAMP = (crown, bottom)
    cov = prints.coverage(0.0, cute=True)
    paper = np.array([238, 232, 218], dtype="float32")
    ink = np.array([32, 52, 92], dtype="float32")
    rgb = paper[None, None, :] * (1 - cov[..., None]) + ink[None, None, :] * cov[..., None]
    lum = rgb.mean(axis=2)[inside]
    print(f"  crown={crown:.2f} bottom={bottom:.2f}  coverage median={np.median(cov[inside]):.2f}  "
          f"printed luma min={lum.min():5.1f} median={np.median(lum):5.1f} max={lum.max():5.1f}")
