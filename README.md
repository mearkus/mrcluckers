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
| `assets/model/ginger.glb` | Ginger, the dog he is trying to reach, with five clips. |
| `assets/model/mrcluckers.gltf` | Same thing as text-plus-data-URI, if you want to read it. |
| `assets/model/mrcluckers.obj` + `.mtl` | Static rest pose for tools that prefer OBJ. |
| `assets/sprites/mrcluckers_side.png` | The sprite sheet: one row per animation. |
| `assets/sprites/mrcluckers_side.json` | Frame rectangles, timings, and the foot anchor. |
| `assets/sprites/mrcluckers_side.js` | The same data as a `<script>` tag, for `file://` demos. |
| `assets/sprites/ginger_side.png` + `.json` | Ginger's sheet, baked at the same pixels-per-unit so the two are to scale. |
| `assets/textures/*.png` | Tiling fabric maps: base colour and normals for fur, corduroy and felt. |
| `assets/reference/turnaround.png` | Eight-angle turnaround for reference. |
| `assets/art/keyart.png` | Both characters in one render, on transparency. The title screen's hero image. |
| `shared/controls.js` | On-screen controls for touch devices, used by both demos. |
| `shared/jump.js` | The movement budget — the numbers that decide what a level can ask. |
| `shared/level.js` | Level format, and the conversion the canvas demo needs. |
| `shared/bonus.js` | The bonus round's rules and physics, with no rendering. |
| `shared/patrol.js` | Machines that move along a surface — where they are, and what they do to you. |
| `shared/checkpoint.js` | Where he comes back to after a fall. |
| `shared/distraction.js` | The things Ginger would rather be looking at. |
| `shared/thief.js` | The other dog at the park, and what it does with the toy. |
| `shared/progress.js` | Which levels are finished, and what that opens up. |
| `shared/sound.js` | Every sound in the game, synthesised on the spot. |
| `shared/theme.js` | What each level looks like: palette, parallax layers, and which section it files under. |
| `demo/shell.js` | Title screen, the level-select screen, and the end-of-level panel. |
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

## How a level looks

Every level used to draw the same sky and the same two green hills — indoors
included, so the living room had rolling countryside behind the sofa.

A theme is a palette plus a stack of parallax layers, and the renderer knows
four kinds of layer rather than knowing about any particular place:

| | |
| --- | --- |
| `blobs` | repeating ellipses — hills, bushes, a treeline |
| `posts` | repeating uprights — fence rails, wainscot, trunks |
| `band` | a stripe at a fixed height — skirting, a path, a hedge top |
| `panes` | rectangles with a warm centre — windows |

Layers are described in world pixels and drawn in screen space, so `speed` is
how much of the camera's motion a layer takes: 0 is painted on the far wall, 1
moves with the floor. The five levels get a room, a kitchen, a garden, a park and a lane at dusk,
and platforms and water take their colours from the theme too.

Two things worth knowing if you add a theme:

- **`step` is halved when drawn.** Overlapping ellipses are how hills read as
  continuous, so discrete objects need spacing well clear of their own radius
  — trees at `step: 300` merged into a solid green ceiling.
- **Draw order is layer order.** Canopies before trunks puts bark on top of
  leaves. In the end the park uses a treeline rather than individual trees: at
  this scale a lone canopy on a thin trunk reads as a green cloud, and the
  trunk is usually off the side of the frame anyway.
- **Contrast beats palette.** The kitchen's first draft had a pale floor
  against pale tiles, which read as one surface — you could not see what you
  were allowed to stand on. The ground is deliberately darker than its wall.

Landing raises dust in the theme's colour, and going in the water throws up a
splash. Both are the same few lines of particle: a puff of bits with gravity
and a fading life.

## Sound

There are no audio files, for the same reason there are no image files: the
rest of this repo generates what it needs, and a squeak is a pitch bend and an
envelope. Thirteen voices, built from oscillators and one second of white
noise, in about 200 lines.

Each is a sketch rather than a preset. The squeak is the toy's voice so it
gets two notes and a wobble; a bark is a short band-passed hiss over a
sawtooth growl; a splash is noise with the filter falling through the floor.

Two things browsers make you handle:

- **Nothing may make noise before the page is interacted with.** The context
  is built lazily on the first key or touch.
- **A tab switch suspends the context, and it does not come back on its own.**
  Every play checks and resumes.

Muting is remembered, and `play()` returns whether it actually made a sound,
which is how the test proves the voices synthesise rather than silently
no-op: it counts the audio nodes each one creates.

## Pause

There was no way out of a level but finishing it — and on a phone that meant
no way out at all, since the play view has no address bar to edit. **Esc** or
**P**, or the button in the corner: resume, restart, or back to the level
select.

Pausing lets go of every held key. Otherwise a direction you were holding when
you paused is still held when you come back, and he sets off on his own.

## The game around the levels

`demo/` is the game now, not a demo of one. Opening it gives you a title
screen; levels open in order as you finish them; finishing one offers the
next.

**Picking a level navigates.** `?level=slug` is how the game has always chosen
one, so the flow uses the mechanism that already existed rather than teaching
the game to tear itself down and rebuild mid-session. It also means every
level is still a shareable URL, and the tests that drive a specific level did
not have to change how they start.

The screens are DOM rather than canvas: they want text, buttons and a list,
all of which the browser already does, and it means a finger and a mouse both
work without a second input path.

`shared/progress.js` holds what is finished, in `localStorage`. Every read and
write is guarded — private mode, a full quota and storage switched off all
throw — so a browser that refuses to remember anything still plays, it just
forgets. Levels unlock in order; a level's best kibble and best fetch score
are kept.

### Moving between levels

Switching levels is a page load, so the join is covered from both sides: the
screen fades up before navigating and the next page starts already covered
and fades down. The level's name sits on the cover, which is what turns a cut
into an announcement.

The navigation waits for the fade but not indefinitely. `transitionend` never
arrives if the element is already at the target opacity, or if the tab is in
the background — so a timer runs alongside it and whichever fires first
navigates. Waiting only on the event is how a menu ends up permanently stuck
behind its own curtain.

The cover is `pointer-events: none` whenever it is down, so it can never
swallow a tap once it has faded, and `prefers-reduced-motion` collapses the
crossfade without losing the cover.

### One CSS trap worth knowing

The end-of-level panel is `position: fixed; inset: 0` and starts `hidden`. The
`hidden` attribute sets `display: none` from the browser's own stylesheet,
which a plain `#done { display: flex }` rule beats on specificity — so the
panel stayed live and invisible over the whole viewport, dimming the game and
swallowing every click. It needs `#done[hidden] { display: none !important }`.
A test that clicked a level card found it; nothing errored.

## The Park

The third level, and the first built *for* the mechanics rather than around
them — the vacuum and the thief dog were placed into geometry that already
existed.

It runs 70% of the jump budget, then the stepping stones, then 84%, then
**92%**, then the climb to Ginger. Two robot mowers (the outdoor sibling of
the Roomba — same `patrol`, greener) and two thieving dogs, each on a floor
section with room to be outrun.

An early draft let you drop from a high platform *across* the final water,
which quietly made the climax a 0% jump. `route()` reported the level's
hardest forced jump as 88% instead of 92%, which is exactly the sort of thing
that number is for.

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

| | | measured in-game |
| --- | --- | --- |
| Max jump (hold) | **1.54** | 1.54 |
| Tap jump | 0.64 | |
| Gap at full run | **2.44** | 2.46 |
| Gap using coyote time | 2.72 | 2.97 |
| Gap at walk speed | 1.04 | |
| Onto a ledge +1.0 up | 1.98 | |
| Onto a ledge +1.5 up | 1.42 | |

The right-hand column is a binary search run against the real demo, driving
real key events, so the model is checked rather than trusted. It is accurate
to 0.02 on the flat, and deliberately conservative about coyote time.

**Design to 2.44, not 2.72.** Jumping *after* stepping off the ledge is worth
half a unit, and nothing in the game teaches it. A gap between the two numbers
is one only an experienced player will cross — `route()` reports those
separately as coyote-only.

Rules of thumb: **comfortable gap 1.6–1.8**, **comfortable step up ≤1.0**,
nothing more than 1.5 above the surface that has to reach it, and a landing
platform at least **1.6** wide — his collision box is only 0.44 across, but he
arrives carrying momentum, and a narrow target is as easy to overshoot as to
fall short. A 1.3-wide stepping stone on a descending hop was only landable
from three of eight take-off points.

Both demos derive their constants from `shared/jump.js`, so the editor's arc
is the arc you actually get.

### Checking a level

`Level.route()` walks the level the way a player has to — from the surface
under the spawn, across only the jumps he can make at the lip — and reports
whether the goal is on the far end, the **hardest jump you are forced to
make** as a fraction of the budget, any coyote-only gaps, stranded platforms
and uncollectable pickups. The editor shows all of it live.

That replaces `unreachable()`, which only ever asked whether *something* could
get to each platform. Both shipped levels passed it. One of them could be
completed by holding right for nine seconds; the other could not be completed
at all.

### Play order is authored

Levels carry an `order` field. Alphabetical filenames put the garden before
the kitchen and the lane before the park, which is not a game.

Inserting a level in the middle must not re-lock what someone has already
beaten, so a level stays open if it is finished, or if anything after it is.

The five sit at 87%, 86%, 92%, 92% and 92% of the jump budget at their hardest
forced jump. The first two:

| | Living Room | The Garden |
| --- | --- | --- |
| | 66% | 74% |
| | 74% | stepping stones — rhythm, not reach |
| | **87%** | **92%** |
| | | the climb to Ginger |

They used to peak in the middle, because failing cost the whole level and the
demanding jump should not be the last thing you meet. Checkpoints removed that
constraint.

The last jump in each is deliberately fiddly — it wants a late take-off, and
it lands from about half the moments you could jump from. That is the right
place for it: there is a checkpoint immediately before both.

## The other dog

Three obstacles, three different verbs. The vacuum **shoves** you, a squirrel
takes **Ginger's attention** — this one takes **you**. It trots over, picks
the toy up, carries it back down the level and drops it. No damage, no
distraction: you lose ground.

Like the vacuum it is never lethal, and it must not *become* lethal, so the
carry is clamped to the surface the dog is standing on. That is the only
reason `shared/thief.js` knows about the level at all: it must never set him
down in a pond. Walk into the one in The Garden and it takes him about 1.5
units back — not the full 3.4 it wants, because its own footing runs out
first.

Counterplay is the vacuum's shape again: be somewhere it isn't. It trots at
2.4 against his run of 3.4, so it can be outrun, and it cannot reach him
above its head.

It also respects the grace a checkpoint grants on arrival. Being picked up the
instant you reappear is the same unfairness that grace exists to prevent —
found by the respawn-trap test, which started reporting him in the dog's mouth
rather than on the floor.

### She learned to walk for it

The dog rig had `stand`, `wag`, `sit`, `sit_idle` and `greet` — every one of
them a standing-still animation. A dog that trots across the level with no
gait just slides.

So `trot` is new in `tools/mc/ginger_anim.py`: diagonal pairs, since front-left
swings with hind-right, which is one sine with the sign flipped for the other
pair. The knee and hock fold only on the recovery half of the stride — that is
what stops it looking like a rocking horse — and the body bobs *twice* a cycle
because a foot lands twice. Ginger has it too, for whenever she needs to move.

The other dog is her model, tinted: a cool grey multiplied over the fabric map,
which darkens the coat without flattening its texture. In the three.js demo the
first attempt silently did nothing, because those meshes carry material
*arrays* and `material.clone()` on an array has no `.color` to set.

## Squirrels

A squirrel is no threat to a plush chicken, so making it hurt *him* would be
borrowed from a different game. What a squirrel actually does is take the
dog's attention — so it goes after the one thing the whole level is for.

One turns up behind Ginger every ten seconds or so, sits being interesting for
three and a half, and leaves. **Arrive while she is watching it and there is
no reunion.** She has her back to you. You have to **squeak** to get her
round, from within about three units.

That finally gives `squeak` something to do. It has been in the animation set
and on the button bar since the very beginning as a pure flourish.

She turns to face whatever has her attention, which is the whole tell — in the
sprite demo she is drawn unmirrored, in the three.js one her root yaws round.

### Two things the framing needed

The squirrel perches *behind* her, on the far side from his approach, so she
turns away from the direction he is coming and he never has to walk through
it. That meant widening the living room from 36 to 38 units, because there was
nothing but two and a half units of floor behind her.

The three.js camera frames tighter than the sprite one, so it leans a unit
toward her while she is distracted. Otherwise the game tells you she is
watching a squirrel and the squirrel is off the side of the screen.

## Checkpoints

Falling in water or down a gap used to put him back at the level's spawn, so a
mistake near the end cost the whole level. That shaped two earlier decisions:
both levels put their hardest jump in the *middle* rather than building to
one, and the vacuum had to be harmless, because a lethal obstacle plus a full
rewind is a lot to ask of a toy chicken.

**There is nothing to author.** He checkpoints wherever he is standing safely,
so a level gets this by existing — including the two that already shipped. A
level may still list `checkpoints` explicitly if it wants a guaranteed spot.

A spot counts when there is real ground under him with a clear unit either
side, and no water within reach. The margin is what stops him reappearing on a
lip and walking straight back off it.

### What is deliberately *not* excluded

The stretch a vacuum sweeps. Excluding it reads like the careful thing to do,
and it costs the entire middle of the living room — the patrols there span
nearly their whole floor section, so the level would checkpoint on one side of
its hardest jump and never after it. The vacuum cannot kill him, and the
grace period covers the arrival, so a machine trundling past a checkpoint is
fine.

Coming back grants 1.2 s of immunity, so you are not hit the moment you
arrive, and a ring plays at the arrival point so a respawn reads as something
happening rather than a teleport.

### The test that matters

A checkpoint that kills him again would be worse than the full reset it
replaced. So: stand him at **every** spot he can stand in both levels, kill
him, and check he comes back to solid ground and is still there a second
later. 70 spots, no traps.

Both levels were re-tuned once this landed, so they build to their hardest
jump instead of peaking in the middle. See *What a jump can do*.

## The robot vacuum

Ginger is frightened of the robot vacuum, so one belongs in her living room.
The Garden doesn't get one — a Roomba outdoors would be silly, and it gives
the two levels different characters.

**It isn't lethal.** He's a plush toy, and a vacuum that catches him bats him
back down the room rather than ending his run. That's deliberate: falling in
water still costs the whole level, so anything that killed you would need
checkpoints before it was fair. A knockback needs nothing.

`shared/patrol.js` gives a patrol's position as a **pure function of time**
rather than integrated state, so the two demos can't drift apart and a test
can ask where a machine will be. It sweeps its span, pauses at each end — the
pause is what makes it readable, a moment to see which way it's about to go —
and turns around.

### Three things it took to make a shove feel like a shove

- **Friction scrubbed it off.** The knockback lasted about a tenth of a second
  and moved him a third of a unit, which read as nothing happening. Friction
  is now suspended while he's stunned, and a hit carries him about 2.3 units.
- **It bulldozed him.** Without a moment's immunity after a hit, it caught him
  again the instant the stun ended and pushed him along the floor — into a
  gap, which *is* fatal. There's a 0.75 s grace period now.
- **A shove near a ledge is a death.** Patrols keep `clearance` (1.6 units)
  from the ends of the surface they run on, so being hit can't be the thing
  that drops him.

### The counterplay

Being above it is safe, so you time the gap or jump it. Both are verified:
walking into it gets you hit, jumping past it clears it and lands you beyond.

## Touch controls

`shared/controls.js` mounts a d-pad, a jump button and the action buttons on
touch devices. Rather than giving each demo a second input path, the buttons
dispatch synthetic keyboard events, so the existing `keydown` / `keyup`
handlers pick them up unchanged.

Multi-touch does **not** come for free, which this file learned the hard way.
Every button carried a window-level `pointerup` fallback to clear it if a
thumb slid off — and that fallback did not check *which* pointer had ended,
so lifting any finger anywhere released every held button. Holding a
direction and tapping jump dropped the direction, which is the one thing two
thumbs are for. Each button now records the pointer that pressed it and
ignores the rest; only a `blur`, which has no pointer at all, still releases
unconditionally.

It only mounts where the *primary* pointer is coarse, so a laptop with a
touchscreen keeps its keyboard and its screen space. Add `?touch=1` to any
demo URL to force the pad on for testing.

```js
TouchControls.mount({ actions: [{ code: 'KeyX', label: 'peck' }] });
TouchControls.mount({ container: el, inline: true });  // flows, doesn't float
```

## Ginger

`tools/mc/ginger.py` builds the dog, from photographs, the same way — lofted
tubes along the spine and limbs rather than rigid parts, since a dog is not a
plush toy. She stands about 1.15 units at the shoulder against Mr. Cluckers'
1.0, so she is properly bigger than the toy.

Markings are painted onto faces by position rather than modelled — the white
blaze, chest bib, belly, socks and tail tip, and the dark mask around each
eye — with the boundaries jittered by noise so they read as fur rather than
decals. Because a face is painted whole, the boundary can only be as smooth
as the mesh, which is why her head is deliberately denser than her body.

The eyes are built as almond lenses — a superellipse with the corners pulled
out — stacked rim, iris, pupil and highlight, and seated on the skull surface
just behind the stop so they read from the front as well as in profile.

She waits at each level's goal — sitting until Mr. Cluckers arrives, then
`greet`, then wagging, and then she throws him. Both demos show her: the
canvas one from her sprite sheet, the three.js one from her glTF.

She is rigged and has five clips — `stand`, `wag`, `sit`, `sit_idle` and
`greet` — in `tools/mc/ginger_anim.py`. Her tail is three segments driven
through the same spring solver as Mr. Cluckers' comb, which is what turns a
keyframed sweep into a whip: the tip travels about twice as far as the
keyframes ask.

```
python3 build.py --only ginger
```

The sit poses were **solved numerically**, not eyeballed. Her front legs stay
straight and planted, the body offset is whatever keeps the front paw still
as the body pitches, and the hind angles are the ones that put the stifle
forward alongside her belly with the hock low behind it. Constraining only
the paw — the obvious thing — gave a dog whose knee stuck up behind her.

Reference notes worth keeping, since they were the corrections that mattered:
she is leggier than a pure Staffordshire, front legs about half her shoulder
height, deep-chested with a clear waist tuck, and her tail is long and
whip-like rather than stubby.

## The fetch round

Reaching her is not the end of the level. She throws the toy up, and **you run
Ginger under him** to catch it. Five throws, alternating sides and getting
further out, so the round teaches itself.

### This is the third attempt, and the first two failed the same way

They put you in the air *as the toy*, steering with left/right. Except
left/right changed his **acceleration**, not his position — pressing right did
not move him right, it bent his path. On a flight of about a second that is
not something you can read, let alone aim.

There was also more than one thing to do. Treats to sweep up *or* a ring to
land in, mutually exclusive on some throws, while watching the toy, the
treats, a landing marker and the ring — in 1.24 seconds. Retuning the numbers
twice did not help, because the numbers were not the problem.

So the control is inverted. You move **Ginger**, on the ground, directly:
press right and she goes right. One goal — be under him when he comes down —
and one thing on screen to watch, the ring where he will land. It is the
oldest catching game there is, and it is legible in the second you have.

The landing marker survives from the old version, and it finally means
something: it used to show the consequence of a control you could not feel,
and now it is simply the spot you run to.

### Numbers

| | |
| --- | --- |
| Throws | 5 |
| Hang time | 1.80 s |
| Peak | 3.79 units above her feet |
| Her speed | 4.6 units/s — she covers 8 units in a flight |
| Furthest throw | 5.4 units out |
| Catch radius | 0.78 units, deliberately generous |

Nothing is random: throw N is always throw N, so both demos show the same
round and a test can play it. Doing nothing catches **0 of 5**; running to the
ring catches **5 of 5** — in the sprite demo, the three.js demo, and the rules
stepped alone under Node, all three identical.

A run of catches is worth more than the same number scattered, which is the
only scoring subtlety and does not need explaining to be felt.

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
