"""Ginger's poses and clips.

She is the thing Mr. Cluckers is trying to reach, so what she needs is not a
platformer moveset but presence: standing, sitting, and wagging hard enough
that you can tell she is pleased to see him.

The tail does most of the acting. It is three segments driven through the
same spring solver as Mr. Cluckers' comb and wattle, which is what turns a
keyframed sweep into a whip.
"""

import math

from . import floppy
from . import ginger
from .floppy import Soft, X, Y, Z
from .pose import Pose
from .vmath import deg


# How loose each joint is. The tail is the loosest thing on her by a
# distance; the legs stay controlled so her feet keep meeting the floor.
SOFT = {
    "neck":     Soft((0.0, 0.06, 0.05), (X, Y, Z), 4.2, 0.38, 4.0, 1.2, 11.0),
    "head":     Soft((0.0, 0.03, 0.10), (X, Y, Z), 3.6, 0.32, 7.0, 2.0, 16.0),
    "ear_l":    Soft((0.03, -0.09, 0.03), (X, Z), 2.7, 0.16, 20.0, 9.0, 44.0),
    "ear_r":    Soft((-0.03, -0.09, 0.03), (X, Z), 2.7, 0.16, 20.0, 9.0, 44.0),
    "tail_a":   Soft((0.0, 0.03, -0.07), (X, Y), 3.4, 0.20, 14.0, 3.0, 30.0),
    "tail_b":   Soft((0.0, 0.02, -0.07), (X, Y), 2.9, 0.16, 20.0, 3.5, 40.0),
    "tail_c":   Soft((0.0, 0.0, -0.10), (X, Y), 2.4, 0.13, 26.0, 4.0, 52.0),
}


def make_pose(bob=0.0, surge=0.0, pitch=0.0, roll=0.0, yaw=0.0,
              head_pitch=0.0, head_yaw=0.0, head_roll=0.0,
              ear_lift=0.0, tail_lift=0.0, tail_swing=0.0, tail_curl=0.0,
              sh_l=0.0, sh_r=0.0, elbow_l=0.0, elbow_r=0.0,
              hip_l=0.0, hip_r=0.0, stifle_l=0.0, stifle_r=0.0,
              hock_l=0.0, hock_r=0.0, spine=0.0):
    """Build a Pose from degrees.

    Positive `pitch` tips her nose-down; positive `tail_lift` raises the tail;
    `tail_swing` sweeps it sideways and is spread along the segments so the
    tip travels furthest.
    """
    p = Pose()
    p["hips"] = (deg(pitch), deg(yaw), deg(roll))
    p["spine"] = (deg(spine), 0.0, 0.0)
    p["neck"] = (deg(head_pitch * 0.4), deg(head_yaw * 0.35), deg(head_roll * 0.3))
    p["head"] = (deg(head_pitch * 0.6), deg(head_yaw * 0.65), deg(head_roll * 0.7))
    p["ear_l"] = (deg(-ear_lift), 0.0, deg(-ear_lift * 0.3))
    p["ear_r"] = (deg(-ear_lift), 0.0, deg(ear_lift * 0.3))

    # The sweep grows down the tail so the tip covers the most ground.
    p["tail_a"] = (deg(-tail_lift * 0.5), deg(tail_swing * 0.35), 0.0)
    p["tail_b"] = (deg(-tail_lift * 0.3 + tail_curl * 0.4),
                   deg(tail_swing * 0.35), 0.0)
    p["tail_c"] = (deg(-tail_lift * 0.2 + tail_curl * 0.6),
                   deg(tail_swing * 0.30), 0.0)

    p["sh_l"] = (deg(sh_l), 0.0, 0.0)
    p["sh_r"] = (deg(sh_r), 0.0, 0.0)
    p["elbow_l"] = (deg(elbow_l), 0.0, 0.0)
    p["elbow_r"] = (deg(elbow_r), 0.0, 0.0)
    p["hip_l"] = (deg(hip_l), 0.0, 0.0)
    p["hip_r"] = (deg(hip_r), 0.0, 0.0)
    p["stifle_l"] = (deg(stifle_l), 0.0, 0.0)
    p["stifle_r"] = (deg(stifle_r), 0.0, 0.0)
    p["hock_l"] = (deg(hock_l), 0.0, 0.0)
    p["hock_r"] = (deg(hock_r), 0.0, 0.0)
    p.root_offset = (0.0, bob, surge)
    return p


class Clip:
    def __init__(self, name, keys, loop=True, fps=12):
        self.name = name
        self.keys = keys
        self.loop = loop
        self.fps = fps

    @property
    def duration(self):
        return self.keys[-1][0]

    @property
    def frames(self):
        return len(self.keys) - 1 if self.loop else len(self.keys)

    def poses(self):
        keys = self.keys[:-1] if self.loop else self.keys
        return [p for _, p in keys]


def _cyclic(name, n, fn, fps=12):
    return Clip(name, [(i / float(fps), fn(i / float(n))) for i in range(n + 1)],
                loop=True, fps=fps)


def _sequence(name, poses, fps=12):
    return Clip(name, [(i / float(fps), p) for i, p in enumerate(poses)],
                loop=False, fps=fps)


# ----------------------------------------------------------------- clips
# The sit poses were solved numerically rather than eyeballed: her front legs
# stay straight and planted, the body offset is whatever keeps the front paw
# still as the body pitches, and the hind angles are the ones that put the
# hock on the floor behind her. Guessing these gave a dog doing the splits.
# Targets: stifle forward alongside the belly, hock low behind it, metatarsus
# flat with the paw forward of the hock. Constraining only the paw gave a dog
# whose knee stuck up behind her.
SIT_MID = dict(bob=-0.113, surge=-0.121, pitch=-8,
               hip_l=-9, hip_r=-9, stifle_l=2, stifle_r=2,
               hock_l=-13, hock_r=-13)
SIT_LOW = dict(bob=-0.241, surge=-0.225, pitch=-16,
               hip_l=-22, hip_r=-22, stifle_l=26, stifle_r=26,
               hock_l=-25, hock_r=-25)
SIT = dict(bob=-0.383, surge=-0.310, pitch=-24,
           hip_l=-35, hip_r=-35, stifle_l=46, stifle_r=46,
           hock_l=-33, hock_r=-33)


def stand(n=20, fps=12):
    """Standing idle: breathing, a slow tail sweep, the odd look around."""
    def f(t):
        a = 2 * math.pi * t
        return make_pose(
            bob=0.008 * math.sin(a * 2),
            pitch=0.8 * math.sin(a * 2),
            head_pitch=-2.0 + 2.5 * math.sin(a + 0.6),
            head_yaw=9.0 * math.sin(a * 0.5),
            ear_lift=3.0,
            tail_lift=16.0,
            tail_swing=14.0 * math.sin(a),
        )
    return _cyclic("stand", n, f, fps)


def wag(n=12, fps=16):
    """Pleased to see you: fast tail, weight shifting, ears up."""
    def f(t):
        a = 2 * math.pi * t
        return make_pose(
            bob=0.012 * abs(math.sin(a)),
            roll=3.5 * math.sin(a),
            head_pitch=-9.0,
            head_yaw=5.0 * math.sin(a),
            ear_lift=9.0,
            tail_lift=34.0,
            tail_swing=42.0 * math.sin(a),
        )
    return _cyclic("wag", n, f, fps)


def sit(fps=12):
    """Standing to sitting: rear drops, hind legs fold, front stays straight."""
    poses = [
        make_pose(tail_lift=16, ear_lift=3),
        make_pose(head_pitch=-4, tail_lift=12, ear_lift=4, **SIT_MID),
        make_pose(head_pitch=-8, tail_lift=6, ear_lift=6, **SIT_LOW),
        make_pose(head_pitch=-11, tail_lift=2, ear_lift=6, **SIT),
        make_pose(head_pitch=-8, tail_lift=5, ear_lift=5, **SIT),
    ]
    return _sequence("sit", poses, fps)


def sit_idle(n=16, fps=12):
    """Sitting and waiting, tail sweeping the floor behind her."""
    def f(t):
        a = 2 * math.pi * t
        kw = dict(SIT)
        kw["bob"] += 0.005 * math.sin(a * 2)
        return make_pose(
            head_pitch=-7 + 2.5 * math.sin(a + 0.5),
            head_yaw=11.0 * math.sin(a * 0.5),
            ear_lift=5.0,
            tail_lift=2.0,
            tail_swing=24.0 * math.sin(a),
            **kw
        )
    return _cyclic("sit_idle", n, f, fps)


def greet(fps=14):
    """The reunion: a bounce onto the front feet, head up, tail going hard."""
    poses = [
        make_pose(tail_lift=20, ear_lift=6, head_pitch=-6),
        make_pose(bob=0.030, pitch=6, spine=-5, head_pitch=-22, ear_lift=11,
                  sh_l=-26, sh_r=-18, elbow_l=20, elbow_r=14,
                  tail_lift=40, tail_swing=34),
        make_pose(bob=0.075, pitch=13, spine=-9, head_pitch=-30, ear_lift=12,
                  sh_l=-44, sh_r=-32, elbow_l=34, elbow_r=24,
                  tail_lift=46, tail_swing=-38),
        make_pose(bob=0.040, pitch=7, spine=-5, head_pitch=-24, ear_lift=11,
                  sh_l=-28, sh_r=-20, elbow_l=22, elbow_r=16,
                  tail_lift=42, tail_swing=36),
        make_pose(bob=-0.010, pitch=-2, head_pitch=-12, ear_lift=8,
                  tail_lift=32, tail_swing=-28),
        make_pose(tail_lift=22, ear_lift=6, head_pitch=-6, tail_swing=18),
    ]
    return _sequence("greet", poses, fps)


def all_clips(flop=1.0):
    """Every clip, run through the secondary-motion solver."""
    clips = [stand(), wag(), sit(), sit_idle(), greet()]
    out = {}
    for c in clips:
        if flop > 0.0:
            solved = floppy.solve(c.poses(), c.fps, loop=c.loop, amount=flop,
                                  soft=SOFT, skel=ginger)
            keys = [(i / float(c.fps), p) for i, p in enumerate(solved)]
            if c.loop:
                keys.append((len(solved) / float(c.fps), solved[0]))
            c = Clip(c.name, keys, loop=c.loop, fps=c.fps)
        out[c.name] = c
    return out
