"""The other dog at the park: the one that steals the toy.

He was Ginger with the colour turned down -- her model darkened in three.js,
her sprite sheet washed grey in the canvas demo -- so the dog you were
chasing the toy from had her blaze, her rose ears, her whip tail and her
collar and tag. Up close he was her in a bad light.

He is his own dog now, and reads as the troublemaker at a glance: a
scruffy, wire-coated grey mutt with a black bandit mask across both eyes,
ears pricked up, a bushy tail carried high and a red neckerchief.

He shares Ginger's skeleton, her legs and her body -- only what is on top
of them changes -- so every one of her clips drives him unchanged, and his
sprite sheet comes out with exactly her layout. That is what lets the canvas
demo load his sheet where it used to tint hers, using her frame data.
"""

import math

from . import ginger as gn
from . import mesh as ms
from . import occlusion
from . import vmath as v

# His bones are hers; the rig module is what pose.py and gltf.py ask for.
SKELETON, ORDER, PARENT, REST_T = gn.SKELETON, gn.ORDER, gn.PARENT, gn.REST_T

MATERIALS = dict(gn.MATERIALS)
MATERIALS.update({
    # A wiry grey coat, darker along the back, a dull cream underneath.
    "coat":      {"color": "#77736c", "rough": 0.92, "fuzz": 0.75, "tex": "fur"},
    "coat_dark": {"color": "#4b4844", "rough": 0.92, "fuzz": 0.75, "tex": "fur"},
    "white":     {"color": "#cdc4b6", "rough": 0.90, "fuzz": 0.65, "tex": "fur"},
    # The bandit mask: nearly black, short and close.
    "mask":      {"color": "#1e1b1a", "rough": 0.85, "fuzz": 0.40, "tex": "shortcoat"},
    "bandana":   {"color": "#b8342c", "rough": 0.85, "fuzz": 0.30, "tex": "felt"},
    "bandana_dot": {"color": "#efe6d6", "rough": 0.85, "fuzz": 0.30, "tex": "felt"},
})


def _scruff(amp, freq, seed):
    """Wire coat: short, irregular lumps all over, so the outline is rough."""
    def fn(p, n):
        a = ms.value_noise3((p[0] * freq, p[1] * freq, p[2] * freq), seed)
        b = ms.value_noise3((p[0] * freq * 2.7, p[1] * freq * 2.7,
                             p[2] * freq * 2.7), seed + 5)
        return amp * (a + 0.6 * b)
    return fn


def head():
    """Her head shape, his markings: a black band across both eyes."""
    m = gn.head()

    def bandit(x, y, z):
        # A band across the face at eye height, from cheek to cheek, ragged
        # at the edges; the blaze below it stays cream.
        band = abs(y - 1.300) < 0.040 + gn.wobble(x, y, z, 0.010, 22, seed=61)
        return band and 0.745 < z < 0.905 and abs(x) > 0.018
    gn.paint(m, bandit, "mask")
    # His coat is grey above, so the skull top goes dark like a cap.
    gn.paint(m, lambda x, y, z: y > 1.405 + gn.wobble(x, y, z, 0.012, 18, seed=63)
             and z < 0.82, "coat_dark")
    m.displace(_scruff(0.006, 26.0, 65))
    return m


def ear(side):
    """Pricked: up off the skull and a little outward, dark at the tips."""
    path = [(0.0, -0.010, 0.0), (0.010 * side, 0.060, 0.004),
            (0.020 * side, 0.120, 0.000), (0.026 * side, 0.168, -0.012)]
    # Wide side to side, thin front to back: a flat triangular ear.
    radii = [(0.052, 0.020), (0.046, 0.017), (0.030, 0.012), (0.004, 0.003)]
    m = gn.tube(path, radii, "coat", segments=14)
    gn.paint(m, lambda x, y, z: y > 0.115, "coat_dark")
    return m


def tail(world):
    """A brush carried high and curling forward, white at the tip.

    Split at her tail joints, so her wag still swings it. A brush this
    thick, bending this hard, opened gaps where the pieces met -- the first
    build was a tail in chunks -- so each joint has a round knuckle on it,
    carried by the piece beyond, as her legs do.
    """
    a, b, c = world["tail_a"], world["tail_b"], world["tail_c"]
    path = [a, b, c, (0.0, 1.190, -0.985), (0.0, 1.280, -1.005),
            (0.0, 1.360, -0.965), (0.0, 1.410, -0.895)]
    radii = [(0.058, 0.062), (0.074, 0.078), (0.082, 0.086), (0.080, 0.084),
             (0.068, 0.071), (0.046, 0.048), (0.010, 0.010)]

    def piece(i0, i1, knuckle=None):
        m = gn.tube(path[i0:i1 + 1], radii[i0:i1 + 1], "coat", segments=16,
                    cap_start=False, cap_end=(i1 == len(path) - 1))
        if knuckle is not None:
            rx, ry = radii[knuckle]
            m.merge(gn.joint(path[knuckle], (rx, ry, rx), "coat"))
        gn.paint(m, lambda x, y, z: y > 1.37, "white")
        m.displace(_scruff(0.012, 20.0, 67 + i0))
        return m

    return {"a": piece(0, 1), "b": piece(1, 2, knuckle=1),
            "c": piece(2, 6, knuckle=2)}


def bandana():
    """A red neckerchief where her collar was: a band, and a point in front."""
    out = ms.Mesh()
    ring = [(math.cos(2 * math.pi * s / 28) * 0.160,
             math.sin(2 * math.pi * s / 28) * 0.168, 0.0) for s in range(28)]
    band = [[(x, y, z + t) for x, y, z in ring] for t in (-0.032, 0.032)]
    m = ms.loft(band, "bandana", cap_start=True, cap_end=True)
    m.transform(v.rot_x(v.deg(-28)))
    m.translate((0.0, 1.020, 0.500))
    out.merge(m)
    # The point: a flattened cone hanging down the chest, with a few dots.
    # Thick enough to read as cloth from the side, and laid back against the
    # chest rather than standing off it like a blade.
    flap = ms.revolve([(0.110, 0.0), (0.0, -0.160)], "bandana", segments=20)
    flap.scale((1.0, 1.0, 0.45))
    flap.transform(v.rot_x(v.deg(14)))
    flap.translate((0.0, 0.915, 0.585))
    dots = [(0.0, 0.862, 0.640), (-0.040, 0.892, 0.628), (0.040, 0.892, 0.628)]
    out.merge(flap)
    for p in dots:
        out.merge(ms.sphere(0.011, "bandana_dot", segments=8, rings=6)
                  .translate(p))
    return out


def build_parts(fuzz=True):
    """One mesh per joint, in that joint's local space, as gn.build_parts."""
    world = {}
    for name in ORDER:
        parent = PARENT[name]
        t = v.translation(REST_T[name])
        world[name] = t if parent is None else v.mat_mul(world[parent], t)
    pos = {name: v.transform_point(world[name], (0.0, 0.0, 0.0)) for name in ORDER}

    def localize(mesh, joint):
        return mesh.transform(v.translation(v.mul(pos[joint], -1.0)))

    body = gn.body()
    body.displace(_scruff(0.008, 18.0, 71))
    neck = gn.neck()
    neck.displace(_scruff(0.007, 20.0, 73))
    tl = tail(pos)
    fl, fr = gn.foreleg(1.0), gn.foreleg(-1.0)
    hl, hr = gn.hindleg(1.0), gn.hindleg(-1.0)

    parts = {
        "hips": localize(body, "hips"),
        "neck": localize(neck, "neck"),
        "head": localize(head(), "head"),
        "ear_l": ear(1.0),
        "ear_r": ear(-1.0),
        "chest": localize(bandana(), "chest"),
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
    occlusion.bake(parts, gn)
    return parts
