"""Orthographic software rasterizer: z-buffered, supersampled, RGBA out.

Deferred shading -- pass one fills a depth/triangle/barycentric buffer, pass
two shades only the pixels that survived, which keeps pure-Python cost down.
"""

import math
from array import array

from . import texture as _texture
from . import vmath as v

BACKGROUND = (0, 0, 0, 0)


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


class Camera:
    """Orthographic camera described by yaw/pitch around a target point."""

    def __init__(self, yaw=0.0, pitch=0.0, target=(0.0, 0.5, 0.0), height=1.35):
        self.yaw, self.pitch, self.target, self.height = yaw, pitch, target, height

    def view_matrix(self):
        m = v.mat_mul(v.rot_x(-self.pitch), v.rot_y(-self.yaw))
        return v.mat_mul(m, v.translation(v.mul(self.target, -1.0)))


class Light:
    def __init__(self, direction=(-0.45, 0.72, 0.52), color=(1.0, 0.98, 0.94),
                 ambient=(0.34, 0.36, 0.40), fill=(0.30, 0.10, -0.55),
                 fill_color=(0.16, 0.18, 0.24)):
        self.direction = v.normalize(direction)
        self.color = color
        self.ambient = ambient
        self.fill = v.normalize(fill)
        self.fill_color = fill_color


def render(mesh, materials, width, height, camera, light=None, supersample=3,
           outline=0.0, outline_color=(0.10, 0.09, 0.11), textures=None):
    """Render `mesh` to an RGBA bytearray of width*height pixels.

    Passing `textures` (the dict from texture.build) samples the same fabric
    maps the 3D model uses, so the sprites and the glTF stay in agreement.
    """
    light = light or Light()
    W, H = width * supersample, height * supersample

    view = camera.view_matrix()
    # Orthographic: world units -> pixels, Y flipped for image space.
    scale = H / camera.height
    cx, cy = W * 0.5, H * 0.5

    verts = mesh.verts
    norms = mesh.norms
    n_v = len(verts)
    sx = array("f", [0.0]) * 0
    sx = array("f", [0.0] * n_v)
    sy = array("f", [0.0] * n_v)
    sz = array("f", [0.0] * n_v)
    nx = array("f", [0.0] * n_v)
    ny = array("f", [0.0] * n_v)
    nz = array("f", [0.0] * n_v)
    use_tex = bool(textures) and bool(mesh.uvs) and bool(mesh.tans)
    tu = array("f", [0.0] * n_v)
    tv = array("f", [0.0] * n_v)
    tx = array("f", [0.0] * n_v)
    ty = array("f", [0.0] * n_v)
    tz = array("f", [0.0] * n_v)
    tw = array("f", [1.0] * n_v)

    m00, m01, m02, m03 = view[0]
    m10, m11, m12, m13 = view[1]
    m20, m21, m22, m23 = view[2]
    for i in range(n_v):
        px, py, pz = verts[i]
        vx = m00 * px + m01 * py + m02 * pz + m03
        vy = m10 * px + m11 * py + m12 * pz + m13
        vz = m20 * px + m21 * py + m22 * pz + m23
        sx[i] = cx + vx * scale
        sy[i] = cy - vy * scale
        sz[i] = vz
        a, b, c = norms[i]
        nx[i] = m00 * a + m01 * b + m02 * c
        ny[i] = m10 * a + m11 * b + m12 * c
        nz[i] = m20 * a + m21 * b + m22 * c
        if use_tex:
            uu, vv = mesh.uvs[i]
            tu[i] = uu * _texture.REPEAT
            tv[i] = vv * _texture.REPEAT
            a, b, c, w = mesh.tans[i]
            tx[i] = m00 * a + m01 * b + m02 * c
            ty[i] = m10 * a + m11 * b + m12 * c
            tz[i] = m20 * a + m21 * b + m22 * c
            tw[i] = w

    size = W * H
    depth = array("f", [-1e30]) * 0
    depth = array("f", [-1e30] * size)
    tri_id = array("i", [-1] * size)
    bw0 = array("f", [0.0] * size)
    bw1 = array("f", [0.0] * size)

    faces = mesh.faces
    # ------------------------------------------------------- pass 1: depth
    for fi in range(len(faces)):
        ia, ib, ic, _ = faces[fi]
        ax, ay = sx[ia], sy[ia]
        bx, by = sx[ib], sy[ib]
        cxx, cyy = sx[ic], sy[ic]
        # Screen Y points down, so front-facing triangles have negative area.
        area = (bx - ax) * (cyy - ay) - (by - ay) * (cxx - ax)
        if area >= -1e-9:                      # back-face / degenerate
            continue
        x0 = int(min(ax, bx, cxx))
        x1 = int(math.ceil(max(ax, bx, cxx)))
        y0 = int(min(ay, by, cyy))
        y1 = int(math.ceil(max(ay, by, cyy)))
        if x1 < 0 or y1 < 0 or x0 >= W or y0 >= H:
            continue
        x0 = 0 if x0 < 0 else x0
        y0 = 0 if y0 < 0 else y0
        x1 = W - 1 if x1 >= W else x1
        y1 = H - 1 if y1 >= H else y1
        az, bz, cz = sz[ia], sz[ib], sz[ic]
        inv = 1.0 / area
        for y in range(y0, y1 + 1):
            py = y + 0.5
            row = y * W
            e0r = (bx - ax) * (py - ay) - (by - ay) * (x0 + 0.5 - ax)
            for x in range(x0, x1 + 1):
                px = x + 0.5
                w0 = ((cxx - bx) * (py - by) - (cyy - by) * (px - bx)) * inv
                if w0 < 0.0:
                    continue
                w1 = ((ax - cxx) * (py - cyy) - (ay - cyy) * (px - cxx)) * inv
                if w1 < 0.0:
                    continue
                w2 = 1.0 - w0 - w1
                if w2 < 0.0:
                    continue
                z = az * w0 + bz * w1 + cz * w2
                p = row + x
                if z > depth[p]:
                    depth[p] = z
                    tri_id[p] = fi
                    bw0[p] = w0
                    bw1[p] = w1

    # ------------------------------------------------------- pass 2: shade
    mat_cache = {}
    for name, spec in materials.items():
        r, g, b = hex_to_rgb(spec["color"])
        fam = spec.get("tex") if use_tex else None
        tex = textures.get(fam) if fam else None
        mat_cache[name] = (r, g, b, spec.get("fuzz", 0.0), spec.get("rough", 0.9),
                           tex)

    lx, ly, lz = v.transform_dir(view, light.direction)
    fx, fy, fz = v.transform_dir(view, light.fill)
    lr, lg, lb = light.color
    ar, ag, ab = light.ambient
    fr, fg, fb = light.fill_color

    buf = bytearray(size * 4)
    for p in range(size):
        fi = tri_id[p]
        if fi < 0:
            continue
        ia, ib, ic, mat = faces[fi]
        w0 = bw0[p]
        w1 = bw1[p]
        w2 = 1.0 - w0 - w1
        vnx = nx[ia] * w0 + nx[ib] * w1 + nx[ic] * w2
        vny = ny[ia] * w0 + ny[ib] * w1 + ny[ic] * w2
        vnz = nz[ia] * w0 + nz[ib] * w1 + nz[ic] * w2
        ln = math.sqrt(vnx * vnx + vny * vny + vnz * vnz) or 1.0
        vnx /= ln
        vny /= ln
        vnz /= ln

        cr, cg, cb, fuzz, rough, tex = mat_cache[mat]

        if tex is not None:
            ts = tex["size"]
            iu = int((w0 * tu[ia] + w1 * tu[ib] + w2 * tu[ic]) * ts) % ts
            iv = int((w0 * tv[ia] + w1 * tv[ib] + w2 * tv[ic]) * ts) % ts
            texel = iv * ts + iu
            detail = tex["gray"][texel] * (1.0 / 255.0)
            cr *= detail
            cg *= detail
            cb *= detail
            # Perturb the shading normal through the interpolated tangent frame.
            k = texel * 3
            nmx = tex["normal"][k] * (2.0 / 255.0) - 1.0
            nmy = tex["normal"][k + 1] * (2.0 / 255.0) - 1.0
            nmz = tex["normal"][k + 2] * (2.0 / 255.0) - 1.0
            ttx = w0 * tx[ia] + w1 * tx[ib] + w2 * tx[ic]
            tty = w0 * ty[ia] + w1 * ty[ib] + w2 * ty[ic]
            ttz = w0 * tz[ia] + w1 * tz[ib] + w2 * tz[ic]
            # Gram-Schmidt against the interpolated normal.
            d = ttx * vnx + tty * vny + ttz * vnz
            ttx -= vnx * d
            tty -= vny * d
            ttz -= vnz * d
            tl = math.sqrt(ttx * ttx + tty * tty + ttz * ttz)
            if tl > 1e-9:
                ttx /= tl
                tty /= tl
                ttz /= tl
                hw = tw[ia]
                btx = (vny * ttz - vnz * tty) * hw
                bty = (vnz * ttx - vnx * ttz) * hw
                btz = (vnx * tty - vny * ttx) * hw
                px2 = ttx * nmx + btx * nmy + vnx * nmz
                py2 = tty * nmx + bty * nmy + vny * nmz
                pz2 = ttz * nmx + btz * nmy + vnz * nmz
                pl = math.sqrt(px2 * px2 + py2 * py2 + pz2 * pz2) or 1.0
                vnx, vny, vnz = px2 / pl, py2 / pl, pz2 / pl

        ndl = vnx * lx + vny * ly + vnz * lz
        # Wrapped diffuse: soft terminator, the way light behaves on fur.
        diff = (ndl + 0.45) / 1.45
        if diff < 0.0:
            diff = 0.0
        ndf = vnx * fx + vny * fy + vnz * fz
        fillv = ndf if ndf > 0.0 else 0.0

        # Grazing angles catch the light -> fuzzy rim, strongest on plush.
        rim = 1.0 - (vnz if vnz > 0.0 else 0.0)
        rim = rim * rim * rim * (0.55 + 0.85 * fuzz)

        spec = 0.0
        if fuzz < 0.3 and ndl > 0.0:
            h = (lx, ly, lz + 1.0)
            hl = math.sqrt(h[0] * h[0] + h[1] * h[1] + h[2] * h[2]) or 1.0
            nh = (vnx * h[0] + vny * h[1] + vnz * h[2]) / hl
            if nh > 0.0:
                spec = (nh ** (12.0 / max(rough, 0.12))) * (1.0 - rough) * 0.9

        r = cr * (ar + lr * diff + fr * fillv) + rim * cr * 0.30 + spec
        g = cg * (ag + lg * diff + fg * fillv) + rim * cg * 0.30 + spec
        b = cb * (ab + lb * diff + fb * fillv) + rim * cb * 0.32 + spec

        q = p * 4
        buf[q] = 255 if r >= 1.0 else int(r * 255.0 + 0.5) if r > 0 else 0
        buf[q + 1] = 255 if g >= 1.0 else int(g * 255.0 + 0.5) if g > 0 else 0
        buf[q + 2] = 255 if b >= 1.0 else int(b * 255.0 + 0.5) if b > 0 else 0
        buf[q + 3] = 255

    if outline > 0.0:
        buf = _outline(buf, W, H, tri_id, depth, outline, outline_color,
                       depth_step=camera.height * 0.028)

    return _downsample(buf, W, H, supersample)


def _outline(buf, W, H, tri_id, depth, strength, color, depth_step=0.03):
    """Darken silhouette pixels and interior depth breaks.

    The silhouette keeps the sprite readable against a busy level; the depth
    break is what separates an overlapping wing or leg from the body when the
    two are the same colour.
    """
    orr, og, ob = [int(c * 255) for c in color]
    out = bytearray(buf)
    for y in range(H):
        row = y * W
        for x in range(W):
            p = row + x
            if tri_id[p] < 0:
                continue
            z = depth[p]
            edge = 0.0
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ax, ay = x + dx, y + dy
                if ax < 0 or ay < 0 or ax >= W or ay >= H:
                    edge = 1.0
                    break
                q = ay * W + ax
                if tri_id[q] < 0:
                    edge = 1.0
                    break
                # Neighbour much further away -> this pixel is an inner edge.
                if z - depth[q] > depth_step:
                    edge = max(edge, 0.62)
            if edge:
                s = strength * edge
                q = p * 4
                out[q] = int(buf[q] * (1 - s) + orr * s)
                out[q + 1] = int(buf[q + 1] * (1 - s) + og * s)
                out[q + 2] = int(buf[q + 2] * (1 - s) + ob * s)
    return out


def _downsample(buf, W, H, s):
    if s == 1:
        return buf
    w, h = W // s, H // s
    out = bytearray(w * h * 4)
    inv = 1.0 / (s * s)
    for y in range(h):
        for x in range(w):
            r = g = b = a = 0
            for j in range(s):
                base = ((y * s + j) * W + x * s) * 4
                for i in range(s):
                    q = base + i * 4
                    al = buf[q + 3]
                    r += buf[q] * al
                    g += buf[q + 1] * al
                    b += buf[q + 2] * al
                    a += al
            q = (y * w + x) * 4
            if a:
                out[q] = int(r / a)
                out[q + 1] = int(g / a)
                out[q + 2] = int(b / a)
                out[q + 3] = int(a * inv + 0.5)
    return out
