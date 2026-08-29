# Mr. Cluckers

A procedurally generated 3D model of a plush rooster dog toy, rigged with
floppy secondary motion and baked into sprite sheets for a 2D platformer.

![turnaround](assets/reference/turnaround.png)

Everything here is generated from source by one script. There are no binary
model files to hand-edit, no third-party dependencies, and no build tools —
just Python 3.

```
python3 build.py
```

## What gets built

| Path | What it is |
| --- | --- |
| `assets/model/mrcluckers.glb` | The 3D model with all 12 animation clips. Drop into Blender, Godot, Unity or three.js. |
| `assets/model/mrcluckers.gltf` | Same thing as text-plus-data-URI, if you want to read it. |
| `assets/model/mrcluckers.obj` + `.mtl` | Static rest pose for tools that prefer OBJ. |
| `assets/sprites/mrcluckers_side.png` | The sprite sheet: one row per animation. |
| `assets/sprites/mrcluckers_side.json` | Frame rectangles, timings, and the foot anchor. |
| `assets/sprites/mrcluckers_side.js` | The same data as a `<script>` tag, for `file://` demos. |
| `assets/reference/turnaround.png` | Eight-angle turnaround for reference. |

## The demo

`demo/index.html` is a small platformer that runs the sheet through a real
character controller. Open it directly in a browser — no server needed.

Arrow keys move, <kbd>Space</kbd> jumps, <kbd>&darr;</kbd> crouches,
<kbd>X</kbd> pecks, <kbd>C</kbd> crows, <kbd>Z</kbd> squeaks,
<kbd>V</kbd> tumbles.

`demo/game.js` is meant to be read as much as played: `Anim` handles frame
timing, `pickState` is the animation state machine, and the draw call shows
how to use the anchor so the sprite's feet land on the floor.

## Animations

| Clip | Frames | Loops | For |
| --- | --- | --- | --- |
| `idle` | 16 | yes | standing around, breathing |
| `walk` | 8 | yes | slow movement |
| `run` | 8 | yes | full speed |
| `jump` | 4 | no | crouch, launch, rise |
| `fall` | 4 | yes | airborne, wings flapping |
| `land` | 4 | no | impact squash and recovery |
| `crouch` | 2 | no | ducking |
| `peck` | 6 | no | attack / interact |
| `crow` | 7 | no | taunt / victory |
| `hurt` | 3 | no | taking damage |
| `squeak` | 6 | no | the squeaker gag — crushed flat, pops back |
| `tumble` | 8 | yes | knocked across the room, everything flailing |

## It moves like a dog toy

A plush chicken has no muscles, so nothing in it moves rigidly. Rather than
hand-animating that, the keyframes drive a spring solver
(`tools/mc/floppy.py`) and each soft joint follows along behind:

```
delta'' = drive + sag - k*delta - c*delta'
```

`drive` comes from the joint's own acceleration along the keyframed motion,
which is what produces lag and overshoot; `sag` is dead weight hanging under
gravity. Joints are described in art terms — wobbles per second, damping,
degrees of lag per 1g, degrees of droop — not raw spring constants.

The comb, wattle and wing tips are the loosest parts and are separate joints
purely so they can flop. The legs are kept comparatively controlled so the
feet still meet the floor. On top of that, impacts squash the body: the
`hips` node scales, and because the legs are its children, the whole toy
squishes at once.

Dial it with `--flop`: `0` gives stiff keyframes, `1` is the plush default,
and `2` is cartoonishly loose.

## Useful flags

```
python3 build.py --size 128                 # bigger sprite cells
python3 build.py --only sprites             # skip the model export
python3 build.py --views side,threequarter  # bake another camera angle
python3 build.py --flop 1.6                 # floppier
python3 build.py --no-fuzz                  # smooth surface, no plush noise
```

See [`docs/pipeline.md`](docs/pipeline.md) for how the pieces fit together
and where to change the character's shape.
