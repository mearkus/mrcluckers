"""Procedural, seamlessly tiling fabric maps for the plush materials.

Three families cover the whole toy: the shaggy `fur` of the body and wings,
the ribbed `corduroy` of the legs and wing undersides, and the fine `felt`
of the comb, beak and feet.

Each family is derived from one height field, which keeps generation cheap
and guarantees the base colour and the normal map agree with each other.
Base colour maps are near-white greyscale: glTF multiplies them by the
material's `baseColorFactor`, so a single fur tile serves both greys and one
felt tile serves the red, the yellow and the black.

Tiling works by wrapping the noise lattice at an integer period, so every map
repeats exactly at its edges.
"""

import math

# UV coordinates are stored in world units; this is how many times a tile
# repeats per unit of the character's height.
REPEAT = 8.0


def _hash2(i, j, seed):
    n = i * 374761393 + j * 668265263 + seed * 15731
    n = (n ^ (n >> 13)) & 0xFFFFFFFF
    n = (n * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0


def tile_noise(x, y, px, py, seed=0):
    """Value noise on a lattice that wraps at (px, py), so it tiles."""
    i, j = int(math.floor(x)), int(math.floor(y))
    fx, fy = x - i, y - j
    sx = fx * fx * (3.0 - 2.0 * fx)
    sy = fy * fy * (3.0 - 2.0 * fy)
    i0, j0 = i % px, j % py
    i1, j1 = (i + 1) % px, (j + 1) % py
    a = _hash2(i0, j0, seed)
    b = _hash2(i1, j0, seed)
    c = _hash2(i0, j1, seed)
    d = _hash2(i1, j1, seed)
    top = a + (b - a) * sx
    bot = c + (d - c) * sx
    return top + (bot - top) * sy


def tile_fbm(x, y, px, py, octaves=4, seed=0, gain=0.5):
    """Stacked octaves, each doubling the lattice period so it still tiles."""
    total, amp, norm = 0.0, 1.0, 0.0
    for o in range(octaves):
        m = 1 << o
        total += amp * tile_noise(x * m, y * m, px * m, py * m, seed + o * 101)
        norm += amp
        amp *= gain
    return total / norm


# ------------------------------------------------------------ height fields


def fur_height(size, seed=7):
    """Shaggy plush: fine fibres, elongated, gathered into soft clumps."""
    h = [[0.0] * size for _ in range(size)]
    for y in range(size):
        fy = y / float(size)
        for x in range(size):
            fx = x / float(size)
            # Fibres stretched along v, clumps at a coarser scale.
            fibre = tile_fbm(fx * 26, fy * 7, 26, 7, 3, seed)
            clump = tile_fbm(fx * 5, fy * 5, 5, 5, 3, seed + 40)
            speck = tile_noise(fx * 48, fy * 48, 48, 48, seed + 90)
            h[y][x] = 0.50 * fibre + 0.34 * clump + 0.16 * speck
    return h


def corduroy_height(size, ribs=6, seed=17):
    """Wale cord: rounded parallel ribs with a woven surface on top."""
    h = [[0.0] * size for _ in range(size)]
    for y in range(size):
        fy = y / float(size)
        for x in range(size):
            fx = x / float(size)
            # The rib line wanders slightly, the way real cord does.
            wobble = 0.06 * (tile_fbm(fx * 4, fy * 4, 4, 4, 2, seed + 3) - 0.5)
            wave = math.sin(2.0 * math.pi * ribs * (fy + wobble))
            rib = math.pow(abs(wave), 0.55) * (1.0 if wave >= 0 else 1.0)
            weave = tile_fbm(fx * 30, fy * 30, 30, 30, 2, seed + 11)
            h[y][x] = 0.78 * rib + 0.22 * weave
    return h


def felt_height(size, seed=29):
    """Short dense nap: fine, tight, almost flat."""
    h = [[0.0] * size for _ in range(size)]
    for y in range(size):
        fy = y / float(size)
        for x in range(size):
            fx = x / float(size)
            fine = tile_fbm(fx * 34, fy * 34, 34, 34, 3, seed)
            broad = tile_fbm(fx * 6, fy * 6, 6, 6, 2, seed + 55)
            h[y][x] = 0.72 * fine + 0.28 * broad
    return h


# ----------------------------------------------------------------- encoding


def height_to_gray(h, size, contrast=0.18, floor=1.0):
    """Near-white greyscale detail, meant to multiply a baseColorFactor."""
    lo = min(min(r) for r in h)
    hi = max(max(r) for r in h)
    span = (hi - lo) or 1.0
    out = bytearray(size * size)
    for y in range(size):
        row = h[y]
        base = y * size
        for x in range(size):
            n = (row[x] - lo) / span
            val = floor - contrast * (1.0 - n)
            out[base + x] = max(0, min(255, int(val * 255.0 + 0.5)))
    return out


def height_to_normal(h, size, strength=1.0):
    """Tangent-space normal map from the height field's slope."""
    lo = min(min(r) for r in h)
    hi = max(max(r) for r in h)
    span = (hi - lo) or 1.0
    out = bytearray(size * size * 3)
    for y in range(size):
        yp, yn = (y - 1) % size, (y + 1) % size
        for x in range(size):
            xp, xn = (x - 1) % size, (x + 1) % size
            dx = (h[y][xn] - h[y][xp]) / span
            dy = (h[yn][x] - h[yp][x]) / span
            nx, ny, nz = -dx * strength, -dy * strength, 1.0
            inv = 1.0 / math.sqrt(nx * nx + ny * ny + 1.0)
            q = (y * size + x) * 3
            out[q] = int((nx * inv * 0.5 + 0.5) * 255.0 + 0.5)
            out[q + 1] = int((ny * inv * 0.5 + 0.5) * 255.0 + 0.5)
            out[q + 2] = int((nz * inv * 0.5 + 0.5) * 255.0 + 0.5)
    return out


# ------------------------------------------------------------------ family

FAMILIES = {
    "fur":      {"height": fur_height,      "contrast": 0.22, "strength": 2.4},
    "corduroy": {"height": corduroy_height, "contrast": 0.26, "strength": 3.4},
    "felt":     {"height": felt_height,     "contrast": 0.12, "strength": 1.3},
}


def build(size=256, families=None):
    """Generate every family: {name: {height, gray, normal, size}}."""
    out = {}
    for name in (families or FAMILIES):
        spec = FAMILIES[name]
        h = spec["height"](size)
        out[name] = {
            "size": size,
            "height": h,
            "gray": height_to_gray(h, size, spec["contrast"]),
            "normal": height_to_normal(h, size, spec["strength"]),
        }
    return out
