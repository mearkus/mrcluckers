"""Mr. Cluckers: geometry, materials and the joint hierarchy.

Model conventions: Y up, X right, character faces +Z. One unit is the
character's standing height, so the feet rest on y = 0 and the comb tips
reach roughly y = 1.
"""

import math
import sys

from . import mesh as ms
from . import occlusion
from . import vmath as v

# --------------------------------------------------------------- palette
# sRGB hex sampled from the reference photos of the plush.
# `tex` names a fabric family from texture.py. Detail maps are near-white and
# multiply this colour, so one fur tile serves both greys and one felt tile
# serves the red, the yellow and the black.
MATERIALS = {
    "plush_grey":  {"color": "#8d8e8a", "rough": 0.95, "fuzz": 0.85, "tex": "fur"},
    "plush_shade": {"color": "#7a7b76", "rough": 0.95, "fuzz": 0.85, "tex": "fur"},
    "comb_red":    {"color": "#cf2027", "rough": 0.80, "fuzz": 0.15, "tex": "felt"},
    "cord_red":    {"color": "#a5202b", "rough": 0.85, "fuzz": 0.35, "tex": "corduroy"},
    "beak_yellow": {"color": "#e0b52c", "rough": 0.70, "fuzz": 0.05, "tex": "felt"},
    "foot_black":  {"color": "#1c1d22", "rough": 0.60, "fuzz": 0.05, "tex": "felt"},
    "eye_white":   {"color": "#f0efe9", "rough": 0.45, "fuzz": 0.00, "tex": None},
    "eye_dark":    {"color": "#14151a", "rough": 0.35, "fuzz": 0.00, "tex": None},
    "eye_ring":    {"color": "#6e7069", "rough": 0.60, "fuzz": 0.00, "tex": None},
    # Thread on the seams: a shade under the fur, a little fuzzy itself.
    "seam":        {"color": "#6c6d68", "rough": 0.90, "fuzz": 0.30, "tex": None},
}

# ---------------------------------------------------------------- skeleton
# (name, parent, translation in parent space)
SKELETON = [
    ("root",       None,        (0.000,  0.000,  0.000)),
    ("hips",       "root",      (0.000,  0.415,  0.000)),
    ("neck",       "hips",      (0.000,  0.262,  0.006)),
    ("head",       "neck",      (0.000,  0.070,  0.000)),
    ("comb",       "head",      (0.000,  0.140, -0.004)),
    ("wattle",     "head",      (0.000, -0.112,  0.116)),
    ("shoulder_l", "hips",      (0.178,  0.118, -0.014)),
    ("shoulder_r", "hips",      (-0.178, 0.118, -0.014)),
    ("wingtip_l",  "shoulder_l", (0.108,  0.000,  0.000)),
    ("wingtip_r",  "shoulder_r", (-0.108, 0.000,  0.000)),
    ("tail",       "hips",      (0.000,  0.055, -0.215)),
    ("hip_l",      "hips",      (0.100, -0.150,  0.000)),
    ("hip_r",      "hips",      (-0.100, -0.150, 0.000)),
    ("ankle_l",    "hip_l",     (0.000, -0.208,  0.010)),
    ("ankle_r",    "hip_r",     (0.000, -0.208,  0.010)),
]

PARENT = {name: parent for name, parent, _ in SKELETON}
REST_T = {name: t for name, _, t in SKELETON}
ORDER = [name for name, _, _ in SKELETON]


# ------------------------------------------------------------------ parts


def _outward(m):
    """Turn a lofted part right side out.

    `ms.loft` winds its skin by the direction the rings are drawn in. The
    wings, the feet and the tail draw theirs clockwise looking along the part,
    so all three came out inside out -- winding and normals both pointing in.
    Nothing looked broken: back-face culling then shows the *far* inner wall,
    whose silhouette is the same, so the only symptom was light arriving from
    the wrong side. It surfaced when the occlusion bake shot its rays inward
    and found every wing fully enclosed.
    """
    return m.flip()



def _plush_fuzz(amp=0.011, freq=8.5, seed=3):
    """Low-frequency lumpiness so the silhouette reads as shaggy plush."""
    def fn(p, n):
        a = ms.value_noise3((p[0] * freq, p[1] * freq, p[2] * freq), seed)
        b = ms.value_noise3((p[0] * freq * 2.3, p[1] * freq * 2.3, p[2] * freq * 2.3), seed + 7)
        return amp * (a + 0.45 * b)
    return fn


def torso(fuzz=True):
    """Fat pear-shaped body, built in hips space."""
    profile = [
        (0.000, -0.200), (0.085, -0.186), (0.142, -0.156), (0.192, -0.104),
        (0.226, -0.042), (0.242,  0.020), (0.241,  0.080), (0.222,  0.140),
        (0.188,  0.194), (0.148,  0.238), (0.112,  0.268), (0.092,  0.286),
        (0.086,  0.300),
    ]
    m = ms.revolve(profile, "plush_grey", segments=28)
    m.scale((1.0, 1.0, 1.06))
    # Belly hangs a touch forward, like the photos.
    m.verts = [(x, y, z + 0.030 * max(0.0, 1.0 - ((y + 0.05) / 0.30) ** 2))
               for x, y, z in m.verts]
    m.smooth_normals()
    if fuzz:
        m.displace(_plush_fuzz())
    return m


def neck(fuzz=True):
    profile = [(0.098, -0.055), (0.112, -0.020), (0.122, 0.012), (0.126, 0.040)]
    m = ms.revolve(profile, "plush_grey", segments=24,
                   close_bottom=False, close_top=False)
    if fuzz:
        m.displace(_plush_fuzz(amp=0.006))
    return m


def head_ball(fuzz=True):
    m = ms.sphere(0.156, "plush_grey", segments=28, rings=20)
    m.scale((1.0, 1.04, 0.98))
    if fuzz:
        m.displace(_plush_fuzz(amp=0.010, seed=11))
    return m


def _stuffed(base, tip, half_w, half_t, material, rings=11, segments=16,
             taper=0.35):
    """A stuffed felt finger from `base` to `tip`: an oval in cross-section,
    domed at the top the way a sewn and stuffed point is, not cut square.

    Rings stay horizontal and slide from base to tip, so a leaning finger
    leans rather than bending. The last ring closes to a point exactly at
    `tip`, so a finger's height is wherever its tip says it is.
    """
    (bx, by, bz), (tx, ty, tz) = base, tip
    sections = []
    for i in range(rings + 1):
        t = i / float(rings)
        # Round over the last third: sqrt of a high power is flat, then domes.
        k = (1.0 - taper * t) * math.sqrt(max(0.0, 1.0 - t ** 4))
        y = by + (ty - by) * t
        cx, cz = bx + (tx - bx) * t, bz + (tz - bz) * t
        if i == rings:
            sections.append([(cx, y, cz)] * segments)
            continue
        sections.append([(cx + half_t * k * math.cos(2 * math.pi * s / segments), y,
                          cz - half_w * k * math.sin(2 * math.pi * s / segments))
                         for s in range(segments)])
    return ms.loft(sections, material, cap_start=True, cap_end=False)


COMB_PEAK = 0.146    # the middle point; fit_base measures his height to it


def comb():
    """Three stuffed red points standing on the head, front to back.

    These were one flat extruded outline, a cut-out with knife edges -- from
    the front, a red stick. Felt on the toy is sewn and stuffed, so each
    point is its own plump finger. The tips are where the old outline's were
    (the middle one sets his height, so it must not move), and the bases sit
    inside the head.
    """
    m = ms.Mesh()
    for base, tip, w in (((0.0, -0.02, 0.046), (0.0, 0.092, 0.064), 0.031),
                         ((0.0, -0.02, -0.008), (0.0, COMB_PEAK, -0.010), 0.036),
                         ((0.0, -0.02, -0.060), (0.0, 0.104, -0.074), 0.030)):
        m.merge(_stuffed(base, tip, w, 0.021, "comb_red"))
    return m.smooth_normals()


def beak():
    """Broad yellow wedge with a slight downward droop."""
    steps = [
        (0.000, 0.106, 0.080), (0.062, 0.103, 0.076), (0.126, 0.087, 0.062),
        (0.184, 0.060, 0.043), (0.226, 0.027, 0.020), (0.247, 0.006, 0.005),
    ]
    sections = []
    for z, rx, ry in steps:
        t = z / 0.247
        drop = -0.082 * t * t
        sections.append([
            (rx * math.cos(a), ry * math.sin(a) + drop, z)
            for a in [2 * math.pi * s / 20 for s in range(20)]
        ])
    m = ms.loft(sections, "beak_yellow", cap_start=True, cap_end=True)
    m.translate((0.0, 0.012, 0.098))
    return m


def wattle():
    """Red flap hanging below the beak: a plump teardrop of stuffed felt.

    Same span as the flat outline it replaces -- narrow where it is sewn on,
    widest a third of the way down, round at the bottom -- and tipped back a
    little the same way.
    """
    sections = []
    segments, rings = 18, 12
    top, bottom = 0.038, -0.136
    for i in range(rings + 1):
        t = i / float(rings)
        y = top + (bottom - top) * t
        # Narrow at the seam, full at a third, rounding off to the bottom.
        k = math.sin(math.pi * min(1.0, 0.18 + t * 0.82)) * (0.75 + 0.25 * (1 - t))
        if i == rings:
            sections.append([(0.0, y, 0.004)] * segments)
            continue
        sections.append([(0.019 * k * math.cos(2 * math.pi * s / segments), y,
                          0.004 - 0.044 * k * math.sin(2 * math.pi * s / segments))
                         for s in range(segments)])
    # Lofted downward, which winds it inside out; see _outward().
    m = _outward(ms.loft(sections, "comb_red", cap_start=True, cap_end=False)
                 .smooth_normals())
    m.transform(v.rot_x(v.deg(-12)))
    return m


def eye(side=1.0):
    """Embroidered eye: pale oval, dark pupil, grey lid arc."""
    out = ms.Mesh()

    white = ms.sphere(0.055, "eye_white", segments=18, rings=12)
    white.scale((0.92, 1.10, 0.52))
    out.merge(white)

    ring = ms.sphere(0.055, "eye_ring", segments=18, rings=12)
    ring.scale((1.06, 1.24, 0.44))
    ring.translate((0.0, 0.0, -0.012))
    out.merge(ring)

    pupil = ms.sphere(0.026, "eye_dark", segments=14, rings=10)
    pupil.scale((1.0, 1.05, 0.6))
    pupil.translate((-0.004 * side, -0.004, 0.020))
    out.merge(pupil)

    lid = ms.sphere(0.052, "plush_shade", segments=16, rings=10)
    lid.scale((1.02, 0.55, 0.5))
    lid.translate((0.0, 0.046, 0.006))
    out.merge(lid)

    out.transform(v.rot_y(v.deg(30 * side)))
    out.transform(v.rot_x(v.deg(-14)))
    out.translate((0.076 * side, 0.083, 0.112))
    return out


WING_SPLIT = 0.108          # x where the wing hinges, matching wingtip_*


def wing(fuzz=True):
    """Paddle wing in two pieces so the tip can flop.

    Grey on top, ribbed dark-red corduroy underneath. The pieces overlap by
    one section so a bent tip never opens a gap.
    """
    sections = []
    steps = 12
    for i in range(steps + 1):
        t = i / float(steps)
        x = -0.025 + 0.320 * t
        w = 0.126 * (1.0 - 0.42 * t * t) * math.sqrt(max(0.0, 1.0 - t ** 6))
        h = 0.052 * (1.0 - 0.45 * t * t) * math.sqrt(max(0.0, 1.0 - t ** 6))
        if i == steps:
            w = h = 0.004
        # Ribs on the underside read as a gentle ripple along the wing.
        rib = 1.0 + 0.10 * math.sin(t * math.pi * 9.0)
        ring = []
        for s in range(20):
            a = 2.0 * math.pi * s / 20
            cy, cz = math.sin(a), math.cos(a)
            scale = rib if cy < 0 else 1.0
            ring.append((x, cy * h * scale - 0.070 * t * t, cz * w - 0.050 * t))
        sections.append(ring)

    cut = 5                                     # section nearest WING_SPLIT
    inner = _wing_piece(sections[:cut + 2], fuzz)
    outer = _wing_piece(sections[cut:], fuzz, cap_end=False)
    outer.translate((-WING_SPLIT, 0.0, 0.0))
    return inner, outer


def _wing_piece(sections, fuzz, cap_end=True):
    # The rings turn clockwise looking along the wing, which lofts the skin
    # inside out; see _outward().
    m = _outward(ms.loft(sections, "plush_shade", cap_start=True, cap_end=cap_end))
    # Split materials by facing: undersides become corduroy. The top uses the
    # darker grey so the wing separates from the body in a side-on sprite.
    faces = []
    for a, b, c, _ in m.faces:
        n = m.face_normal((a, b, c))
        faces.append((a, b, c, "cord_red" if n[1] < -0.22 else "plush_shade"))
    m.faces = faces
    if fuzz:
        m.displace(_plush_fuzz(amp=0.005, freq=12.0, seed=23))
    return m


def leg():
    """Ribbed corduroy leg running down from the hip."""
    profile = []
    steps = 26
    for i in range(steps + 1):
        t = i / float(steps)
        y = 0.045 - 0.253 * t
        r = 0.055 * (1.0 + 0.16 * math.sin(t * math.pi * 2.0 * 6.0))
        r *= 1.0 + 0.22 * math.exp(-((t - 0.02) ** 2) / 0.006)   # thicker at the hip
        profile.append((r, y))
    profile = list(reversed(profile))
    return ms.revolve(profile, "cord_red", segments=18)


def foot():
    """Soft black wedge foot, flat underneath, pointing forward."""
    half = [
        (0.000, -0.094), (0.049, -0.078), (0.079, -0.016), (0.095, 0.055),
        (0.103, 0.120), (0.079, 0.170), (0.035, 0.189), (0.000, 0.196),
    ]
    outline = half + [(-x, z) for x, z in reversed(half[1:-1])]

    def ring(scale_xz, y, shrink_front=1.0):
        pts = []
        for x, z in outline:
            f = shrink_front if z > 0 else 1.0
            pts.append((x * scale_xz * f, y, z * scale_xz))
        return pts

    sections = [
        ring(0.86, 0.000),
        ring(1.00, 0.042),
        ring(0.94, 0.086),
        ring(0.62, 0.120, shrink_front=0.72),
        ring(0.28, 0.140, shrink_front=0.62),
    ]
    m = _outward(ms.loft(sections, "foot_black", cap_start=True, cap_end=True))
    m.translate((0.0, -0.126, 0.012))
    return m


def tail(fuzz=True):
    """Stubby grey tail fan sweeping back and up."""
    sections = []
    steps = 8
    for i in range(steps + 1):
        t = i / float(steps)
        z = -0.185 * t
        w = 0.095 * (1.0 - 0.35 * t)
        h = 0.120 * (1.0 + 0.28 * t) * math.sqrt(max(0.0, 1.0 - t ** 4))
        if i == steps:
            w = h = 0.006
        ring = []
        for s in range(16):
            a = 2.0 * math.pi * s / 16
            ring.append((math.cos(a) * w, math.sin(a) * h + 0.075 * t, z))
        sections.append(ring)
    m = _outward(ms.loft(sections, "plush_grey", cap_start=True, cap_end=False))
    if fuzz:
        m.displace(_plush_fuzz(amp=0.006, freq=12.0, seed=31))
    return m


def _seam(surface, rings, segments, y_lo, y_hi, radius=0.0025, lift=0.002):
    """Piping along a revolved surface's centre line, front over to back.

    A sewn toy reads as sewn through its seams, and he had none. This lays a
    fine cord of darker thread along the meridian -- down the front, through
    the bottom pole, up the back, between `y_lo` and `y_hi` -- using the
    surface's own vertices, so it follows the plush lumps rather than a
    smooth idealisation, lifted a hair off them so it is never buried.

    The meridian is picked by where it sits in `ms.revolve`'s layout (rings
    bottom to top, `segments + 1` vertices each, a quarter turn round is the
    front) rather than by x = 0: the lumps push those vertices a millimetre
    off the centre line, and a test for x = 0 found almost none of them.
    """
    stride = segments + 1
    col_f, col_b = segments // 4, 3 * segments // 4

    def at(j, col):
        i = j * stride + col
        p, n = surface.verts[i], surface.norms[i]
        return p, v.add(p, v.mul(n, lift))

    order = ([(j, col_f) for j in range(rings - 1, 0, -1)] + [(0, col_f)] +
             [(j, col_b) for j in range(1, rings)])
    path = []
    for j, col in order:
        p, q = at(j, col)
        if y_lo <= p[1] <= y_hi and (not path or v.length(v.sub(q, path[-1])) > 1e-4):
            path.append(q)
    from .ginger import tube        # the same path-following loft she uses
    return tube(path, [(radius, radius)] * len(path), "seam", segments=6)


# --------------------------------------------------------------- assembly


def build_parts(fuzz=True):
    """Mesh for each joint, expressed in that joint's local space."""
    head = ms.Mesh()
    ball = head_ball(fuzz)
    head.merge(ball)
    # Over the crown from between the eyes to the nape; the comb sits on it.
    head.merge(_seam(ball, 21, 28, -0.06, 0.2))
    head.merge(beak())
    head.merge(eye(1.0))
    head.merge(eye(-1.0))

    inner_l, outer_l = wing(fuzz)
    inner_r, outer_r = wing(fuzz)
    inner_r.mirror_x()
    outer_r.mirror_x()

    body = torso(fuzz)
    # Down the front, under him between the legs, and up the back.
    body.merge(_seam(body, 13, 28, -1.0, 0.27))

    parts = {
        "hips": body,
        "neck": neck(fuzz),
        "head": head,
        "comb": comb(),
        "wattle": wattle(),
        "shoulder_l": inner_l,
        "shoulder_r": inner_r,
        "wingtip_l": outer_l,
        "wingtip_r": outer_r,
        "hip_l": leg(),
        "hip_r": leg().mirror_x(),
        "ankle_l": foot(),
        "ankle_r": foot().mirror_x(),
        "tail": tail(fuzz),
    }
    for part in parts.values():
        part.compute_tangents()
    # Darken the creases once, in the rest pose; see occlusion.py.
    occlusion.bake(parts, sys.modules[__name__])
    return parts
