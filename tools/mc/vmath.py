"""Small 3D math helpers. Pure stdlib, no numpy.

Vectors are plain 3-tuples, matrices are row-major 4x4 nested tuples, and
rotations are XYZW quaternions (the order glTF expects).
"""

import math

# ---------------------------------------------------------------- vectors


def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def mul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def length(a):
    return math.sqrt(dot(a, a))


def normalize(a):
    n = length(a)
    if n < 1e-12:
        return (0.0, 0.0, 0.0)
    return (a[0] / n, a[1] / n, a[2] / n)


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


# --------------------------------------------------------------- matrices

IDENTITY = (
    (1.0, 0.0, 0.0, 0.0),
    (0.0, 1.0, 0.0, 0.0),
    (0.0, 0.0, 1.0, 0.0),
    (0.0, 0.0, 0.0, 1.0),
)


def mat_mul(a, b):
    return tuple(
        tuple(sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4))
        for r in range(4)
    )


def translation(t):
    return (
        (1.0, 0.0, 0.0, t[0]),
        (0.0, 1.0, 0.0, t[1]),
        (0.0, 0.0, 1.0, t[2]),
        (0.0, 0.0, 0.0, 1.0),
    )


def scaling(s):
    if isinstance(s, (int, float)):
        s = (s, s, s)
    return (
        (s[0], 0.0, 0.0, 0.0),
        (0.0, s[1], 0.0, 0.0),
        (0.0, 0.0, s[2], 0.0),
        (0.0, 0.0, 0.0, 1.0),
    )


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return ((1, 0, 0, 0), (0, c, -s, 0), (0, s, c, 0), (0, 0, 0, 1))


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return ((c, 0, s, 0), (0, 1, 0, 0), (-s, 0, c, 0), (0, 0, 0, 1))


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return ((c, -s, 0, 0), (s, c, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1))


def euler_xyz(rx, ry, rz):
    """Rotation matrix applying X, then Y, then Z."""
    return mat_mul(rot_z(rz), mat_mul(rot_y(ry), rot_x(rx)))


def transform_point(m, p):
    return (
        m[0][0] * p[0] + m[0][1] * p[1] + m[0][2] * p[2] + m[0][3],
        m[1][0] * p[0] + m[1][1] * p[1] + m[1][2] * p[2] + m[1][3],
        m[2][0] * p[0] + m[2][1] * p[1] + m[2][2] * p[2] + m[2][3],
    )


def transform_dir(m, p):
    return (
        m[0][0] * p[0] + m[0][1] * p[1] + m[0][2] * p[2],
        m[1][0] * p[0] + m[1][1] * p[1] + m[1][2] * p[2],
        m[2][0] * p[0] + m[2][1] * p[1] + m[2][2] * p[2],
    )


# ------------------------------------------------------------ quaternions


def quat_from_euler(rx, ry, rz):
    """XYZW quaternion for the same X-then-Y-then-Z rotation as euler_xyz."""
    cx, sx = math.cos(rx * 0.5), math.sin(rx * 0.5)
    cy, sy = math.cos(ry * 0.5), math.sin(ry * 0.5)
    cz, sz = math.cos(rz * 0.5), math.sin(rz * 0.5)
    return (
        sx * cy * cz - cx * sy * sz,
        cx * sy * cz + sx * cy * sz,
        cx * cy * sz - sx * sy * cz,
        cx * cy * cz + sx * sy * sz,
    )


def deg(d):
    return d * math.pi / 180.0
