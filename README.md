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
| `shared/wear.js` | What a knock costs him: marks, seams, when the level starts over, and what the kibble mends. |
| `shared/distraction.js` | Wildlife: what it takes, and how you stop it. |
| `shared/thief.js` | The other dog at the park, and what it does with the toy. |
| `shared/progress.js` | Which levels are finished, and what that opens up. |
| `shared/sound.js` | Every sound in the game, synthesised on the spot. |
| `shared/music.js` | The room tone: a bed per theme, generated, riding the same context. |
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

**`index.html` — the game, at the site root.** Sprites on a 2D canvas; open it
directly in a browser, no server needed. Its code is in `demo/`: `shell.js` is
the title screen and level select, and `game.js` is meant to be read as much
as played — `Anim` handles frame timing, `pickState` is the animation state
machine, and the draw call shows how to use the anchor so the sprite's feet
land on the floor.

**`web/index.html` — the live 3D model in three.js.** An orthographic camera
locked to the same side-on angle as the sprites, so it looks like the sheet
but animates continuously and lights dynamically. It plays the same levels as
the canvas demo, with the same themes, platform kinds, props and rideable
machines — the two read the same files and the same shared rules, so a level
is the same place in either. Needs a local server because browsers block
module and glTF loads over `file://`:

### It is the same *game*, not just the same level

For a long time it was not. The 3D demo had every rule the sprite demo had
and none of the things around them: no sound at all, no way to stop, and
finishing a level counted for nothing. It read as a tech preview of a game
rather than as the game.

All three were already written and already shared, so this was wiring rather
than invention:

| | |
| --- | --- |
| **Sound** | `shared/sound.js`, the same voices at the same moments — jump, land, splash, kibble, the vacuum's shove, the other dog taking him, both flourishes, and the whole fetch round. Plus the mute button, and the unlock every browser insists on before a page may make noise. And `shared/music.js` under it, so both demos sit in the same room. |
| **Pause** | <kbd>Esc</kbd> or the button: resume, restart, or out to the level select. The loop stops advancing but keeps drawing, so the frozen frame is the one you paused on. |
| **Progress** | `shared/progress.js`, the same store under the same key — so finishing The Living Room *here* unlocks The Kitchen over *there*. |

Two things the wiring turned up. `.panel { display: grid }` outranks the
browser's own rule for `[hidden]`, so both panels sat invisible over the whole
screen eating every click — the sprite demo had already met this one and
carries a `[hidden] { display: none !important }` guard, which this now has
too. And the on-screen pad dispatches *real* key events, so guarding the
keyboard handler covers touch as well; the pad also hides itself while a panel
is up, so a panel is the only thing there is to touch.

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

A layer with `"front": true` is drawn **over** the player rather than behind
him — grass he wades through, the near floorboards, a kerb he passes behind.
One flat backdrop cannot give a scene depth; a couple of things nearer than
he is can.

Layers are described in world pixels and drawn in screen space, so `speed` is
how much of the camera's motion a layer takes: 0 is painted on the far wall, 1
moves with the floor. The six levels get a room, a kitchen, a shed, a garden, a park and a lane at dusk,
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

## The room tone

Every sound in the game was a one-shot: a squeak, a thud, a splash. Between
them the levels were silent, which made six rooms with six palettes sound
like one empty room.

`shared/music.js` generates a bed for each, no files and nothing to download.
A room is a key, a tempo, sixteen eighth-notes of melody and one bar of bass,
and the line drifts a little on every pass so it never settles into a loop you
start counting. The notes come out of a **pentatonic** scale, which is the
trick that makes a wandering line safe: there is no interval in one that can
clash, so it cannot wander into a wrong note.

| | |
| --- | --- |
| **Living Room** | 76 bpm, F major — warm, slow, close to a music box. |
| **The Kitchen** | 96 bpm, G major, an octave up — tiled, brighter, faintly clockwork. |
| **The Garden** | 84 bpm, E major — open and unhurried. |
| **The Park** | 104 bpm, D major — the widest level, so the most going on. |
| **The Lane** | 72 bpm, D minor — dusk, going home, and a little sad. |

### The floor under it

The first version was the melody alone, and measured it was **silent two
thirds of the time** — which is a pause, not a place. So the root and its fifth
hold underneath continuously, low-passed to 340 Hz and detuned a hair against
each other, with a 0.07 Hz swell on the gain so the pair never sits still
enough to notice. That is what makes it a room rather than a tune; the notes
on top are decoration.

It rides `shared/sound.js`'s context and its mute, so there is one volume, one
switch and one thing browsers have to unlock — and it peaks around 0.02 against
effects an order of magnitude louder, which is the whole idea. It stops when
the game does: a bed playing under a pause panel is the one place it stops
reading as the room and starts reading as a track.


## Pause

There was no way out of a level but finishing it — and on a phone that meant
no way out at all, since the play view has no address bar to edit. **Esc** or
**P**, or the button in the corner: resume, restart, or back to the level
select.

Pausing lets go of every held key. Otherwise a direction you were holding when
you paused is still held when you come back, and he sets off on his own.

## The game around the levels

The game is the site root now, not a demo of one parked under `/demo/`. The
address you hand someone is the title screen; levels open in order as you
finish them; finishing one offers the next. Everything that is *about* the
game rather than the game — the model, the sheets, the editor, the assets —
moved down to `/admin/`, reachable from a line of text at the foot of the
title screen rather than a fourth button in a menu that is deliberately
short.

Moving the page up a directory is not just a `git mv`: paths a script builds
at run time resolve against the **document**, not against the script that
built them. The key art in `shell.js` and both sprite sheets in `game.js` were
written `../assets/...`, which from the root points above the site. A test
that only checked the page loaded would have passed while the title screen had
no art on it.

`/demo/` itself is now a redirect to the root, so an address someone
bookmarked on their phone still lands on the game.

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

### The end

Beating every level used to change nothing. The title screen still said *"Ginger's
favourite toy has a long way to go. Get him home"* — he was home — and the
button still offered to **Continue** a game with nothing left in it. Five
levels and no ending is a demo.

So the title screen notices. With every level finished the tagline says he made
it, the primary action becomes **Play again** from the Living Room rather than
Continue into a level already beaten, a wax-seal badge is pinned to the corner
of the key art, and the whole run is added up underneath in one line — kibble
found, points at fetch, and seams kept out of the three he starts each level
with.

`Progress.tally(order)` does the adding, over the same best-of records the
level cards read, so the total is the one you can point at rather than a
second score kept somewhere else. The last level's panel gets the same line
and a way out to the title, because a panel whose only exit is the level list
reads as a level ending rather than as the game ending.

Both demos, and one wrinkle worth knowing: `location.href = ""` resolves
against the *current* URL, query string and all, so leaving a level for the
title with an empty href drops you straight back into the level you just
finished. The root is `"?"`.

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

## The Shed

The five levels asked the same question five times: walk right, time the gaps,
don't fall in. The Shed asks a different one. It is **22 units wide and five
high** — every other level is 40 to 64 wide and tops out at 3.3 — and the way
out is up: a stack of seed crates, three shelf brackets, and a loft with Ginger
on it.

It sits third, between The Kitchen and The Garden. `route()` puts its hardest
forced jump at 76%, which drops it neatly into the ladder — 66, 74, **76**, 82,
87, 92 — and it is where the story wants it too: he goes out of the kitchen
window, lands in the shed, and has to climb out to reach the garden.

**The wildlife is the level, not a tax on it.** A squirrel sits on the lip of
the loft with `drops: 1.7`, raining acorns down the shaft onto the two shelves
below it, and a bird perches in the gap you have to cross at three heights. On
the flat a shove costs you a stumble; at four heights up it costs you the
climb, so the same critters that were an irritation elsewhere are the whole
problem here.

### The camera had a ceiling

The vertical camera was clamped at a flat `-150` — a little over two character
heights above the ground, which was plenty while the tallest thing in the game
was 3.3. Measured on the new level, he jumped off the loft and **left the top
of the screen** while the camera sat at its stop.

So the ceiling comes from the level instead: high enough to hold its tallest
platform, the apex of a jump from there, his own height and a margin.

```js
Math.min(-150, LEVEL.ground - (tallest + 1.61 + 1.6) * PX)
```

The `min` is the important half — it can only ever be *more* generous than the
old constant, so every level that stays near the ground is framed exactly as it
was. Existing levels compute a ceiling of -73 and keep -150; The Shed gets
-208. The three.js camera never had a clamp, so it needed nothing.

The test that found it stands him on every platform in the level and at the
apex of a jump from each, at three screen sizes, and checks his head and feet
are both still on the canvas. It also found a bug in itself first: reading the
camera in the same frame that moved him measures where the camera was for the
*previous* sample, which fails only on the small canvases, where there is no
headroom to absorb a frame of lag.

## Designing levels

Levels live in `levels/*.json`, authored **once** and read by both demos and
the editor. Coordinates are world units — 1 unit is Mr. Cluckers' height —
with **Y up** and the ground's top surface at `y = 0`. A platform's `y` is its
top surface, the edge that matters for landing.

There is no fixed ceiling: the sprite demo's camera derives how far it may rise
from the tallest platform in the level, so a level can climb as well as run.
See *The Shed*.

```json
{
  "name": "Living Room",
  "width": 33,
  "spawn": { "x": 1.5, "y": 0 },
  "goal":  { "x": 30.5, "y": 0 },
  "platforms": [ { "x": 4, "y": 1, "w": 2.5, "h": 0.9, "kind": "soft" } ],
  "props":     [ { "x": 7.4, "y": 0, "kind": "lamp" } ],
  "critters":  [ { "x": 7.0, "y": 3.75, "kind": "bird", "linger": 7 } ],
  "pickups":   [ { "x": 5.25, "y": 1.6 } ],
  "hazards":   [ { "x": 10, "y": 0, "w": 2.5, "h": 0.4, "kind": "water" } ]
}
```

A platform's `kind` says what **shape** it is; the theme says what it is made
of there. The same `soft` platform is a sofa in the living room, a hedge in
the lane and a bush in the park:

| | |
| --- | --- |
| `ledge` | ground, walls, shelves — the default, and everything structural |
| `slab` | a top on legs, with daylight under it — table, worktop, bench |
| `soft` | rounded and tufted — sofa, cushion, hedge, bush |
| `crate` | planked and braced — toy box, pallet, seed tray |
| `pipe` | a rounded bar — radiator, rail, kerb, fallen log |

`props` are scenery: never collided with, never scored, and drawn behind the
platforms unless you set `"front": true`. They carry their own colours,
because a pot plant is a pot plant wherever it stands: `plant`, `lamp`,
`bowl`, `ball`, `tree`, `flowers`, `bin`, `post`. `scale` and `flip` stop a
row of them looking stamped.

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

In play order the six sit at 66%, 74%, 76%, 82%, 87% and 92% of the jump
budget at their hardest forced jump — a ladder, rather than six levels that
all peak in the same place. Two of them in detail:

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

Three obstacles, three different verbs. The vacuum **shoves** you, wildlife
takes **your kibble and Ginger's attention** — this one takes **you**. It trots over, picks
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

## Squirrels and birds

A squirrel is no threat to a plush chicken, so making it *attack* him would be
borrowed from a different game. What a squirrel actually does is **take
things**, and **knock things down** — and a level says which by saying where
it sits.

Critters are authored as perches, in world units, next to the platforms:

```json
"critters": [
  { "x": 16.9, "y": 2.1, "kind": "squirrel", "linger": 7, "period": 9 },
  { "x": 46.35, "y": 0, "kind": "squirrel" }
]
```

Anything a kind sets can be overridden on a perch, which is how a guard that
sits there nearly all the time differs from one that only flickers past.

### A perch near her takes her attention

One perched within about four units of Ginger goes after the one thing the
whole level is for. **Arrive while she is watching it and there is no
reunion.** She has her back to you, and you have to **squeak** to get her
round, from within about three units.

That finally gives `squeak` something to do. It has been in the animation set
and on the button bar since the very beginning as a pure flourish.

She turns to face whatever has her attention, which is the whole tell — in the
sprite demo she is drawn unmirrored, in the three.js one her root yaws round.
Exactly one perch per level is inside her notice: one squeak is a verb, two
in a row is a chore.

### A perch near a kibble takes the kibble

Every other perch sits over a pickup. Come within about three units — near
enough that it is on your screen — and the critter starts eyeing it: the
kibble shakes and a ring closes round it. Let the ring close and the critter
**leaves with it**, and that kibble is out of the level for the rest of the
run.

Three units is not an arbitrary number. Both demos show about five units
across, so a theft started further out than that would be a tax collected off
screen rather than a race you were offered.

### They have to reach *him*, not just his things

Taking her attention and taking a kibble both happen beside him rather than to
him, and for a while that was all they did: you could walk straight through a
critter. A thing you cannot touch and that cannot touch you is scenery with a
scoreboard, however carefully it is simulated.

So each kind reaches him in the way that kind actually would.

**A bird sits on the ledge you were going to land on.** Come up onto it and it
goes off in your face — a shove of the same shape as the vacuum's, never
lethal, but perfectly able to put you somewhere that is. The counterplay is
the verb you already own: **crow at it from across the gap and the ledge is
clear before you jump.** That is the whole argument for `crow` existing, and
it is why the bird guards came *down* out of the air onto their ledges; they
used to hover out of reach where nothing could ever disturb them.

**A squirrel sits above the path and knocks things down.** It will not come
down and fight a plush rooster, but it will drop acorns on one, which is both
truer and more use to a platformer. It only bothers while you are actually
under it, and the counterplay is legs: get up to its level and it bolts.

That last rule forced a real correction. "Close enough to put it up" was a
**circle**, so a squirrel a metre and a half above the path was startled by
you simply walking underneath — a dropper could never drop. It is a **box**
now: sideways is what crowds a critter, and being a body-length below it is
not. The same predicate decides whether one will come back, or a critter gets
locked out of a perch you were never close enough to move it from.

### Two kinds, two answers

A **bird** perches above the kibble, out of reach, and the only thing that
moves it is a **crow** — which puts up every bird within about three units,
ending the visit and any theft halfway through it. That gives `crow` something
to do, which was the other button that never meant anything.

A **squirrel** sits where you can get at it, ignores shouting entirely (as in
life), and bolts when you come within a couple of units. So the two are
genuinely different problems: a bird is a button you press the moment you see
it, a squirrel is a race you have to win with your legs.

The outdoor levels mix both, which is what teaches the difference. The living
room and the kitchen are birds throughout, so `crow` is taught before there is
anything it does not work on.

### Nothing vanishes

The first version of this switched a critter off the moment you startled it —
one frame perched, the next frame not there. From the other side of the screen
that reads as a bug, not as a squirrel.

So being put up is a **departure**, not a deletion. It is dropped straight
into the leaving leg of its visit and runs that leg at about twice speed, with
a hop or a lift on the way out, and it goes **away from whatever startled it**
rather than back the way it came — otherwise it leaves through you. That is
about 0.45 seconds of squirrel bounding off the ledge and 0.3 of bird getting
off a branch, which is short but is a thing you watch happen.

Two things had to go with it. The hurry stops the moment it is off screen: at
first it carried into the gap between visits as well, so a guard with a
seven-second linger was back within a second of being put up — a strobe, not a
squirrel. And one that has been put up stays away *longer* than one that
simply finished its visit, and does not come back at all while you are stood
on its perch, or it would arrive into you and be put up again on the frame it
landed.

### Two things the framing needed

The critter beside Ginger perches on the far side from his approach, so she
turns away from the direction he is coming and he never has to walk through
it. That meant widening the living room from 36 to 38 units, because there was
nothing but two and a half units of floor behind her.

The three.js camera frames tighter than the sprite one, so it leans a unit
toward her while she is distracted. Otherwise the game tells you she is
watching a squirrel and the squirrel is off the side of the screen. A bird
needs the same treatment vertically, and how far above her it perches is
authored per level, so the lift follows the perch rather than a constant.

A bird guarding a kibble sits about 0.85 units above it. At 1.2 it was on the
top edge of the frame when you were standing on the ledge below, which is the
one place you are certain to be looking from.

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

## Wear and seams

Every knock in the game was survivable and forgettable. The vacuum shoved him,
a bird went up in his face, an acorn came off a branch — and a second later
there was nothing to show for any of it. Three obstacles, no consequences, and
a plush toy that came out of the whole game as clean as he went in.

`shared/wear.js` counts what they cost. **A hit leaves a mark. Three marks and
a seam goes**, which costs a life: he is patched up, and he carries on from the
last place he stood safely. Run out of the three seams and the level starts
again — with the kibble you have already found still yours, because losing
your collection to a bad run is exactly what checkpoints exist to prevent.

Nothing in the module draws. It counts, and each demo puts its own stuffing on
him, so a plush chicken cannot be scruffier in one than in the other:

| | |
| --- | --- |
| **Sprite demo** | Painted inside his own transform, so the marks ride the sprite: a split seam, its threads, a smudge, and two lobes of stuffing bulging out of the line. Measured against **his** height, not the sprite cell — the cell is 96 px for a character 72.73 tall, and cell units put the marks a third too big and outside his outline, where they read as bubbles. |
| **three.js demo** | He is one solid mesh, so the same marks are a camera-facing sprite riding his root. Sprites never turn, so they are mirrored by hand when he does. |

A lost seam is loud on purpose — a burst of stuffing, and a row of bright red
stitches that fades over the next second or so. Without it, three knocks and a
respawn read as one bad knock, and you would never learn what the count was.

The HUD carries the count as **seams**, filled and empty. Lives as stitched
hearts is a different game's furniture; he is a toy, and what he has left is
seams.

### The kibble patches him up

Collecting was worth something only after the level: kibble bought throws in
the fetch round, and until then it was a number going up. Now **every fourth
kibble goes into the split** — a whole seam back if one has gone, otherwise the
most recent mark rubbed out. If he is whole there is nothing to fix and it just
counts for her.

That is the point of it. He wants to please her, and the kibble in the awkward
corner now pays for the knock it costs to go and get it, *during* the level
rather than on the results screen. A plush toy full of dog food is the joke the
game was already making.

Nothing said so, though, so the rule could only be learnt by accident. The HUD
now says it once — while he is carrying damage and there is still kibble to
find, and never again after the first mend, because by then you have watched it
happen.

Four is deliberate. The levels carry eight to thirteen kibble, so a careful run
can buy back two seams and no run can buy back more than it can lose.

### What the run was worth

The end-of-level panel used to report kibble and the fetch score. Finishing
with every seam intact — the thing the wear made you work for — vanished the
moment the level ended, which left the seams as a cost with nothing to show for
keeping them. They are now on the results line and on the level card, and
`shared/progress.js` keeps the best of them like everything else.

It records the seams he **kept**, not the seams in his hand at the end: running
out patches him back up to three, so the HUD's number cannot tell a clean run
from a disaster. `lives - spent` can.

## Falling in is a beat, not a cut

The camera is worked out straight from where he is. So putting him back after
a fall moved the entire view in one frame: you went in the water and arrived
somewhere else, mid-stride, with nothing in between. It read as being
teleported rather than as being fished out — and the destination was right the
whole time, which is why it took so long to notice the problem was the *cut*.

So the swap happens behind a dip. He goes under first, the screen closes, he
is set down while nothing can be seen, and it opens on him back on solid
ground. About nine tenths of a second, in three parts:

| | |
| --- | --- |
| **Under** | 0.34 s. He sinks — less far in water than down a gap, because water has something to sink *through* — and the screen closes over him. |
| **Dark** | 0.16 s. The swap. The camera goes with him, since eased it would spend the whole opening sliding across the level. |
| **Open** | 0.42 s. Back on solid ground, with the checkpoint's grace already running. |

The recovery owns the frame: he is not steerable, nothing can reach him, and
the level carries on around it. Same rules and same destination as before — it
just has a shape now.

`prefers-reduced-motion` gets the same bargain the page's cover strikes: it
still wants the dip, because the dip is what stops the swap being a cut. It
just doesn't want him dragged down the screen on the way into it, so the
sinking is dropped and the fade stays.

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
Ginger under him** to catch it.

### This is the third attempt at the control, and the first two failed the same way

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

### The round itself was the second thing that had to be rethought

The control was settled and the round was not. It threw five times from a
fixed list of aims: every throw the same height, the same 1.8 seconds in the
air, in the same order, in every level. It read well the first time and was
over by the third — nothing changed, nothing escalated, and there was nothing
to do but hold a direction.

Three things vary now.

**The throw.** A *lob* hangs, a *flick* is low and quickly over, a *high* one
goes up forever and lands a long way out — so the rhythm changes and not just
the distance. Where it lands is picked from where she is standing and how far
she can actually cover in the time that throw gives her, so every throw is
reachable and none of them is free. The first two are plain lobs; the round
should teach itself before it starts varying.

**The other dog.** From the third throw it turns up and runs for the same
spot. Early on it is timed to arrive *after* the toy; by the end of the round
it arrives before it. Two answers, and they are the two the level teaches:
be standing on the spot first — she wins a tie, so holding your ground works
— or **crow** at it, which stops it dead for a moment, once per throw. Crowing
is the safe play and standing your ground is the brave one, and the score says
which you took: a catch with the other dog still breathing down her neck is
worth an extra point.

**What he brought her.** Kibble was a number on a results screen and nothing
else, which made losing one to a squirrel free. It buys **throws** now — four
kibble to the throw, up to three — so the point of the level pays out in more
fetch rather than a bigger number, and a squirrel that took one has taken
something you can feel. He wants to please her; what he arrives with is the
measure of it. The same kibble also patches him up on the way — see *Wear and
seams* — so one pickup pays twice and a squirrel costs you twice.

**The length.** Five throws, plus what he brought, and a run of three or more
earns another, up to two. A good round lasts longer than a poor one, which is the cheapest
possible reason to keep playing well — and it stays short enough to be a
coda rather than a second level.

### It stays on the floor now

Her patch is up to 12.4 units wide and it used to be centred on her, which in
a level whose goal is two and a half units from the right-hand wall put her,
the toy and the other dog out past the end of the floor — standing on nothing,
at the far edge of a frame that was mostly sky. Sliding it inside the level's
*width* is not enough either: three levels have a water gap before
their last ledge, so a patch that fits the level still walked her across it.

So `Level.footing(level, at)` answers the actual question — the run of floor
under a point, extended through anything butted up against it at the same
height, and ended by a hazard or a drop — and the round lays its patch inside
that:

| | floor at the goal | her patch |
| --- | --- | --- |
| Living Room | 26.3 – 41.2 | 28.8 – 41.2 |
| The Garden | 35.4 – 47.2 | 35.4 – 47.2 |
| The Kitchen | 28.1 – 39.2 | 28.1 – 39.2 |
| The Lane | 54.6 – 63.2 | 54.6 – 63.2 |
| The Park | 48.2 – 57.2 | 48.2 – 57.2 |

The round is a little tighter where the last ledge is short, which is the
right answer rather than a compromise: the throws are measured against how far
she can get, not against a fixed distance, so a narrow patch is a shorter
round and not an unfair one. The other dog waits just outside the patch
instead of wherever its run-up happened to start, and runs whatever pace that
leaves it.

Both demos hand the round its ends in their own bonus coordinates — the sprite
demo counts from the goal, the three.js one from the level's origin — and the
framing asks the round where it went rather than asking the config how wide it
could be.

### Numbers

| | |
| --- | --- |
| Throws | 5, plus up to 3 bought with kibble, plus up to 2 earned |
| Hang time | 1.20 s (flick), 1.80 s (lob), 2.00 s (high) |
| Peak | 4.45 units above her feet, on the high one |
| Her speed | 4.6 units/s |
| Furthest throw | as far as she can get in the time — about 9 units on a high one |
| Catch radius | 0.78 units, deliberately generous |
| The other dog | from the third throw on, at whatever pace covers its run-up in the time it has, capped at 6.2 units/s |

The variety is **seeded, not random**. `Bonus.create({ seed })` plays the same
round every time, so a test can replay one and both demos can be handed the
same round to compare; a round created without a seed is a different round
each time, which is the point. Stepped alone under Node, a perfect chase
catches every throw and earns the full eight; standing still catches none of
its five and loses three of them to the other dog. A player with a 0.3-second
reaction and half a unit of slop averages 5.8 catches from 7.5 throws, losing
1.6 to the other dog — which is about the shape a bonus round should have.

A run of catches is worth more than the same number scattered, which is the
only other scoring subtlety and does not need explaining to be felt.

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
