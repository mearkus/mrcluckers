"""The rest of the world: scenery, wildlife, kibble and acorns.

Everything else in the three.js level was built in the page out of bare
three.js spheres and cylinders -- nine-segment balls for the trees, flat
colour, no fabric -- so a felt rooster with sheen and stitched seams stood in
a world of untextured primitives. These are built here instead, the way he
and Ginger are: the same fabric maps, the same sheen from `fuzz`, the same
baked creases. The world is his size and made of what he is made of: a
toy's-eye diorama, not a photograph.

Every prop keeps the size and shape the page gave it -- the levels place
props by their base, the critters carry a stolen kibble at a point the page
knows, and none of that should move. Conventions are the page's, not the
characters': a prop's origin is the middle of its base, and the critters face
+X, since that is how the page turns them.

One GLB, one top-level node per prop. The bird's wings are nodes of their own
so the page can still flap them.
"""

import math
import types

from . import mesh as ms
from . import occlusion
from . import vmath as v

MATERIALS = {
    # Scenery
    "pot":         {"color": "#a9603c", "rough": 0.85, "fuzz": 0.25, "tex": "felt"},
    "soil":        {"color": "#4a3a2a", "rough": 0.95, "fuzz": 0.30, "tex": "felt"},
    "leaf":        {"color": "#4e8a45", "rough": 0.95, "fuzz": 0.80, "tex": "fur"},
    "leaf_light":  {"color": "#63a44f", "rough": 0.95, "fuzz": 0.80, "tex": "fur"},
    "canopy":      {"color": "#4f8a3f", "rough": 0.95, "fuzz": 0.80, "tex": "fur"},
    "bark":        {"color": "#6b4a2f", "rough": 0.90, "fuzz": 0.35, "tex": "corduroy"},
    "lamp_metal":  {"color": "#5c5148", "rough": 0.70, "fuzz": 0.10, "tex": "felt"},
    "lamp_shade":  {"color": "#e8cf9a", "rough": 0.90, "fuzz": 0.30, "tex": "felt"},
    "bowl":        {"color": "#3f6f96", "rough": 0.70, "fuzz": 0.15, "tex": "felt"},
    "ball":        {"color": "#d34a3f", "rough": 0.85, "fuzz": 0.45, "tex": "felt"},
    "ball_band":   {"color": "#f1eee6", "rough": 0.85, "fuzz": 0.45, "tex": "felt"},
    "stem":        {"color": "#4e8a45", "rough": 0.90, "fuzz": 0.20, "tex": "felt"},
    "petal_yellow": {"color": "#e8d24a", "rough": 0.85, "fuzz": 0.30, "tex": "felt"},
    "petal_pink":  {"color": "#e07ba8", "rough": 0.85, "fuzz": 0.30, "tex": "felt"},
    "petal_white": {"color": "#f2f2f2", "rough": 0.85, "fuzz": 0.30, "tex": "felt"},
    "flower_eye":  {"color": "#c9762e", "rough": 0.85, "fuzz": 0.30, "tex": "felt"},
    "bin":         {"color": "#4a5560", "rough": 0.80, "fuzz": 0.15, "tex": "corduroy"},
    "bin_lid":     {"color": "#5d6b78", "rough": 0.80, "fuzz": 0.15, "tex": "felt"},
    "post":        {"color": "#6d5945", "rough": 0.90, "fuzz": 0.25, "tex": "corduroy"},
    "post_cap":    {"color": "#8a7359", "rough": 0.90, "fuzz": 0.25, "tex": "felt"},
    # Food
    "kibble":      {"color": "#c8892f", "rough": 0.80, "fuzz": 0.20, "tex": "felt"},
    "acorn":       {"color": "#8a6a3c", "rough": 0.70, "fuzz": 0.15, "tex": "felt"},
    "acorn_cap":   {"color": "#5d4527", "rough": 0.90, "fuzz": 0.40, "tex": "corduroy"},
    # Wildlife
    "feather":     {"color": "#5b788d", "rough": 0.90, "fuzz": 0.55, "tex": "shortcoat"},
    "feather_wing": {"color": "#6d8ba1", "rough": 0.90, "fuzz": 0.55, "tex": "shortcoat"},
    "beak":        {"color": "#e0a33c", "rough": 0.70, "fuzz": 0.05, "tex": "felt"},
    "squirrel":    {"color": "#8d6440", "rough": 0.90, "fuzz": 0.80, "tex": "fur"},
    "squirrel_tail": {"color": "#7a5334", "rough": 0.95, "fuzz": 0.90, "tex": "fur"},
    "squirrel_belly": {"color": "#c9a57c", "rough": 0.90, "fuzz": 0.80, "tex": "fur"},
    "eye":         {"color": "#14151a", "rough": 0.30, "fuzz": 0.00, "tex": None},
}


def _lumpy(amp, freq, seed):
    """Low-frequency lumps, so foliage and fur read as stuffed, not turned."""
    def fn(p, n):
        a = ms.value_noise3((p[0] * freq, p[1] * freq, p[2] * freq), seed)
        b = ms.value_noise3((p[0] * freq * 2.3, p[1] * freq * 2.3,
                             p[2] * freq * 2.3), seed + 7)
        return amp * (a + 0.45 * b)
    return fn


def _ball(r, material, at=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0), lumps=None,
          segments=28, rings=18):
    m = ms.sphere(r, material, segments=segments, rings=rings)
    m.scale(scale)
    if lumps:
        m.displace(_lumpy(*lumps))
    m.translate(at)
    return m


def _turned(profile, material, segments=28, at=(0.0, 0.0, 0.0)):
    """A surface of revolution about Y -- pot, lamp, bowl, trunk, bin."""
    m = ms.revolve(profile, material, segments=segments)
    m.translate(at)
    return m


def _square(width, depth, height, material, y0=0.0):
    """A four-sided turned block, square to the axes: posts and caps.

    Turned rather than extruded so it faces outward without being checked,
    which mesh.extrude does not reliably do.
    """
    r = math.sqrt(0.5)
    m = ms.revolve([(0.0, 0.0), (r, 0.0), (r, height), (0.0, height)], material,
                   segments=4)
    m.flat_normals()
    m.transform(v.rot_y(math.pi / 4))
    m.scale((width, 1.0, depth))
    m.translate((0.0, y0, 0.0))
    return m


# ------------------------------------------------------------- scenery

def plant():
    """A pot plant: a flared terracotta pot, earth, three lumps of leaves."""
    m = _turned([(0.0, 0.0), (0.13, 0.0), (0.165, 0.28), (0.186, 0.285),
                 (0.186, 0.32), (0.0, 0.32)], "pot")
    m.merge(_turned([(0.0, 0.312), (0.16, 0.312), (0.16, 0.328), (0.0, 0.328)],
                    "soil", segments=24))
    for (x, y, r, mat, seed) in ((-0.14, 0.52, 0.13, "leaf", 3),
                                 (0.02, 0.66, 0.15, "leaf_light", 5),
                                 (0.15, 0.53, 0.12, "leaf", 9)):
        m.merge(_ball(r, mat, at=(x, y, 0.0), lumps=(0.022, 9.0, seed)))
    # Stalks down into the pot, so the leaves are attached to something.
    for x in (-0.09, 0.02, 0.1):
        m.merge(_turned([(0.012, 0.3), (0.010, 0.52), (0.0, 0.52)], "stem",
                        segments=8, at=(x, 0.0, 0.0)))
    return m


def lamp():
    """A standard lamp: a weighted foot, a pole, and a felt shade."""
    m = _turned([(0.0, 0.0), (0.16, 0.0), (0.16, 0.03), (0.07, 0.06),
                 (0.0, 0.06)], "lamp_metal")
    m.merge(_turned([(0.035, 0.05), (0.035, 1.0), (0.0, 1.0)], "lamp_metal",
                    segments=16))
    m.merge(_turned([(0.0, 1.0), (0.26, 1.0), (0.265, 1.02), (0.175, 1.33),
                     (0.17, 1.34), (0.0, 1.34)], "lamp_shade", segments=32))
    return m


def bowl():
    """His bowl, full: a real bowl with a hollow, and kibble heaped in it."""
    m = _turned([(0.0, 0.0), (0.17, 0.0), (0.24, 0.19), (0.215, 0.19),
                 (0.15, 0.06), (0.0, 0.06)], "bowl", segments=32)
    # Heaped above the rim: the camera is side-on, and food below the rim
    # is a bowl that looks empty.
    m.merge(_turned([(0.0, 0.1), (0.205, 0.1), (0.2, 0.19), (0.12, 0.215),
                     (0.0, 0.225)], "kibble", segments=24))
    for i, (x, y, z) in enumerate(((-0.12, 0.2, 0.06), (-0.02, 0.23, 0.1),
                                   (0.09, 0.21, 0.07), (-0.06, 0.22, -0.06),
                                   (0.06, 0.225, -0.05), (0.14, 0.195, 0.1),
                                   (0.02, 0.245, 0.0))):
        m.merge(_ball(0.04, "kibble", at=(x, y, z), scale=(1.0, 0.72, 1.0),
                      lumps=(0.006, 30.0, 40 + i), segments=12, rings=8))
    return m


def ball():
    """A toy ball, felt, with a pale band round it like the dog's own."""
    m = _ball(0.15, "ball", at=(0.0, 0.15, 0.0), segments=36, rings=24)
    # The band is a ring of its own sewn round the ball, not painted faces --
    # painted, its edge followed the triangles and came out a staircase.
    k, a, R = 24, 0.022, 0.146
    prof = [(R + 0.006 * math.cos(2 * math.pi * i / k),
             a * math.sin(2 * math.pi * i / k)) for i in range(k + 1)]
    band = ms.revolve(prof, "ball_band", segments=48, close_bottom=False,
                      close_top=False)
    band.transform(v.rot_z(0.5))
    band.transform(v.rot_x(0.25))
    band.translate((0.0, 0.15, 0.0))
    m.merge(band)
    return m


def tree():
    """A tree his size: a ribbed corduroy trunk and three stuffed lumps."""
    m = _turned([(0.0, 0.0), (0.125, 0.0), (0.115, 0.06), (0.09, 1.0),
                 (0.0, 1.0)], "bark", segments=20)
    for (x, y, r, mat, seed) in ((0.0, 1.32, 0.46, "canopy", 11),
                                 (-0.32, 1.10, 0.30, "canopy", 13),
                                 (0.30, 1.16, 0.28, "leaf_light", 17)):
        m.merge(_ball(r, mat, at=(x, y, 0.0), scale=(1.0, 0.8, 1.0),
                      lumps=(0.04, 4.5, seed), segments=32, rings=20))
    return m


def flowers():
    """Four flowers, each five felt petals round an eye, facing out."""
    m = ms.Mesh()
    cols = ("petal_yellow", "petal_pink", "petal_white", "petal_yellow")
    for (x, mat) in zip((-0.16, -0.04, 0.09, 0.2), cols):
        m.merge(_turned([(0.015, 0.0), (0.013, 0.29), (0.0, 0.29)], "stem",
                        segments=8, at=(x, 0.0, 0.0)))
        for k in range(5):
            a = 2.0 * math.pi * k / 5 + 0.3
            petal = _ball(0.034, mat, scale=(1.0, 0.62, 0.35), segments=12, rings=8)
            petal.translate((0.03, 0.0, 0.0))
            petal.transform(v.rot_z(a))
            petal.translate((x, 0.29, 0.012))
            m.merge(petal)
        m.merge(_ball(0.02, "flower_eye", at=(x, 0.29, 0.022), segments=12, rings=8))
    return m


def bin_():
    """A dustbin: ribbed sides, a lid, a handle on the lid."""
    m = _turned([(0.0, 0.0), (0.23, 0.0), (0.19, 0.52), (0.0, 0.52)], "bin",
                segments=32)
    m.merge(_turned([(0.0, 0.515), (0.222, 0.515), (0.222, 0.565), (0.18, 0.58),
                     (0.0, 0.58)], "bin_lid", segments=32))
    m.merge(_square(0.12, 0.03, 0.035, "bin_lid", y0=0.575))
    return m


def post():
    """A fence post and its cap."""
    m = _square(0.11, 0.11, 0.78, "post")
    m.merge(_square(0.26, 0.16, 0.07, "post_cap", y0=0.775))
    return m


# ---------------------------------------------------------------- food

def kibble():
    """One piece: a lumpy nugget, not a marble."""
    return _ball(0.09, "kibble", scale=(1.0, 0.74, 1.0), lumps=(0.012, 14.0, 21),
                 segments=20, rings=14)


def acorn():
    """A pointed nut under a ribbed cap with a stalk."""
    m = ms.sphere(0.11, "acorn", segments=20, rings=14)
    m.scale((1.0, 1.25, 1.0))
    # Drawn to a point at the bottom, as an acorn is.
    m.verts = [(x * (1.0 + 0.45 * min(0.0, y) / 0.14),
                y, z * (1.0 + 0.45 * min(0.0, y) / 0.14)) for x, y, z in m.verts]
    m.smooth_normals()
    cap = ms.sphere(0.11, "acorn_cap", segments=20, rings=14)
    cap.scale((0.95, 0.5, 0.95))
    cap.translate((0.0, 0.1, 0.0))
    m.merge(cap)
    m.merge(_turned([(0.012, 0.13), (0.008, 0.19), (0.0, 0.19)], "acorn_cap",
                    segments=8))
    return m


# ------------------------------------------------------------ wildlife

BIRD_WING_AT = (-0.01, 0.16, 0.07)


def bird():
    """Round, small, a short tail; the wings are separate nodes."""
    m = _ball(0.13, "feather", at=(0.0, 0.13, 0.0), scale=(1.15, 1.0, 1.0),
              lumps=(0.006, 12.0, 31))
    m.merge(_ball(0.085, "feather", at=(0.12, 0.25, 0.0), lumps=(0.004, 16.0, 33)))
    beak = ms.revolve([(0.032, -0.045), (0.0, 0.045)], "beak", segments=12)
    beak.transform(v.rot_z(-math.pi / 2))
    beak.translate((0.21, 0.24, 0.0))
    m.merge(beak)
    for z in (0.062, -0.062):
        m.merge(_ball(0.016, "eye", at=(0.165, 0.27, z), segments=10, rings=8))
    # A fan, not a blob: three flattened feathers splayed back.
    for k, a in enumerate((-0.25, 0.0, 0.25)):
        f = _ball(0.06, "feather_wing", scale=(1.7, 0.28, 0.55), segments=14, rings=8)
        f.translate((-0.08, 0.0, 0.0))
        f.transform(v.rot_y(a))
        f.transform(v.rot_z(0.25))
        f.translate((-0.11, 0.15, 0.0))
        m.merge(f)
    return m


def bird_wing():
    """One wing, centred on its own node so the page can flap it."""
    return _ball(0.1, "feather_wing", scale=(1.1, 0.28, 0.6),
                 lumps=(0.004, 14.0, 35), segments=20, rings=12)


def squirrel():
    """Upright, with a pale belly, two ears and a great brush of a tail."""
    m = _ball(0.15, "squirrel", at=(0.0, 0.17, 0.0), scale=(1.0, 1.2, 1.0),
              lumps=(0.008, 10.0, 41))
    # Paint the belly where the body faces forward.
    faces = []
    for a, b, c, mat in m.faces:
        ctr = tuple((m.verts[a][k] + m.verts[b][k] + m.verts[c][k]) / 3.0
                    for k in range(3))
        faces.append((a, b, c, "squirrel_belly"
                      if ctr[0] > 0.09 and 0.06 < ctr[1] < 0.3 else mat))
    m.faces = faces
    m.merge(_ball(0.10, "squirrel", at=(0.10, 0.36, 0.0), lumps=(0.005, 14.0, 43)))
    for z in (0.035, -0.035):
        ear = ms.revolve([(0.035, 0.0), (0.0, 0.09)], "squirrel", segments=10)
        ear.translate((0.07, 0.42, z))
        m.merge(ear)
        m.merge(_ball(0.016, "eye", at=(0.17, 0.39, z * 1.6), segments=10, rings=8))
    m.merge(_ball(0.014, "eye", at=(0.2, 0.345, 0.0), segments=8, rings=6))
    tail = _ball(0.13, "squirrel_tail", scale=(0.55, 1.5, 0.8),
                 lumps=(0.03, 7.0, 47), segments=24, rings=18)
    tail.transform(v.rot_z(0.4))
    tail.translate((-0.2, 0.28, 0.0))
    m.merge(tail)
    return m


# ------------------------------------------------------------ assembly

PROPS = {
    "plant": plant, "lamp": lamp, "bowl": bowl, "ball": ball, "tree": tree,
    "flowers": flowers, "bin": bin_, "post": post,
    "kibble": kibble, "acorn": acorn, "bird": bird, "squirrel": squirrel,
}


def skeleton():
    """The node tree, in the shape gltf.build_gltf takes: a root, one node
    per prop at the origin, and the bird's wings under the bird."""
    sk = [("root", None, (0.0, 0.0, 0.0))]
    for name in PROPS:
        sk.append((name, "root", (0.0, 0.0, 0.0)))
    wx, wy, wz = BIRD_WING_AT
    sk.append(("bird_wing_l", "bird", (wx, wy, wz)))
    sk.append(("bird_wing_r", "bird", (wx, wy, -wz)))
    mod = types.SimpleNamespace()
    mod.SKELETON = sk
    mod.ORDER = [n for n, _, _ in sk]
    mod.PARENT = {n: p for n, p, _ in sk}
    mod.REST_T = {n: t for n, _, t in sk}
    return mod


def build_parts():
    parts = {name: fn() for name, fn in PROPS.items()}
    parts["bird_wing_l"] = bird_wing()
    parts["bird_wing_r"] = bird_wing()
    for part in parts.values():
        part.compute_tangents()
    # Creases, one prop at a time: they all stand at the origin, and baked
    # together each would shade the others.
    sk = skeleton()
    for name in PROPS:
        group = {name: parts[name]}
        if name == "bird":
            group["bird_wing_l"] = parts["bird_wing_l"]
            group["bird_wing_r"] = parts["bird_wing_r"]
        sub = types.SimpleNamespace(
            ORDER=[n for n in sk.ORDER if n == "root" or n in group],
            PARENT=sk.PARENT, REST_T=sk.REST_T)
        occlusion.bake(group, sub)
    return parts
