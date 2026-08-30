"""Animation clips for a 2D platformer.

Poses are described with friendly, side-agnostic parameters (wing lift,
wing sweep, hip swing...) and `make_pose` works out the per-side signs, so a
left and right limb given the same value move as mirror images.
"""

import math

from . import floppy
from .pose import Pose
from .vmath import deg

SPIN_PIVOT = (0.0, 0.45, 0.0)      # tumbles rotate about the body, not the feet

# Wings hang at the sides for gameplay poses; the modelling rest pose has
# them straight out, which reads badly from a side-scroller camera.
BASE = {
    "wing_lift": -16.0,
    "wing_sweep": 38.0,     # swept along the flank so they read in profile
}


def make_pose(lean=0.0, bob=0.0, surge=0.0, twist=0.0, spin=0.0, squash=0.0,
              head_pitch=0.0, head_yaw=0.0, head_roll=0.0,
              wing_lift_l=None, wing_lift_r=None,
              wing_sweep_l=None, wing_sweep_r=None,
              hip_l=0.0, hip_r=0.0, splay_l=0.0, splay_r=0.0,
              ankle_l=0.0, ankle_r=0.0, tail=0.0):
    """Build a Pose from degrees. Positive hip swings the leg forward (+Z),
    positive wing_lift raises the wing tip, positive lean tips the body
    forward."""
    wl = BASE["wing_lift"] if wing_lift_l is None else wing_lift_l
    wr = BASE["wing_lift"] if wing_lift_r is None else wing_lift_r
    sl = BASE["wing_sweep"] if wing_sweep_l is None else wing_sweep_l
    sr = BASE["wing_sweep"] if wing_sweep_r is None else wing_sweep_r

    p = Pose()
    p["hips"] = (deg(lean), deg(twist), 0.0)
    p["neck"] = (deg(head_pitch * 0.45), deg(head_yaw * 0.4), deg(head_roll * 0.4))
    p["head"] = (deg(head_pitch * 0.55), deg(head_yaw * 0.6), deg(head_roll * 0.6))
    # Left wing lifts with +Z and sweeps back with +Y; the right is mirrored.
    p["shoulder_l"] = (0.0, deg(sl), deg(wl))
    p["shoulder_r"] = (0.0, deg(-sr), deg(-wr))
    p["hip_l"] = (deg(-hip_l), 0.0, deg(splay_l))
    p["hip_r"] = (deg(-hip_r), 0.0, deg(-splay_r))
    p["ankle_l"] = (deg(ankle_l), 0.0, deg(-splay_l * 0.8))
    p["ankle_r"] = (deg(ankle_r), 0.0, deg(splay_r * 0.8))
    p["tail"] = (deg(tail), 0.0, 0.0)

    offset = (0.0, bob, surge)
    if spin:
        # Spin about the belly rather than the feet: rotate the pivot back in.
        import mc.vmath as _v
        r = _v.euler_xyz(deg(spin), 0.0, 0.0)
        c = SPIN_PIVOT
        offset = _v.add(offset, _v.sub(c, _v.transform_point(r, c)))
        p["root"] = (deg(spin), 0.0, 0.0)
    p.root_offset = offset

    if squash:
        # Plush squashes wide as it shortens; stretch is the same in reverse.
        p.scales["hips"] = (1.0 + squash * 0.55, 1.0 - squash,
                            1.0 + squash * 0.55)
    return p


class Clip:
    def __init__(self, name, keys, loop=True, fps=12):
        self.name = name
        self.keys = keys                       # [(time_seconds, Pose)]
        self.loop = loop
        self.fps = fps

    @property
    def duration(self):
        return self.keys[-1][0]

    @property
    def frames(self):
        return len(self.keys) if not self.loop else len(self.keys) - 1

    def poses(self):
        """Frames to bake: a looping clip drops the duplicated final key."""
        keys = self.keys[:-1] if self.loop else self.keys
        return [p for _, p in keys]


def _cyclic(name, n, fn, fps=12):
    """Build a looping clip by evaluating fn(phase) at n even steps."""
    keys = [(i / float(fps), fn(i / float(n))) for i in range(n + 1)]
    return Clip(name, keys, loop=True, fps=fps)


def _sequence(name, poses, fps=12):
    return Clip(name, [(i / float(fps), p) for i, p in enumerate(poses)],
                loop=False, fps=fps)


# ----------------------------------------------------------------- clips


def idle(n=16, fps=12):
    def f(t):
        a = 2 * math.pi * t
        return make_pose(
            lean=1.6 + 1.4 * math.sin(a),
            bob=0.010 * math.sin(a) - 0.004,
            head_pitch=-3.0 + 3.5 * math.sin(a + 0.9),
            head_yaw=5.0 * math.sin(a * 0.5),
            wing_lift_l=-20 + 4.0 * math.sin(a + 0.5),
            wing_lift_r=-20 + 4.0 * math.sin(a + 0.5),
            tail=-4.0 + 3.0 * math.sin(a + 2.0),
        )
    return _cyclic("idle", n, f, fps)


def walk(n=8, fps=12):
    def f(t):
        a = 2 * math.pi * t
        swing = 26.0
        # Chickens bob their head against the stride; it sells the walk.
        return make_pose(
            lean=7.0 + 2.0 * math.sin(2 * a),
            bob=0.016 * abs(math.sin(a)) - 0.010,
            surge=0.012 * math.sin(a),
            twist=5.0 * math.sin(a),
            head_pitch=-4.0 - 7.0 * math.sin(2 * a + 1.2),
            hip_l=swing * math.sin(a),
            hip_r=swing * math.sin(a + math.pi),
            ankle_l=-14.0 * math.sin(a - 0.6),
            ankle_r=-14.0 * math.sin(a + math.pi - 0.6),
            wing_lift_l=-18 + 9.0 * math.sin(a),
            wing_lift_r=-18 - 9.0 * math.sin(a),
            tail=-6.0 + 5.0 * math.sin(2 * a),
        )
    return _cyclic("walk", n, f, fps)


def run(n=8, fps=16):
    def f(t):
        a = 2 * math.pi * t
        swing = 42.0
        return make_pose(
            lean=20.0 + 3.0 * math.sin(2 * a),
            bob=0.030 * abs(math.sin(a)) - 0.016,
            surge=0.020 * math.sin(a),
            twist=8.0 * math.sin(a),
            head_pitch=-14.0 - 8.0 * math.sin(2 * a + 1.2),
            hip_l=swing * math.sin(a),
            hip_r=swing * math.sin(a + math.pi),
            ankle_l=-26.0 * math.sin(a - 0.5),
            ankle_r=-26.0 * math.sin(a + math.pi - 0.5),
            wing_lift_l=6.0 + 34.0 * math.sin(a * 2.0),
            wing_lift_r=6.0 + 34.0 * math.sin(a * 2.0),
            wing_sweep_l=14.0,
            wing_sweep_r=14.0,
            tail=-14.0 + 6.0 * math.sin(2 * a),
        )
    return _cyclic("run", n, f, fps)


def crouch_pose(depth=1.0):
    return make_pose(
        squash=0.16 * depth,
        lean=14.0 * depth,
        bob=-0.085 * depth,
        head_pitch=-8.0 * depth,
        splay_l=26.0 * depth, splay_r=26.0 * depth,
        hip_l=-6.0 * depth, hip_r=-6.0 * depth,
        wing_lift_l=-30 * depth - 20 * (1 - depth),
        wing_lift_r=-30 * depth - 20 * (1 - depth),
        tail=10.0 * depth,
    )


def crouch():
    return _sequence("crouch", [crouch_pose(0.55), crouch_pose(1.0)], fps=14)


def jump(fps=14):
    poses = [
        crouch_pose(0.9),
        make_pose(squash=-0.10, lean=-4, bob=0.030, hip_l=-18, hip_r=-14, ankle_l=26, ankle_r=24,
                  head_pitch=10, wing_lift_l=46, wing_lift_r=46,
                  wing_sweep_l=6, wing_sweep_r=6, tail=-18),
        make_pose(squash=-0.13, lean=-9, bob=0.045, hip_l=-26, hip_r=-10, ankle_l=30, ankle_r=18,
                  head_pitch=14, wing_lift_l=56, wing_lift_r=56,
                  wing_sweep_l=2, wing_sweep_r=2, tail=-22),
        make_pose(lean=-6, bob=0.038, hip_l=-20, hip_r=-6, ankle_l=22, ankle_r=12,
                  head_pitch=8, wing_lift_l=30, wing_lift_r=30,
                  wing_sweep_l=10, wing_sweep_r=10, tail=-16),
    ]
    return _sequence("jump", poses, fps)


def fall(n=4, fps=10):
    def f(t):
        a = 2 * math.pi * t
        return make_pose(
            lean=-6.0,
            bob=0.010 * math.sin(a),
            head_pitch=16.0 + 4.0 * math.sin(a),
            hip_l=16.0, hip_r=-14.0, splay_l=10.0, splay_r=10.0,
            ankle_l=-8.0, ankle_r=-6.0,
            wing_lift_l=34.0 + 26.0 * math.sin(a),
            wing_lift_r=34.0 + 26.0 * math.sin(a),
            wing_sweep_l=4.0, wing_sweep_r=4.0,
            tail=-24.0,
        )
    return _cyclic("fall", n, f, fps)


def land(fps=14):
    poses = [
        make_pose(squash=-0.06, lean=6, bob=-0.030, splay_l=16, splay_r=16, hip_l=8, hip_r=-8,
                  head_pitch=8, wing_lift_l=24, wing_lift_r=24, tail=-6),
        crouch_pose(1.0),
        make_pose(squash=0.24, lean=8, bob=-0.040, splay_l=14, splay_r=14, head_pitch=-4,
                  wing_lift_l=-8, wing_lift_r=-8, tail=4),
        make_pose(squash=0.06, lean=2, bob=-0.010, head_pitch=-2),
    ]
    return _sequence("land", poses, fps)


def peck(fps=14):
    poses = [
        make_pose(lean=6, head_pitch=-14, tail=-4),
        make_pose(lean=14, bob=-0.020, head_pitch=34, tail=-14),
        make_pose(lean=18, bob=-0.030, head_pitch=54, tail=-20,
                  wing_lift_l=-4, wing_lift_r=-4),
        make_pose(lean=14, bob=-0.018, head_pitch=40, tail=-12),
        make_pose(lean=7, bob=-0.006, head_pitch=4, tail=-4),
        make_pose(lean=2, head_pitch=-6),
    ]
    return _sequence("peck", poses, fps)


def crow(fps=12):
    """Cock-a-doodle-doo: rear back, throw the head up, flare the wings."""
    poses = [
        make_pose(lean=8, head_pitch=6),
        make_pose(lean=-4, bob=0.010, head_pitch=-22, tail=-10,
                  wing_lift_l=8, wing_lift_r=8, wing_sweep_l=16, wing_sweep_r=16),
        make_pose(lean=-14, bob=0.024, head_pitch=-46, tail=-22,
                  wing_lift_l=34, wing_lift_r=34, wing_sweep_l=4, wing_sweep_r=4),
        make_pose(lean=-16, bob=0.028, head_pitch=-52, tail=-26,
                  wing_lift_l=42, wing_lift_r=42, wing_sweep_l=0, wing_sweep_r=0),
        make_pose(lean=-13, bob=0.022, head_pitch=-44, tail=-22,
                  wing_lift_l=36, wing_lift_r=36, wing_sweep_l=4, wing_sweep_r=4),
        make_pose(lean=-6, bob=0.010, head_pitch=-24, tail=-12,
                  wing_lift_l=12, wing_lift_r=12, wing_sweep_l=14, wing_sweep_r=14),
        make_pose(lean=4, head_pitch=-4),
    ]
    return _sequence("crow", poses, fps)


def hurt(fps=14):
    poses = [
        make_pose(squash=-0.08, lean=-18, bob=0.014, head_pitch=-30, twist=-10,
                  wing_lift_l=40, wing_lift_r=40, wing_sweep_l=-10, wing_sweep_r=-10,
                  hip_l=-16, hip_r=10, tail=-26),
        make_pose(lean=-22, bob=0.006, head_pitch=-24, twist=-16,
                  wing_lift_l=28, wing_lift_r=28, wing_sweep_l=-4, wing_sweep_r=-4,
                  hip_l=-20, hip_r=14, tail=-20),
        make_pose(lean=-10, bob=-0.008, head_pitch=-10, twist=-8,
                  wing_lift_l=10, wing_lift_r=10, hip_l=-8, hip_r=6, tail=-8),
    ]
    return _sequence("hurt", poses, fps)


def squeak(fps=14):
    """The squeaker gag: the toy is crushed flat, then pops back and wobbles."""
    poses = [
        make_pose(squash=0.05, lean=4, head_pitch=-4),
        make_pose(squash=0.42, bob=-0.055, lean=10, head_pitch=16,
                  splay_l=30, splay_r=30, wing_lift_l=-42, wing_lift_r=-42,
                  tail=16),
        make_pose(squash=0.50, bob=-0.070, lean=12, head_pitch=22,
                  splay_l=34, splay_r=34, wing_lift_l=-46, wing_lift_r=-46,
                  tail=20),
        make_pose(squash=-0.20, bob=0.030, lean=-8, head_pitch=-26,
                  splay_l=4, splay_r=4, wing_lift_l=30, wing_lift_r=30,
                  wing_sweep_l=4, wing_sweep_r=4, tail=-24),
        make_pose(squash=-0.10, bob=0.012, lean=-4, head_pitch=-14,
                  wing_lift_l=12, wing_lift_r=12, tail=-12),
        make_pose(squash=0.04, lean=2, head_pitch=-2),
    ]
    return _sequence("squeak", poses, fps)


def tumble(n=8, fps=14):
    """Thrown across the room: a full flip with everything flailing loose."""
    def f(t):
        a = 2 * math.pi * t
        return make_pose(
            spin=-360.0 * t,
            squash=-0.06,
            head_pitch=-10.0,
            hip_l=24.0 + 14.0 * math.sin(a),
            hip_r=-18.0 + 14.0 * math.sin(a + 2.0),
            splay_l=14.0, splay_r=14.0,
            wing_lift_l=30.0, wing_lift_r=30.0,
            wing_sweep_l=-6.0, wing_sweep_r=-6.0,
            tail=-16.0,
        )
    return _cyclic("tumble", n, f, fps)


def all_clips(flop=1.0):
    """Every clip, run through the secondary-motion solver.

    `flop` scales the floppiness: 0 gives stiff keyframes, 1 the plush
    behaviour, and above 1 gets cartoonishly loose.
    """
    clips = [idle(), walk(), run(), jump(), fall(), land(),
             crouch(), peck(), crow(), hurt(), squeak(), tumble()]
    out = {}
    for c in clips:
        if flop > 0.0:
            solved = floppy.solve(c.poses(), c.fps, loop=c.loop, amount=flop)
            keys = [(i / float(c.fps), p) for i, p in enumerate(solved)]
            if c.loop:
                keys.append((len(solved) / float(c.fps), solved[0]))
            c = Clip(c.name, keys, loop=c.loop, fps=c.fps)
        out[c.name] = c
    return out
