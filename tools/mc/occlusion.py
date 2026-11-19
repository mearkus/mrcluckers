"""Baked ambient occlusion: how much of the sky each vertex can see.

A plush toy reads as soft and stuffed largely through its creases -- under
the chin, where a leg meets the body, around the eyes and the base of the
beak -- and nothing darkened them. Both renderers lit every surface as if it
stood alone in open air.

This bakes the answer once, at build time, into a value per vertex: the
fraction of short rays from that vertex, over the hemisphere it faces, that
get out without meeting the model again. The glTF carries it as vertex colour
(three.js applies COLOR_0 on its own), and the sprite renderer multiplies its
lighting by it, so the live model and the sheets darken the same creases.

Pure Python has no business testing rays against ten thousand triangles, so
the surface is first sampled into a set of occupied grid cells, and each ray
just steps through the grid. The directions are a fixed spiral, not random,
so the build stays byte-identical on one interpreter.

It is baked in the rest pose. Parts are rigid and turn about their joints,
so a crease that exists at rest -- the chin, the hips, the eye sockets -- is
there in every pose; one that only opens in motion is not darkened, which is
the right way round to be wrong.
"""

import math

from . import vmath as v

CELL = 0.010        # grid cell, in model units (he is one unit tall)
REACH = 0.14        # how far a ray looks: crease-sized, not room-sized
RAYS = 24
STRENGTH = 0.62     # fully enclosed is this much darker; never black
FLOOR = 0.42


def _directions(n):
    """A fixed, even spread over the +Z hemisphere, cosine-weighted."""
    out = []
    golden = math.pi * (3.0 - math.sqrt(5.0))
    for i in range(n):
        r = math.sqrt((i + 0.5) / n)            # cosine weighting
        a = i * golden
        x, y = r * math.cos(a), r * math.sin(a)
        out.append((x, y, math.sqrt(max(0.0, 1.0 - x * x - y * y))))
    return out


def _frame(nrm):
    nx, ny, nz = nrm
    up = (0.0, 1.0, 0.0) if abs(ny) < 0.9 else (1.0, 0.0, 0.0)
    t = v.normalize(v.cross(up, nrm))
    b = v.cross(nrm, t)
    return t, b


def _occupy(meshes):
    """Every grid cell the surface passes through."""
    cells = set()
    inv = 1.0 / CELL
    for m in meshes:
        verts = m.verts
        for a, b, c, _ in m.faces:
            pa, pb, pc = verts[a], verts[b], verts[c]
            # Enough samples across the triangle that no cell is skipped.
            span = max(v.length(v.sub(pb, pa)), v.length(v.sub(pc, pa)),
                       v.length(v.sub(pc, pb)))
            k = max(1, int(span * inv * 1.5) + 1)
            for i in range(k + 1):
                for j in range(k + 1 - i):
                    u, w = i / k, j / k
                    x = pa[0] + (pb[0] - pa[0]) * u + (pc[0] - pa[0]) * w
                    y = pa[1] + (pb[1] - pa[1]) * u + (pc[1] - pa[1]) * w
                    z = pa[2] + (pb[2] - pa[2]) * u + (pc[2] - pa[2]) * w
                    cells.add((int(math.floor(x * inv)), int(math.floor(y * inv)),
                               int(math.floor(z * inv))))
    return cells


def bake(parts, skel):
    """Set `.ao` on every part in `parts`, from the rest pose of `skel`.

    `skel` is the rig module (ORDER / PARENT / REST_T), the same thing
    pose.bake takes. Parts stay in their own joint space; only the
    measurement is done in the assembled model.
    """
    from . import pose as po          # pose imports rig; rig imports this

    world = po.world_matrices(po.Pose(), skel=skel)
    placed = {}
    for name, part in parts.items():
        c = part.copy()
        c.transform(world[name])
        placed[name] = c
    cells = _occupy(placed.values())

    dirs = _directions(RAYS)
    inv = 1.0 / CELL
    steps = int(REACH / CELL)
    # Rays leave from a point lifted off the surface along its normal, not
    # from the vertex itself: started there, a ray near the horizon skims the
    # surface for a cell or two and counts the vertex's own neighbourhood as
    # a wall, which darkened every gently curved panel he has.
    lift = 2.0 * CELL
    for name, part in parts.items():
        c = placed[name]
        ao = []
        for p0, nrm in zip(c.verts, c.norms):
            p = (p0[0] + nrm[0] * lift, p0[1] + nrm[1] * lift, p0[2] + nrm[2] * lift)
            t, b = _frame(nrm)
            blocked = 0.0
            for dx, dy, dz in dirs:
                rx = t[0] * dx + b[0] * dy + nrm[0] * dz
                ry = t[1] * dx + b[1] * dy + nrm[1] * dz
                rz = t[2] * dx + b[2] * dy + nrm[2] * dz
                for s in range(steps):
                    d = (s + 0.5) * CELL
                    key = (int(math.floor((p[0] + rx * d) * inv)),
                           int(math.floor((p[1] + ry * d) * inv)),
                           int(math.floor((p[2] + rz * d) * inv)))
                    if key in cells:
                        # Near walls shade more than far ones.
                        blocked += 1.0 - d / REACH
                        break
            occ = blocked / len(dirs)
            ao.append(round(max(FLOOR, 1.0 - STRENGTH * occ * 1.6), 4))
        part.ao = ao
    return parts
