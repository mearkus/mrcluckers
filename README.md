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
| `assets/textures/*.png` | Tiling fabric maps: base colour and normals for fur, corduroy and felt. |
| `assets/reference/turnaround.png` | Eight-angle turnaround for reference. |
| `shared/controls.js` | On-screen controls for touch devices, used by both demos. |
| `shared/jump.js` | The movement budget — the numbers that decide what a level can ask. |
| `shared/level.js` | Level format, and the conversion the canvas demo needs. |
| `levels/*.json` | The levels themselves. `levels.js` is the generated bundle. |

## Two demos

Both play the same way: arrow keys move, <kbd>Space</kbd> jumps,
<kbd>&darr;</kbd> crouches, <kbd>X</kbd> pecks, <kbd>C</kbd> crows,
<kbd>Z</kbd> squeaks, <kbd>V</kbd> tumbles.

Both work on a phone: on a touch device an on-screen pad appears, and the
play area reflows for the screen. Landscape gives the wider view a
side-scroller wants, but portrait is playable.

**`demo/index.html` — sprites on a 2D canvas.** Open it directly in a
browser, no server needed. `demo/game.js` is meant to be read as much as
played: `Anim` handles frame timing, `pickState` is the animation state
machine, and the draw call shows how to use the anchor so the sprite's feet
land on the floor.

**`web/index.html` — the live 3D model in three.js.** An orthographic camera
locked to the same side-on angle as the sprites, so it looks like the sheet
but animates continuously and lights dynamically. Needs a local server
because browsers block module and glTF loads over `file://`:

```
python3 -m http.server 8000     # then open localhost:8000/web/
```

`web/mrcluckers.js` is the reusable part — a small character API you can drop
into your own scene:

```js
import { Cluckers, sideCamera, plushLighting } from './mrcluckers.js';

const bird = await Cluckers.load('../assets/model/mrcluckers.glb');
scene.add(bird.root);
bird.play('run');          // cross-fades from whatever was playing
bird.setFacing(-1);        // turns rather than mirroring
bird.update(dt);           // in your loop
```

It handles cross-fade timing per state (impacts snap, ambient states ease),
sets the one-shot clips to hold their last frame, and fires `onFinished` so
your controller knows when `peck` or `land` is done.

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

### How the demos treat actions

Actions are **cosmetic**: `peck`, `crow`, `squeak` and `tumble` never stop the
character. Movement follows the keys that are *held*, so firing one mid-run
keeps the run, and jumping works throughout.

| Rule | Why |
| --- | --- |
| An action ends when its clip finishes | the normal case |
| `tumble` also ends after 1.2s | it's the one clip that **loops** — a continuous spin — so it would otherwise never end |
| Jump ends any action | movement states outrank a flourish |
| A direction ends `tumble` only | it's a stun you shrug off; ending `peck` too would mean you could never peck on the run |
| Pressing the same key again ends it | and doesn't restart it |

If you wire `tumble` up yourself, give it a time limit. Don't make it a
one-shot clip instead — that caps it at exactly one turn forever.

## Designing levels

Levels live in `levels/*.json`, authored **once** and read by both demos and
the editor. Coordinates are world units — 1 unit is Mr. Cluckers' height —
with **Y up** and the ground's top surface at `y = 0`. A platform's `y` is its
top surface, the edge that matters for landing.

```json
{
  "name": "Living Room",
  "width": 33,
  "spawn": { "x": 1.5, "y": 0 },
  "goal":  { "x": 30.5, "y": 0 },
  "platforms": [ { "x": 4, "y": 1, "w": 2.5, "h": 0.5 } ],
  "pickups":   [ { "x": 5.25, "y": 1.6 } ],
  "hazards":   [ { "x": 10, "y": 0, "w": 2.5, "h": 0.4, "kind": "water" } ]
}
```

Open [`editor/`](editor/) to draw one. It snaps to a half-height grid and
draws **his real jump arc under the cursor**, so you can see what's reachable
before playtesting. It flags platforms nothing can reach and gaps within 15%
of the limit. Export the JSON, save it into `levels/`, then:

```
python3 build.py --only levels
```

That bundles every level into `levels/levels.js`, which the demos load with a
`<script>` tag — browsers block `fetch()` over `file://`, so a bundle is what
makes the demos work by double-clicking. Add `?level=the-garden` to either
demo to pick one.

### What a jump can do

Measured from the real physics in `shared/jump.js`, in character heights:

| | |
| --- | --- |
| Max jump (hold) | **1.54** |
| Tap jump | 0.64 |
| Gap at full run | **2.44** |
| Gap at walk speed | 1.04 |
| Onto a ledge +1.0 up | 1.98 |
| Onto a ledge +1.5 up | 1.42 |

Rules of thumb: **comfortable gap 1.6–1.8**, **comfortable step up ≤1.0**,
nothing more than 1.5 above the surface that has to reach it, and a landing
platform at least 1.0 wide — his collision box is only 0.44 across, but he
arrives carrying momentum.

Both demos derive their constants from `shared/jump.js`, so the editor's arc
is the arc you actually get.

## Touch controls

`shared/controls.js` mounts a d-pad, a jump button and the action buttons on
touch devices. Rather than giving each demo a second input path, the buttons
dispatch synthetic keyboard events, so the existing `keydown` / `keyup`
handlers pick them up unchanged and multi-touch works for free — holding
*right* while tapping *jump* does what you'd expect, because each button owns
its own pointer.

It only mounts where the *primary* pointer is coarse, so a laptop with a
touchscreen keeps its keyboard and its screen space. Add `?touch=1` to any
demo URL to force the pad on for testing.

```js
TouchControls.mount({ actions: [{ code: 'KeyX', label: 'peck' }] });
TouchControls.mount({ container: el, inline: true });  // flows, doesn't float
```

## Textures

Three fabric families cover the whole toy, all generated procedurally and
seamlessly tiling:

| Family | Where | What it is |
| --- | --- | --- |
| `fur` | body, head, wing tops, tail | Fine fibres gathered into soft clumps |
| `corduroy` | legs, wing undersides | Rounded parallel ribs with a woven surface |
| `felt` | comb, wattle, beak, feet | Short dense nap, almost flat |

Each family is one height field, which the base colour and normal map are
both derived from — so they always agree. The base colour maps are near-white
greyscale that *multiply* the material's colour, which is why one fur tile
serves both greys and one felt tile serves the red, the yellow and the black.
Six maps at 128px come to 153 KB total.

UVs are generated analytically per primitive — cylindrical for surfaces of
revolution, along-and-around for lofts — and stored in world units, so a
single `REPEAT` factor in `texture.py` gives every part the same texel
density. Tangents are computed for normal mapping and exported, so engines
don't have to derive them.

The software renderer samples the same maps, which is why the sprite sheet
and the 3D model don't drift apart.

```
python3 build.py --texture-size 256   # sharper fabric, ~500 KB of maps
python3 build.py --no-textures        # flat colours
```

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
python3 build.py --texture-size 256         # sharper fabric maps
```

## Budget

Measured by loading the GLB into three.js r180:

| | |
| --- | --- |
| Model | 584 KB (152 KB of that is textures) |
| Triangles | 8,496 |
| Draw calls | 23 |
| Shader programs | 2 |
| Skinning | none — rigid parts on animated nodes |

No skinned meshes and no morph targets, so playback is just node transforms.
Dropping `TANGENT` from the export saves ~90 KB if you are happy letting
three.js derive tangents from screen-space derivatives instead.

See [`docs/pipeline.md`](docs/pipeline.md) for how the pieces fit together
and where to change the character's shape.
