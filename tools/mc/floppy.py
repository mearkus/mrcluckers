"""Secondary motion: the floppy, ragdoll quality of a stuffed dog toy.

A plush chicken has no muscles. Its head lolls, the comb and wattle swing,
the wing tips lag behind the body and the feet dangle. So every soft joint
is run as a damped pendulum *driven* by the keyframed animation instead of
rigidly following it:

    delta'' = drive + sag - k*delta - c*delta'

`drive` is the joint's own acceleration along the keyframed motion, which is
what creates overshoot and follow-through; `sag` is dead weight hanging under
gravity. The resulting offsets are baked back into the poses, so the glTF
clips and the sprite sheets both carry the flop.

Joints are described in art terms rather than raw spring constants:

    freq    wobbles per second        (low  = loose and slow)
    zeta    damping ratio             (low  = keeps ringing)
    swing   degrees of lag per 1g of body acceleration
    sag     degrees of droop under its own weight at rest
    limit   the most it may ever bend
"""

import math

from . import pose as po
from . import vmath as v

X, Y, Z = 0, 1, 2

G_REF = 7.5          # reference acceleration; also the strength of gravity
SUBSTEPS = 10        # keeps the stiffer joints stable at low frame rates


class Soft:
    def __init__(self, com, axes=(X, Z), freq=3.2, zeta=0.28, swing=10.0,
                 sag=4.0, limit=26.0):
        self.com = com
        self.axes = axes
        self.freq = freq
        self.zeta = zeta
        self.swing = swing
        self.sag = sag
        self.limit = math.radians(limit)

    @property
    def k(self):
        w = 2.0 * math.pi * self.freq
        return w * w

    @property
    def c(self):
        return 2.0 * self.zeta * (2.0 * math.pi * self.freq)

    def gains(self, radius):
        """Scale the raw torques so `swing` and `sag` land in degrees."""
        norm = self.k * max(radius, 1e-4) / G_REF
        return math.radians(self.swing) * norm, math.radians(self.sag) * norm


# The extremities are the loose ones: comb, wattle and wing tips flop hard,
# the legs stay comparatively controlled so the feet keep meeting the floor.
SOFT = {
    "neck":       Soft((0.0, 0.075, 0.010), (X, Y, Z), 4.0, 0.36,  5.0, 1.5, 13.0),
    "head":       Soft((0.0, 0.050, 0.040), (X, Y, Z), 3.3, 0.30,  9.0, 3.0, 20.0),
    "comb":       Soft((0.0, 0.075, 0.010), (X, Y),    2.9, 0.17, 17.0, 5.0, 36.0),
    "wattle":     Soft((0.0, -0.075, 0.000), (X, Y),   2.5, 0.15, 21.0, 9.0, 42.0),
    "shoulder_l": Soft((0.10, -0.010, -0.010), (Y, Z), 3.2, 0.26, 11.0, 5.0, 25.0),
    "shoulder_r": Soft((-0.10, -0.010, -0.010), (Y, Z), 3.2, 0.26, 11.0, 5.0, 25.0),
    "wingtip_l":  Soft((0.11, -0.020, -0.020), (Y, Z), 2.5, 0.17, 19.0, 8.0, 48.0),
    "wingtip_r":  Soft((-0.11, -0.020, -0.020), (Y, Z), 2.5, 0.17, 19.0, 8.0, 48.0),
    "tail":       Soft((0.0, 0.030, -0.100), (X, Y),   2.9, 0.21, 13.0, 5.0, 30.0),
    "ankle_l":    Soft((0.0, -0.060, 0.050), (X, Z),   4.6, 0.40,  4.5, 2.0, 13.0),
    "ankle_r":    Soft((0.0, -0.060, 0.050), (X, Z),   4.6, 0.40,  4.5, 2.0, 13.0),
    "hip_l":      Soft((0.0, -0.120, 0.000), (X,),     5.0, 0.46,  3.5, 1.0,  9.0),
    "hip_r":      Soft((0.0, -0.120, 0.000), (X,),     5.0, 0.46,  3.5, 1.0,  9.0),
}

GRAVITY = (0.0, -G_REF, 0.0)


def _track(poses, joint):
    """World-space joint origin, centre of mass and parent frame per frame."""
    com = SOFT[joint].com
    origins, coms, frames = [], [], []
    for p in poses:
        w = po.world_matrices(p)
        origins.append(v.transform_point(w[joint], (0.0, 0.0, 0.0)))
        coms.append(v.transform_point(w[joint], com))
        frames.append(w[po.rig.PARENT[joint]])
    return origins, coms, frames


def _accelerations(coms, dt, loop):
    """Central difference; a non-looping clip is clamped at both ends."""
    n = len(coms)
    out = []
    for i in range(n):
        if loop:
            prev, nxt = (i - 1) % n, (i + 1) % n
        else:
            prev, nxt = max(0, i - 1), min(n - 1, i + 1)
        out.append(v.mul(
            v.add(v.sub(coms[nxt], coms[i]), v.sub(coms[prev], coms[i])),
            1.0 / (dt * dt),
        ))
    return out


def solve(poses, fps, loop=True, amount=1.0, passes=4):
    """Return new poses with lag, overshoot and droop baked in.

    Looping clips are simulated for several passes so the wobble is already
    in its steady state on the frames that get exported.
    """
    if amount <= 0.0 or not poses:
        return [p.copy() for p in poses]

    n = len(poses)
    dt = 1.0 / float(fps)
    joints = [j for j in SOFT if j in po.rig.PARENT]

    sim = {}
    for j in joints:
        origins, coms, frames = _track(poses, j)
        radius = sum(v.length(v.sub(c, o)) for c, o in zip(coms, origins)) / n
        drive_gain, sag_gain = SOFT[j].gains(radius)
        sim[j] = {
            "origins": origins,
            "coms": coms,
            "frames": frames,
            "acc": _accelerations(coms, dt, loop),
            "radius2": max(radius * radius, 1e-6),
            "drive": drive_gain,
            "sag": sag_gain,
            "state": {ax: [0.0, 0.0] for ax in SOFT[j].axes},
        }

    # Let gravity settle before the clip starts so frame 0 is already sagging.
    _step_range(sim, joints, [0] * 12, dt, static=True)

    out = [None] * n
    for p in range(passes if loop else 1):
        record = out if p == (passes - 1 if loop else 0) else None
        _step_range(sim, joints, range(n), dt, record=record,
                    poses=poses, amount=amount)

    return [o if o is not None else q.copy() for o, q in zip(out, poses)]


def _step_range(sim, joints, indices, dt, record=None, poses=None,
                amount=1.0, static=False):
    sub = dt / SUBSTEPS
    for i in indices:
        for j in joints:
            s = sim[j]
            soft = SOFT[j]
            r = v.sub(s["coms"][i], s["origins"][i])
            acc = (0.0, 0.0, 0.0) if static else s["acc"][i]
            # Dead weight resists the body's acceleration and hangs down.
            force = v.add(v.mul(GRAVITY, s["sag"]), v.mul(acc, -s["drive"]))
            torque = v.cross(r, force)
            parent = s["frames"][i]
            for ax in soft.axes:
                axis = v.normalize((parent[0][ax], parent[1][ax], parent[2][ax]))
                alpha = v.dot(torque, axis) / s["radius2"]
                delta, omega = s["state"][ax]
                for _ in range(SUBSTEPS):
                    omega += (alpha - soft.k * delta - soft.c * omega) * sub
                    delta += omega * sub
                # Soft clamp: eases into the limit instead of buzzing on it.
                lim = soft.limit
                if abs(delta) > lim * 0.6:
                    delta = math.copysign(
                        lim * (0.6 + 0.4 * math.tanh((abs(delta) / lim - 0.6) / 0.4)),
                        delta)
                s["state"][ax] = [delta, omega]

        if record is not None:
            p = poses[i].copy()
            for j in joints:
                d = [0.0, 0.0, 0.0]
                for ax in SOFT[j].axes:
                    d[ax] = sim[j]["state"][ax][0] * amount
                p.offset(j, tuple(d))
            record[i] = p
