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
        self.uvs = []            # parallel to verts, in world-ish units
        self.tans = []           # parallel to verts, (x, y, z, handedness)
        self.faces = []          # list[(ia, ib, ic, material)]

    # ------------------------------------------------------------- basics
    def add_vert(self, p, n=(0.0, 1.0, 0.0), uv=(0.0, 0.0)):
        self.verts.append(p)
        self.norms.append(n)
        self.uvs.append(uv)
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
        self.uvs.extend(other.uvs)
        self.tans.extend(other.tans)
        for a, b, c, m in other.faces:
            self.faces.append((a + off, b + off, c + off, m))
        return self

    def copy(self):
        m = Mesh()
        m.verts = list(self.verts)
        m.norms = list(self.norms)
        m.uvs = list(self.uvs)
        m.tans = list(self.tans)
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
        self.tans = [v.normalize(v.transform_dir(m, t[:3])) + (t[3],)
                     for t in self.tans]
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
        self.tans = [
            v.normalize((t[0] * s[0], t[1] * s[1], t[2] * s[2])) + (t[3],)
            for t in self.tans
        ]
        return self

    def mirror_x(self):
        """Mirror across the YZ plane, flipping winding so faces stay outward."""
        self.verts = [(-p[0], p[1], p[2]) for p in self.verts]
        self.norms = [(-n[0], n[1], n[2]) for n in self.norms]
        # Mirroring reverses handedness, so the bitangent has to flip with it.
        self.tans = [(-t[0], t[1], t[2], -t[3]) for t in self.tans]
        self.faces = [(a, c, b, m) for a, b, c, m in self.faces]
        return self

    def flip(self):
        """Reverse triangle winding (and normals)."""
        self.faces = [(a, c, b, m) for a, b, c, m in self.faces]
        self.norms = [(-n[0], -n[1], -n[2]) for n in self.norms]
        self.tans = [(t[0], t[1], t[2], -t[3]) for t in self.tans]
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
        verts, norms, uvs, faces = [], [], [], []
        for f in self.faces:
            n = self.face_normal(f)
            base = len(verts)
            for i in f[:3]:
                verts.append(self.verts[i])
                norms.append(n)
                uvs.append(self.uvs[i])
            faces.append((base, base + 1, base + 2, f[3]))
        self.verts, self.norms, self.uvs, self.faces = verts, norms, uvs, faces
        self.tans = []
        return self

    def compute_tangents(self):
        """Per-vertex tangents from the UVs, for normal mapping.

        Standard accumulate-then-orthonormalize: sum each triangle's tangent
        onto its corners, then Gram-Schmidt against the vertex normal. The
        fourth component is handedness, which is what glTF and three.js want.
        """
        acc = [(0.0, 0.0, 0.0)] * len(self.verts)
        bacc = [(0.0, 0.0, 0.0)] * len(self.verts)
        for a, b, c, _ in self.faces:
            p0, p1, p2 = self.verts[a], self.verts[b], self.verts[c]
            u0, u1, u2 = self.uvs[a], self.uvs[b], self.uvs[c]
            e1, e2 = v.sub(p1, p0), v.sub(p2, p0)
            du1, dv1 = u1[0] - u0[0], u1[1] - u0[1]
            du2, dv2 = u2[0] - u0[0], u2[1] - u0[1]
            det = du1 * dv2 - du2 * dv1
            if abs(det) < 1e-12:
                continue
            r = 1.0 / det
            t = v.mul(v.sub(v.mul(e1, dv2), v.mul(e2, dv1)), r)
            bt = v.mul(v.sub(v.mul(e2, du1), v.mul(e1, du2)), r)
            for i in (a, b, c):
                acc[i] = v.add(acc[i], t)
                bacc[i] = v.add(bacc[i], bt)

        self.tans = []
        for i, n in enumerate(self.norms):
            t = acc[i]
            if v.dot(t, t) < 1e-16:
                # Degenerate UVs: any vector perpendicular to the normal works.
                t = v.cross(n, (0.0, 0.0, 1.0))
                if v.dot(t, t) < 1e-12:
                    t = v.cross(n, (0.0, 1.0, 0.0))
            t = v.normalize(v.sub(t, v.mul(n, v.dot(n, t))))
            w = -1.0 if v.dot(v.cross(n, t), bacc[i]) < 0.0 else 1.0
            self.tans.append((t[0], t[1], t[2], w))
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
    0 collapse to a pole. UVs are laid out in world units -- u runs around the
    circumference, v along the profile -- so one global repeat factor gives
    every part the same texel density. The ring is closed with a duplicated
    seam column so u can reach full circumference instead of wrapping to 0.
    """
    m = Mesh()
    r_ref = max(r for r, _ in profile) or 1.0
    circumference = 2.0 * math.pi * r_ref

    # v is arc length along the profile polyline.
    vs, run = [0.0], 0.0
    for (r0, y0), (r1, y1) in zip(profile, profile[1:]):
        run += math.hypot(r1 - r0, y1 - y0)
        vs.append(run)

    rings, is_pole = [], []
    for (r, y), vv in zip(profile, vs):
        pole = r <= 1e-9
        is_pole.append(pole)
        ring = []
        for sgm in range(segments + 1):
            a = 2.0 * math.pi * sgm / segments
            u = circumference * sgm / segments
            pt = (0.0, y, 0.0) if pole else (r * math.cos(a), y, r * math.sin(a))
            ring.append(m.add_vert(pt, uv=(u, vv)))
        rings.append(ring)

    for j in range(len(rings) - 1):
        lo, hi = rings[j], rings[j + 1]
        if is_pole[j] and is_pole[j + 1]:
            continue
        for sgm in range(segments):
            if is_pole[j]:
                m.add_face(lo[sgm], hi[sgm], hi[sgm + 1], material)
            elif is_pole[j + 1]:
                m.add_face(lo[sgm], lo[sgm + 1], hi[sgm], material)
            else:
                m.add_quad(lo[sgm], lo[sgm + 1], hi[sgm + 1], hi[sgm], material)

    if close_bottom and not is_pole[0]:
        _disk(m, rings[0], (0.0, profile[0][1], 0.0), segments, material, False)
    if close_top and not is_pole[-1]:
        _disk(m, rings[-1], (0.0, profile[-1][1], 0.0), segments, material, True)

    # Rings run bottom-to-top, which winds the quads inward; face them out.
    return m.flip().smooth_normals()


def _disk(m, ring, centre, segments, material, upward):
    """Flat cap across an open ring, planar-mapped in world units.

    The rim is duplicated rather than reused: these vertices need planar UVs,
    and the wall vertices at the same positions need cylindrical ones.
    """
    c = m.add_vert(centre, uv=(centre[0], centre[2]))
    rim = [m.add_vert(m.verts[i], uv=(m.verts[i][0], m.verts[i][2]))
           for i in ring[:segments + 1]]
    for i in range(segments):
        a, b = rim[i], rim[i + 1]
        if upward:
            m.add_face(c, a, b, material)
        else:
            m.add_face(c, b, a, material)


def sphere(radius, material, segments=24, rings=16):
    profile = []
    for i in range(rings + 1):
        t = math.pi * i / rings
        profile.append((radius * math.sin(t), -radius * math.cos(t)))
    return revolve(profile, material, segments)


def loft(sections, material, cap_start=True, cap_end=True, closed_rings=True):
    """Skin a sequence of equally-sized point rings into a tube.

    u follows the perimeter of the first ring and v the run between ring
    centres, both in world units. Closed rings get a duplicated seam column.
    """
    m = Mesh()
    n = len(sections[0])

    # u from ring 0's spacing, reused down the tube so the texture doesn't shear.
    us, run = [0.0], 0.0
    for i in range(n):
        a = sections[0][i]
        b = sections[0][(i + 1) % n]
        run += v.length(v.sub(b, a))
        us.append(run)

    centres = [_centroid(r) for r in sections]
    vs, run = [0.0], 0.0
    for a, b in zip(centres, centres[1:]):
        run += v.length(v.sub(b, a))
        vs.append(run)

    span = n if closed_rings else n - 1
    cols = span + 1
    idx = []
    for ring, vv in zip(sections, vs):
        row = [m.add_vert(ring[i % n], uv=(us[i], vv)) for i in range(cols)]
        idx.append(row)

    for lo, hi in zip(idx, idx[1:]):
        for sgm in range(span):
            m.add_quad(lo[sgm], lo[sgm + 1], hi[sgm + 1], hi[sgm], material)

    if cap_start:
        _loft_cap(m, idx[0], centres[0], span, material, reverse=True)
    if cap_end:
        _loft_cap(m, idx[-1], centres[-1], span, material, reverse=False)
    return m.smooth_normals()


def _loft_cap(m, row, centre, span, material, reverse):
    c = m.add_vert(centre, uv=(centre[0], centre[2]))
    for i in range(span):
        a, b = row[i], row[i + 1]
        if reverse:
            m.add_face(c, b, a, material)
        else:
            m.add_face(c, a, b, material)


def extrude(poly, thickness, material, z0=None):
    """Extrude a 2D polygon (XY, counter-clockwise) along Z into a prism."""
    z0 = -thickness * 0.5 if z0 is None else z0
    z1 = z0 + thickness
    m = Mesh()
    n = len(poly)

    us, run = [0.0], 0.0
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        run += math.hypot(bx - ax, by - ay)
        us.append(run)

    back, front = [], []
    for i in range(n + 1):
        x, y = poly[i % n]
        back.append(m.add_vert((x, y, z0), uv=(us[i], 0.0)))
        front.append(m.add_vert((x, y, z1), uv=(us[i], thickness)))
    for i in range(n):
        m.add_quad(back[i], back[i + 1], front[i + 1], front[i], material)

    cx, cy = _avg(p[0] for p in poly), _avg(p[1] for p in poly)
    for z, flip_face in ((z0, True), (z1, False)):
        c = m.add_vert((cx, cy, z), uv=(cx, cy))
        rim = [m.add_vert((x, y, z), uv=(x, y)) for x, y in poly]
        for i in range(n):
            a, b = rim[i], rim[(i + 1) % n]
            if flip_face:
                m.add_face(c, b, a, material)
            else:
                m.add_face(c, a, b, material)
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
