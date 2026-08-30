"""Ginger: geometry, materials and joint hierarchy for the dog.

Modelled from photographs, using the same procedural approach as Mr.
Cluckers. Where he is genuinely rigid parts, a dog is not -- so the body is
built as one lofted tube along the spine and the limbs are separate tubes,
which keeps the silhouette right and still gives the rig somewhere to bend.

Conventions match rig.py: Y up, X right, facing +Z. The unit is Mr.
Cluckers' standing height, so Ginger's shoulder comes to about 1.15 and the
top of her head to roughly 1.45 -- she is a good deal bigger than the toy.

Reference notes worth keeping: she is leggier than a pure Staffordshire
(front legs about half her shoulder height), deep-chested with a clear waist
tuck, and her tail is long, thin and whip-like rather than stubby.
"""

import math

from . import mesh as ms
from . import vmath as v

SHOULDER_H = 1.15

# --------------------------------------------------------------- palette
# Sampled from the photographs by clustering: the coat is a warm fawn that
# darkens along the spine, with white on the blaze, chest, toes and tail tip.
MATERIALS = {
    "coat":       {"color": "#ad7c55", "rough": 0.88, "fuzz": 0.45, "tex": "shortcoat"},
    "coat_dark":  {"color": "#7d5537", "rough": 0.88, "fuzz": 0.45, "tex": "shortcoat"},
    "mask":       {"color": "#6d5039", "rough": 0.85, "fuzz": 0.35, "tex": "shortcoat"},
    "white":      {"color": "#e8ded0", "rough": 0.85, "fuzz": 0.40, "tex": "shortcoat"},
    "nose":       {"color": "#241d1b", "rough": 0.42, "fuzz": 0.00, "tex": None},
    "mouth":      {"color": "#9a5b62", "rough": 0.55, "fuzz": 0.00, "tex": None},
    "eye_iris":   {"color": "#77471f", "rough": 0.22, "fuzz": 0.00, "tex": None},
    "eye_dark":   {"color": "#120e0d", "rough": 0.18, "fuzz": 0.00, "tex": None},
    "eye_rim":    {"color": "#1a1412", "rough": 0.45, "fuzz": 0.00, "tex": None},
    "eye_glint":  {"color": "#f6f4ef", "rough": 0.06, "fuzz": 0.00, "tex": None},
    "collar":     {"color": "#1b191e", "rough": 0.60, "fuzz": 0.10, "tex": None},
    "tag":        {"color": "#0f0f13", "rough": 0.35, "fuzz": 0.00, "tex": None},
}

# ---------------------------------------------------------------- skeleton
# Laid out now so the rig has somewhere to go, even though this pass only
# needs the rest pose.
SKELETON = [
    ("root",       None,      (0.000, 0.000,  0.000)),
    ("hips",       "root",    (0.000, 0.950, -0.430)),
    ("spine",      "hips",    (0.000, -0.030, 0.300)),
    ("chest",      "spine",   (0.000, -0.010, 0.310)),
    ("neck",       "chest",   (0.000, 0.055,  0.130)),
    ("head",       "neck",    (0.000, 0.175,  0.170)),
    ("ear_l",      "head",    (0.128, 0.195, 0.160)),
    ("ear_r",      "head",    (-0.128, 0.195, 0.160)),
    ("tail_a",     "hips",    (0.000, 0.060, -0.210)),
    ("tail_b",     "tail_a",  (0.000, 0.070, -0.130)),
    ("tail_c",     "tail_b",  (0.000, 0.040, -0.130)),
    ("sh_l",       "chest",   (0.108, 0.045, 0.165)),
    ("sh_r",       "chest",   (-0.108, 0.045, 0.165)),
    ("elbow_l",    "sh_l",    (0.012, -0.395, -0.029)),
    ("elbow_r",    "sh_r",    (-0.012, -0.395, -0.029)),
    ("hip_l",      "hips",    (0.112, 0.005, 0.010)),
    ("hip_r",      "hips",    (-0.112, 0.005, 0.010)),
    ("stifle_l",   "hip_l",   (0.012, -0.355, 0.085)),
    ("stifle_r",   "hip_r",   (-0.012, -0.355, 0.085)),
    ("hock_l",     "stifle_l", (-0.006, -0.280, -0.160)),
    ("hock_r",     "stifle_r", (0.006, -0.280, -0.160)),
]

PARENT = {n: p for n, p, _ in SKELETON}
REST_T = {n: t for n, _, t in SKELETON}
ORDER = [n for n, _, _ in SKELETON]


# ------------------------------------------------------------- tube along
def _frame(direction, up=(0.0, 1.0, 0.0)):
    """An orthonormal frame with `direction` as the axis."""
    d = v.normalize(direction)
    if abs(v.dot(d, up)) > 0.97:
        up = (0.0, 0.0, 1.0)
    right = v.normalize(v.cross(up, d))
    real_up = v.cross(d, right)
    return right, real_up


def tube(path, radii, material, segments=16, cap_start=True, cap_end=True,
         roll_up=(0.0, 1.0, 0.0)):
    """Loft a tapering tube along a polyline.

    `radii` is one (rx, ry) per station, measured in the plane perpendicular
    to the path -- which is what lets one helper build a ribcage, a foreleg
    and a tail without special cases.
    """
    n = len(path)
    sections = []
    for i, p in enumerate(path):
        nxt = path[min(i + 1, n - 1)]
        prv = path[max(i - 1, 0)]
        d = v.sub(nxt, prv)
        if v.length(d) < 1e-9:
            d = (0.0, 0.0, 1.0)
        right, up = _frame(d, roll_up)
        rx, ry = radii[i]
        ring = []
        for s in range(segments):
            a = 2.0 * math.pi * s / segments
            off = v.add(v.mul(right, math.cos(a) * rx),
                        v.mul(up, math.sin(a) * ry))
            ring.append(v.add(p, off))
        sections.append(ring)
    return ms.loft(sections, material, cap_start=cap_start, cap_end=cap_end)


def smooth(stations, per_segment=3):
    """Catmull-Rom resample of a (z, y, rx, ry) table.

    Hand-written stations give the shape; this gives it enough rings that the
    body reads as a body rather than a run of flat panels.
    """
    n = len(stations)
    out = []
    for i in range(n - 1):
        p0 = stations[max(i - 1, 0)]
        p1, p2 = stations[i], stations[i + 1]
        p3 = stations[min(i + 2, n - 1)]
        for k in range(per_segment):
            t = k / float(per_segment)
            t2, t3 = t * t, t * t * t
            row = []
            for c in range(4):
                row.append(0.5 * ((2 * p1[c]) +
                                  (-p0[c] + p2[c]) * t +
                                  (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 +
                                  (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3))
            out.append(tuple(row))
    out.append(stations[-1])
    return out


def wobble(x, y, z, amp=0.030, freq=6.0, seed=5):
    """Jitter a marking boundary so it reads as fur rather than a decal."""
    return amp * ms.value_noise3((x * freq, y * freq, z * freq), seed)


def almond(w, h, depth, material, segments=20, rings=4, power=1.5):
    """A shallow dome with pointed corners -- the shape of an eye.

    A superellipse exponent below 2 pulls the corners out, which is what
    separates an eye from a bead stuck on the side of the head.
    """
    sections = []
    for r in range(rings + 1):
        t = r / float(rings)
        k = math.sqrt(max(0.0, 1.0 - t * t))
        ring = []
        for sg in range(segments):
            a = 2.0 * math.pi * sg / segments
            ca, sa = math.cos(a), math.sin(a)
            ex = math.copysign(abs(ca) ** (2.0 / power), ca) if ca else 0.0
            ey = math.copysign(abs(sa) ** (2.0 / power), sa) if sa else 0.0
            ring.append((ex * w * k, ey * h * k, t * depth))
        sections.append(ring)
    return ms.loft(sections, material, cap_start=True, cap_end=False)


def paint(mesh, predicate, material):
    """Reassign faces whose centroid satisfies `predicate` -- how the white
    markings and the dark mask get applied without extra geometry."""
    faces = []
    for a, b, c, mat in mesh.faces:
        pa, pb, pc = mesh.verts[a], mesh.verts[b], mesh.verts[c]
        cx = (pa[0] + pb[0] + pc[0]) / 3.0
        cy = (pa[1] + pb[1] + pc[1]) / 3.0
        cz = (pa[2] + pb[2] + pc[2]) / 3.0
        faces.append((a, b, c, material if predicate(cx, cy, cz) else mat))
    mesh.faces = faces
    return mesh


# ------------------------------------------------------------------ parts
def body():
    """Ribcage through loin to hips: deep chest, clear waist, full haunches.

    Compact rather than long -- she is close to square, shoulder height to
    body length, which is what the side-on photographs show.
    """
    stations = [
        # (z,      y,     rx,    ry)
        (0.460, 0.920, 0.115, 0.125),
        (0.340, 0.885, 0.175, 0.235),
        (0.180, 0.865, 0.205, 0.255),
        (0.000, 0.875, 0.196, 0.245),
        (-0.160, 0.905, 0.168, 0.198),
        (-0.320, 0.930, 0.172, 0.182),
        (-0.460, 0.930, 0.192, 0.194),
        (-0.580, 0.935, 0.155, 0.160),
        (-0.620, 0.940, 0.080, 0.085),
    ]
    stations = smooth(stations, 4)
    path = [(0.0, y, z) for z, y, _, _ in stations]
    radii = [(rx, ry) for _, _, rx, ry in stations]
    m = tube(path, radii, "coat", segments=26)

    # White bib on the front of the chest, and a narrow belly stripe.
    paint(m, lambda x, y, z: z > 0.375 + wobble(x, y, z, 0.045)
          and y < 0.850 + wobble(x, y, z, 0.040, seed=9), "white")
    paint(m, lambda x, y, z: -0.16 < z < 0.30
          and y < 0.695 + wobble(x, y, z, 0.035, seed=17)
          and abs(x) < 0.105 + wobble(x, y, z, 0.030, seed=23), "white")
    return m


def neck():
    """Short and thick -- most of the apparent neck is shoulder."""
    path = [(0.0, 0.945, 0.330), (0.0, 1.010, 0.430), (0.0, 1.090, 0.505),
            (0.0, 1.170, 0.565), (0.0, 1.235, 0.605)]
    radii = [(0.180, 0.196), (0.168, 0.180), (0.152, 0.160),
             (0.140, 0.146), (0.132, 0.136)]
    m = tube(path, radii, "coat", segments=22, cap_start=False, cap_end=False)
    paint(m, lambda x, y, z: y < 1.02 + wobble(x, y, z, 0.035, seed=13)
          and z > 0.36, "white")
    return m


def head():
    """Broad skull, moderate muzzle, blaze and eye mask painted on."""
    out = ms.Mesh()

    skull = [
        (0.545, 1.252, 0.136, 0.130),
        (0.630, 1.300, 0.158, 0.150),
        (0.715, 1.318, 0.166, 0.157),
        (0.800, 1.304, 0.143, 0.139),
        (0.858, 1.282, 0.113, 0.112),
    ]
    # Markings are painted per face, so the boundary can only be as smooth as
    # the mesh -- the head is deliberately denser than the body for that.
    skull = smooth(skull, 10)
    out.merge(tube([(0.0, y, z) for z, y, _, _ in skull],
                   [(rx, ry) for _, _, rx, ry in skull], "coat", segments=52))

    muzzle = [
        (0.836, 1.262, 0.101, 0.095),
        (0.890, 1.250, 0.095, 0.087),
        (0.945, 1.240, 0.087, 0.079),
        (0.995, 1.232, 0.073, 0.067),
        (1.022, 1.228, 0.049, 0.046),
    ]
    muzzle = smooth(muzzle, 10)
    out.merge(tube([(0.0, y, z) for z, y, _, _ in muzzle],
                   [(rx, ry) for _, _, rx, ry in muzzle], "coat", segments=44))

    # Dark mask around each eye, white blaze up the centre, white lower muzzle.
    # A rounded patch centred on each eye, rather than a band across the skull.
    def near_eye(x, y, z):
        dx, dy, dz = abs(x) - 0.104, y - 1.298, z - 0.836
        r = dx * dx * 1.1 + dy * dy * 1.4 + dz * dz * 0.7
        return r < 0.0044 + wobble(x, y, z, 0.00035, 30, seed=41)
    paint(out, near_eye, "mask")
    paint(out, lambda x, y, z: abs(x) < 0.029 + wobble(x, y, z, 0.0035, 26)
          and z > 0.660 and y > 1.245, "white")
    paint(out, lambda x, y, z: y < 1.246 + wobble(x, y, z, 0.004, 24, seed=31)
          and z > 0.845, "white")

    nose = ms.sphere(0.044, "nose", segments=16, rings=12)
    nose.scale((1.0, 0.86, 0.80))
    nose.translate((0.0, 1.236, 1.018))
    out.merge(nose)

    out.merge(_lip(1.0))
    out.merge(_lip(-1.0))
    for side in (1.0, -1.0):
        out.merge(eye(side))
    return out


def _lip(side):
    path = [(0.048 * side, 1.210, 0.990), (0.078 * side, 1.206, 0.918),
            (0.086 * side, 1.208, 0.858)]
    return tube(path, [(0.015, 0.011), (0.019, 0.014), (0.015, 0.011)],
                "mouth", segments=10)


def eye(side):
    """Rim, iris, pupil and a highlight, stacked outward along the eye axis.

    Placed on the skull surface just behind the stop and angled forward, which
    is where a dog's eyes actually sit -- forward enough to be seen head-on.
    """
    out = ms.Mesh()
    out.merge(almond(0.046, 0.027, 0.009, "eye_rim"))

    iris = almond(0.036, 0.020, 0.011, "eye_iris")
    iris.translate((0.0, 0.0, 0.004))
    out.merge(iris)

    pupil = almond(0.016, 0.015, 0.010, "eye_dark", power=1.9)
    pupil.translate((0.0, 0.0, 0.011))
    out.merge(pupil)

    glint = ms.sphere(0.0058, "eye_glint", segments=10, rings=8)
    glint.translate((-0.011 * side, 0.008, 0.016))
    out.merge(glint)

    # Outer corner slightly higher than the inner, the way a dog's eye sits.
    out.transform(v.rot_z(v.deg(-9 * side)))
    out.transform(v.rot_x(v.deg(-6)))
    out.transform(v.rot_y(v.deg(48 * side)))
    out.translate((0.113 * side, 1.295, 0.845))
    return out


def ear(side):
    """Rose ear: folds down against the side of the skull, tipped darker."""
    path = [(0.0, 0.030, -0.020), (0.024, -0.040, 0.008),
            (0.042, -0.115, 0.044), (0.048, -0.180, 0.076)]
    radii = [(0.088, 0.044), (0.082, 0.040), (0.058, 0.028), (0.020, 0.011)]
    m = tube([(x * side, y, z) for x, y, z in path], radii, "coat", segments=14)
    paint(m, lambda x, y, z: y < -0.120, "coat_dark")
    return m


def foreleg(side):
    """Upper and lower, split at the elbow so the joint can bend.

    Each piece overlaps the next by a station so a bend never opens a gap.
    """
    upper = tube([(0.108 * side, 0.960, 0.345), (0.118 * side, 0.760, 0.328),
                  (0.120 * side, 0.560, 0.316), (0.120 * side, 0.470, 0.315)],
                 [(0.098, 0.118), (0.076, 0.090), (0.058, 0.066), (0.052, 0.058)],
                 "coat", segments=14, cap_start=False)
    lower = ms.Mesh()
    lower.merge(tube([(0.120 * side, 0.600, 0.316), (0.120 * side, 0.330, 0.314),
                      (0.120 * side, 0.115, 0.312)],
                     [(0.056, 0.062), (0.040, 0.042), (0.034, 0.036)],
                     "coat", segments=12, cap_start=False))
    lower.merge(paw(side, 0.312, front=True))
    return {"upper": upper, "lower": lower}


def hindleg(side):
    """The dog zigzag: heavy thigh, stifle forward, hock back and low."""
    thigh = tube([(0.112 * side, 0.955, -0.420), (0.128 * side, 0.770, -0.375),
                  (0.124 * side, 0.600, -0.335), (0.123 * side, 0.530, -0.373)],
                 [(0.122, 0.155), (0.104, 0.126), (0.064, 0.078), (0.056, 0.066)],
                 "coat", segments=16, cap_start=False)
    shin = tube([(0.124 * side, 0.645, -0.310), (0.120 * side, 0.455, -0.415),
                 (0.118 * side, 0.320, -0.495), (0.118 * side, 0.265, -0.486)],
                [(0.062, 0.074), (0.046, 0.052), (0.036, 0.040), (0.033, 0.036)],
                "coat", segments=12, cap_start=False)
    rear = ms.Mesh()
    rear.merge(tube([(0.118 * side, 0.365, -0.503), (0.118 * side, 0.180, -0.470),
                     (0.118 * side, 0.065, -0.455)],
                    [(0.037, 0.041), (0.031, 0.033), (0.029, 0.031)],
                    "coat", segments=12, cap_start=False))
    rear.merge(paw(side, -0.455, front=False))
    return {"thigh": thigh, "shin": shin, "rear": rear}


def paw(side, z, front=True):
    """White toes -- one of her clearest markings."""
    length = 0.092 if front else 0.086
    path = [(0.120 * side, 0.058, z), (0.120 * side, 0.024, z + length * 0.45),
            (0.120 * side, 0.014, z + length)]
    m = tube(path, [(0.038, 0.036), (0.043, 0.032), (0.031, 0.021)],
             "white", segments=12)
    return m


def tail():
    """Long, thin and whip-like, in three segments so it can actually wag.

    A whip tail is almost all follow-through, so the segments matter more
    here than anywhere else on her.
    """
    path = [(0.0, 1.010, -0.640), (0.0, 1.075, -0.760), (0.0, 1.120, -0.890),
            (0.0, 1.135, -1.010), (0.0, 1.120, -1.110)]
    radii = [(0.050, 0.052), (0.038, 0.040), (0.028, 0.029),
             (0.019, 0.020), (0.008, 0.008)]

    def piece(i0, i1, cap_end=True):
        m = tube(path[i0:i1 + 1], radii[i0:i1 + 1], "coat", segments=12,
                 cap_start=False, cap_end=cap_end)
        paint(m, lambda x, y, z: z < -1.035, "white")
        return m

    return {"a": piece(0, 1), "b": piece(1, 2), "c": piece(2, 4, cap_end=False)}


def collar():
    """Flat black collar with the bone tag she wears in every photograph."""
    out = ms.Mesh()
    ring = []
    for s in range(28):
        a = 2.0 * math.pi * s / 28
        ring.append((math.cos(a) * 0.156, math.sin(a) * 0.164, 0.0))
    band = [[(x, y, z + t) for x, y, z in ring] for t in (-0.024, 0.024)]
    m = ms.loft(band, "collar", cap_start=True, cap_end=True)
    m.transform(v.rot_x(v.deg(-28)))
    m.translate((0.0, 1.020, 0.500))
    out.merge(m)

    tag = ms.sphere(0.048, "tag", segments=14, rings=10)
    tag.scale((1.0, 0.74, 0.22))
    tag.translate((0.0, 0.885, 0.575))
    out.merge(tag)
    return out


# --------------------------------------------------------------- assembly
def build_parts(fuzz=True):
    """One mesh per joint, in that joint's local space."""
    world = {}
    for name in ORDER:
        parent = PARENT[name]
        t = v.translation(REST_T[name])
        world[name] = t if parent is None else v.mat_mul(world[parent], t)

    def localize(mesh, joint):
        inv = v.translation(v.mul(v.transform_point(world[joint], (0, 0, 0)), -1.0))
        return mesh.transform(inv)

    head_mesh = ms.Mesh()
    head_mesh.merge(head())

    tl = tail()
    fl, fr = foreleg(1.0), foreleg(-1.0)
    hl, hr = hindleg(1.0), hindleg(-1.0)

    parts = {
        "hips": localize(body(), "hips"),
        "neck": localize(neck(), "neck"),
        "head": localize(head_mesh, "head"),
        "ear_l": ear(1.0),
        "ear_r": ear(-1.0),
        "chest": localize(collar(), "chest"),
        "tail_a": localize(tl["a"], "tail_a"),
        "tail_b": localize(tl["b"], "tail_b"),
        "tail_c": localize(tl["c"], "tail_c"),
        "sh_l": localize(fl["upper"], "sh_l"),
        "sh_r": localize(fr["upper"], "sh_r"),
        "elbow_l": localize(fl["lower"], "elbow_l"),
        "elbow_r": localize(fr["lower"], "elbow_r"),
        "hip_l": localize(hl["thigh"], "hip_l"),
        "hip_r": localize(hr["thigh"], "hip_r"),
        "stifle_l": localize(hl["shin"], "stifle_l"),
        "stifle_r": localize(hr["shin"], "stifle_r"),
        "hock_l": localize(hl["rear"], "hock_l"),
        "hock_r": localize(hr["rear"], "hock_r"),
    }
    for part in parts.values():
        part.compute_tangents()
    return parts
