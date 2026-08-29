"""Triangle meshes and the handful of primitives the character is built from.

A Mesh keeps parallel vertex/normal lists and faces tagged with a material
name, so several parts can be merged and still export as separate glTF
primitives / OBJ groups.
"""

import math

from . import vmath as v


class Mesh:
    def __init__(self):
        self.verts = []          # list[(x, y, z)]
        self.norms = []          # parallel to verts
        self.faces = []          # list[(ia, ib, ic, material)]

    # ------------------------------------------------------------- basics
    def add_vert(self, p, n=(0.0, 1.0, 0.0)):
        self.verts.append(p)
        self.norms.append(n)
        return len(self.verts) - 1

    def add_face(self, a, b, c, material):
        self.faces.append((a, b, c, material))

    def add_quad(self, a, b, c, d, material):
        self.faces.append((a, b, c, material))
        self.faces.append((a, c, d, material))

    def merge(self, other):
        off = len(self.verts)
        self.verts.extend(other.verts)
        self.norms.extend(other.norms)
        for a, b, c, m in other.faces:
            self.faces.append((a + off, b + off, c + off, m))
        return self

    def copy(self):
        m = Mesh()
        m.verts = list(self.verts)
        m.norms = list(self.norms)
        m.faces = list(self.faces)
        return m

    def materials(self):
        seen = []
        for f in self.faces:
            if f[3] not in seen:
                seen.append(f[3])
        return seen

    def bounds(self):
        xs = [p[0] for p in self.verts]
        ys = [p[1] for p in self.verts]
        zs = [p[2] for p in self.verts]
        return (min(xs), min(ys), min(zs)), (max(xs), max(ys), max(zs))

    # --------------------------------------------------------- transforms
    def transform(self, m):
        self.verts = [v.transform_point(m, p) for p in self.verts]
        self.norms = [v.normalize(v.transform_dir(m, n)) for n in self.norms]
        return self

    def translate(self, t):
        return self.transform(v.translation(t))

    def scale(self, s):
        if isinstance(s, (int, float)):
            s = (s, s, s)
        self.verts = [(p[0] * s[0], p[1] * s[1], p[2] * s[2]) for p in self.verts]
        # Non-uniform scale needs the inverse-transpose for normals.
        inv = (1.0 / s[0], 1.0 / s[1], 1.0 / s[2])
        self.norms = [
            v.normalize((n[0] * inv[0], n[1] * inv[1], n[2] * inv[2]))
            for n in self.norms
        ]
        return self

    def mirror_x(self):
        """Mirror across the YZ plane, flipping winding so faces stay outward."""
        self.verts = [(-p[0], p[1], p[2]) for p in self.verts]
        self.norms = [(-n[0], n[1], n[2]) for n in self.norms]
        self.faces = [(a, c, b, m) for a, b, c, m in self.faces]
        return self

    def flip(self):
        """Reverse triangle winding (and normals)."""
        self.faces = [(a, c, b, m) for a, b, c, m in self.faces]
        self.norms = [(-n[0], -n[1], -n[2]) for n in self.norms]
        return self

    def set_material(self, material):
        self.faces = [(a, b, c, material) for a, b, c, _ in self.faces]
        return self

    # ------------------------------------------------------------ normals
    def face_normal(self, f):
        a, b, c = self.verts[f[0]], self.verts[f[1]], self.verts[f[2]]
        return v.normalize(v.cross(v.sub(b, a), v.sub(c, a)))

    def smooth_normals(self, eps=1e-4):
        """Area-weighted normals averaged over welded positions."""
        acc = {}
        key = lambda p: (round(p[0] / eps), round(p[1] / eps), round(p[2] / eps))
        for f in self.faces:
            a, b, c = self.verts[f[0]], self.verts[f[1]], self.verts[f[2]]
            # Un-normalized cross product weights by triangle area.
            n = v.cross(v.sub(b, a), v.sub(c, a))
            for i in f[:3]:
                k = key(self.verts[i])
                acc[k] = v.add(acc.get(k, (0.0, 0.0, 0.0)), n)
        self.norms = [
            v.normalize(acc.get(key(p), (0.0, 1.0, 0.0))) or (0.0, 1.0, 0.0)
            for p in self.verts
        ]
        return self

    def flat_normals(self):
        """Split every triangle so each gets its own hard-edged normal."""
        verts, norms, faces = [], [], []
        for f in self.faces:
            n = self.face_normal(f)
            base = len(verts)
            for i in f[:3]:
                verts.append(self.verts[i])
                norms.append(n)
            faces.append((base, base + 1, base + 2, f[3]))
        self.verts, self.norms, self.faces = verts, norms, faces
        return self

    def displace(self, fn):
        """Push each vertex along its normal by fn(position, normal)."""
        self.verts = [
            v.add(p, v.mul(n, fn(p, n))) for p, n in zip(self.verts, self.norms)
        ]
        return self.smooth_normals()


# ------------------------------------------------------------- primitives


def revolve(profile, material, segments=24, close_bottom=True, close_top=True):
    """Surface of revolution around the Y axis.

    `profile` is a bottom-to-top list of (radius, y) pairs. Rings with radius
    0 collapse to a pole; open ends are capped with a flat fan when asked.
    """
    m = Mesh()
    rings = []
    for r, y in profile:
        if r <= 1e-9:
            rings.append([m.add_vert((0.0, y, 0.0))])
        else:
            ring = []
            for s in range(segments):
                a = 2.0 * math.pi * s / segments
                ring.append(m.add_vert((r * math.cos(a), y, r * math.sin(a))))
            rings.append(ring)

    for lo, hi in zip(rings, rings[1:]):
        if len(lo) == 1 and len(hi) == 1:
            continue
        if len(lo) == 1:                       # bottom pole fan
            for s in range(segments):
                m.add_face(lo[0], hi[s], hi[(s + 1) % segments], material)
        elif len(hi) == 1:                     # top pole fan
            for s in range(segments):
                m.add_face(lo[s], lo[(s + 1) % segments], hi[0], material)
        else:
            for s in range(segments):
                t = (s + 1) % segments
                m.add_quad(lo[s], lo[t], hi[t], hi[s], material)

    if close_bottom and len(rings[0]) > 1:
        c = m.add_vert((0.0, profile[0][1], 0.0))
        for s in range(segments):
            m.add_face(c, rings[0][(s + 1) % segments], rings[0][s], material)
    if close_top and len(rings[-1]) > 1:
        c = m.add_vert((0.0, profile[-1][1], 0.0))
        for s in range(segments):
            m.add_face(c, rings[-1][s], rings[-1][(s + 1) % segments], material)
    # Rings run bottom-to-top, which winds the quads inward; face them out.
    return m.flip().smooth_normals()


def sphere(radius, material, segments=24, rings=16):
    profile = []
    for i in range(rings + 1):
        t = math.pi * i / rings
        profile.append((radius * math.sin(t), -radius * math.cos(t)))
    return revolve(profile, material, segments)


def loft(sections, material, cap_start=True, cap_end=True, closed_rings=True):
    """Skin a sequence of equally-sized point rings into a tube."""
    m = Mesh()
    idx = [[m.add_vert(p) for p in ring] for ring in sections]
    n = len(sections[0])
    span = n if closed_rings else n - 1
    for lo, hi in zip(idx, idx[1:]):
        for s in range(span):
            t = (s + 1) % n
            m.add_quad(lo[s], lo[t], hi[t], hi[s], material)
    if cap_start:
        c = m.add_vert(_centroid([m.verts[i] for i in idx[0]]))
        for s in range(span):
            m.add_face(c, idx[0][(s + 1) % n], idx[0][s], material)
    if cap_end:
        c = m.add_vert(_centroid([m.verts[i] for i in idx[-1]]))
        for s in range(span):
            m.add_face(c, idx[-1][s], idx[-1][(s + 1) % n], material)
    return m.smooth_normals()


def extrude(poly, thickness, material, z0=None):
    """Extrude a 2D polygon (XY, counter-clockwise) along Z into a prism."""
    z0 = -thickness * 0.5 if z0 is None else z0
    z1 = z0 + thickness
    m = Mesh()
    back = [m.add_vert((x, y, z0)) for x, y in poly]
    front = [m.add_vert((x, y, z1)) for x, y in poly]
    n = len(poly)
    for s in range(n):
        t = (s + 1) % n
        m.add_quad(back[s], back[t], front[t], front[s], material)
    cb = m.add_vert((_avg(p[0] for p in poly), _avg(p[1] for p in poly), z0))
    cf = m.add_vert((_avg(p[0] for p in poly), _avg(p[1] for p in poly), z1))
    for s in range(n):
        t = (s + 1) % n
        m.add_face(cb, back[t], back[s], material)
        m.add_face(cf, front[s], front[t], material)
    return m.flat_normals()


def box(sx, sy, sz, material):
    hx, hy, hz = sx * 0.5, sy * 0.5, sz * 0.5
    poly = [(-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)]
    return extrude(poly, sz, material, z0=-hz)


def ring_points(rx, rz, y, segments, squash_bottom=1.0):
    """A closed elliptical ring in the XZ plane at height y."""
    pts = []
    for s in range(segments):
        a = 2.0 * math.pi * s / segments
        x, z = rx * math.cos(a), rz * math.sin(a)
        pts.append((x, y, z))
    if squash_bottom != 1.0:
        pts = [(x, yy, z * (squash_bottom if z < 0 else 1.0)) for x, yy, z in pts]
    return pts


def _centroid(points):
    n = float(len(points))
    return (
        sum(p[0] for p in points) / n,
        sum(p[1] for p in points) / n,
        sum(p[2] for p in points) / n,
    )


def _avg(it):
    vals = list(it)
    return sum(vals) / float(len(vals))


# ------------------------------------------------------------------ noise


def value_noise3(p, seed=0):
    """Cheap deterministic value noise in [-1, 1]; used for plush lumpiness."""
    x, y, z = p

    def h(i, j, k):
        n = i * 374761393 + j * 668265263 + k * 2147483647 + seed * 15731
        n = (n ^ (n >> 13)) & 0xFFFFFFFF
        n = (n * 1274126177) & 0xFFFFFFFF
        return ((n ^ (n >> 16)) & 0xFFFF) / 32767.5 - 1.0

    i, j, k = math.floor(x), math.floor(y), math.floor(z)
    fx, fy, fz = x - i, y - j, z - k
    sx = fx * fx * (3 - 2 * fx)
    sy = fy * fy * (3 - 2 * fy)
    sz = fz * fz * (3 - 2 * fz)
    c = [[[h(i + a, j + b, k + c2) for c2 in (0, 1)] for b in (0, 1)] for a in (0, 1)]
    x00 = c[0][0][0] + (c[1][0][0] - c[0][0][0]) * sx
    x10 = c[0][1][0] + (c[1][1][0] - c[0][1][0]) * sx
    x01 = c[0][0][1] + (c[1][0][1] - c[0][0][1]) * sx
    x11 = c[0][1][1] + (c[1][1][1] - c[0][1][1]) * sx
    y0 = x00 + (x10 - x00) * sy
    y1 = x01 + (x11 - x01) * sy
    return y0 + (y1 - y0) * sz
