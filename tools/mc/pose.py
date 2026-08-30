"""Posing: turn joint angles into world matrices and a baked mesh."""

from . import mesh as ms
from . import rig
from . import vmath as v


class Pose(dict):
    """node name -> (rx, ry, rz) in radians. Missing joints are at rest."""

    def __init__(self, *args, **kw):
        super().__init__(*args, **kw)
        self.root_offset = (0.0, 0.0, 0.0)
        self.scales = {}                  # node -> (sx, sy, sz), for squash

    def copy(self):
        out = Pose(self)
        out.root_offset = self.root_offset
        out.scales = dict(self.scales)
        return out

    def offset(self, node, delta):
        """Add a rotation (radians) on top of whatever this joint already has."""
        base = self.get(node, (0.0, 0.0, 0.0))
        self[node] = tuple(a + b for a, b in zip(base, delta))
        return self

    def blended(self, other, t):
        out = Pose()
        for k in set(self) | set(other):
            a = self.get(k, (0.0, 0.0, 0.0))
            b = other.get(k, (0.0, 0.0, 0.0))
            out[k] = tuple(x + (y - x) * t for x, y in zip(a, b))
        out.root_offset = tuple(
            x + (y - x) * t for x, y in zip(self.root_offset, other.root_offset)
        )
        for k in set(self.scales) | set(other.scales):
            a = self.scales.get(k, (1.0, 1.0, 1.0))
            b = other.scales.get(k, (1.0, 1.0, 1.0))
            out.scales[k] = tuple(x + (y - x) * t for x, y in zip(a, b))
        return out


def local_matrices(pose, skel=None):
    """`skel` is any module exposing ORDER / PARENT / REST_T; defaults to
    Mr. Cluckers' rig, but Ginger has her own."""
    skel = skel or rig
    out = {}
    for name in skel.ORDER:
        t = skel.REST_T[name]
        if name == "root":
            t = v.add(t, getattr(pose, "root_offset", (0.0, 0.0, 0.0)))
        rx, ry, rz = pose.get(name, (0.0, 0.0, 0.0))
        m = v.mat_mul(v.translation(t), v.euler_xyz(rx, ry, rz))
        s = getattr(pose, "scales", {}).get(name)
        if s:
            m = v.mat_mul(m, v.scaling(s))
        out[name] = m
    return out


def world_matrices(pose, base=None, skel=None):
    skel = skel or rig
    local = local_matrices(pose, skel)
    out = {}
    for name in skel.ORDER:
        parent = skel.PARENT[name]
        m = local[name]
        if parent is None:
            out[name] = v.mat_mul(base, m) if base else m
        else:
            out[name] = v.mat_mul(out[parent], m)
    return out


def bake(parts, pose=None, base=None, skel=None):
    """Flatten the posed rig into one world-space mesh."""
    pose = pose if pose is not None else Pose()
    world = world_matrices(pose, base, skel)
    out = ms.Mesh()
    for name, part in parts.items():
        c = part.copy()
        c.transform(world[name])
        out.merge(c)
    return out


def fit_base(parts, target_height=1.0, skel=None):
    """Uniform scale + offset putting feet on y=0, centred on x, unit tall."""
    rest = bake(parts, skel=skel)
    lo, hi = rest.bounds()
    # Height ignores the outstretched wings; use the vertical extent.
    s = target_height / (hi[1] - lo[1])
    return v.mat_mul(v.scaling(s), v.translation((0.0, -lo[1], 0.0)))
