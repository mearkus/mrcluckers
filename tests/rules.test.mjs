/* The rules both demos share.
 *
 * These modules exist so that a shove, a seam, or a camera peek is worth the
 * same in the sprite game and the three.js one. They are plain JavaScript with
 * no canvas and no WebGL in them, which is the whole point: the rules can be
 * checked in milliseconds without a browser, and the slow browser tests only
 * have to prove the demos *call* them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// progress.js reads localStorage at require time in a browser; give it one.
globalThis.localStorage = (() => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null),
           setItem: (k, v) => data.set(k, String(v)),
           removeItem: (k) => data.delete(k),
           clear: () => data.clear() };
})();

const require = createRequire(import.meta.url);
const Wear = require('../shared/wear.js');
const Look = require('../shared/look.js');
const Jump = require('../shared/jump.js');
const Level = require('../shared/level.js');
const Progress = require('../shared/progress.js');
const Distraction = require('../shared/distraction.js');
const Theme = require('../shared/theme.js');

/* ---- what a knock costs him ------------------------------------------- */

test('three knocks cost a seam', () => {
  const w = Wear.create();
  assert.equal(w.lives, Wear.CFG.lives);
  w.hit('dog'); w.hit('dog');
  assert.equal(w.wear, 2, 'two knocks should show as two marks');
  assert.equal(w.lives, Wear.CFG.lives, 'two knocks should not cost a seam');
  w.hit('dog');
  assert.equal(w.lives, Wear.CFG.lives - 1, 'the third knock costs a seam');
  assert.equal(w.wear, 0, 'and the marks go with it');
  assert.equal(w.taken, 3, 'but the knock still counts on the results line');
});

test('nine knocks is the end of the level', () => {
  const w = Wear.create();
  let out = null;
  for (let i = 0; i < 9; i++) out = w.hit('vacuum');
  assert.ok(out && out.out, 'the ninth knock should report the last seam gone');
  assert.equal(w.spent, Wear.CFG.lives);
});

test('every knock is attributed to something', () => {
  const w = Wear.create();
  w.hit('wildlife'); w.hit('vacuum'); w.hit('dog'); w.hit();
  const total = Object.values(w.by).reduce((n, v) => n + v, 0);
  assert.equal(w.taken, 4);
  assert.equal(total, w.taken,
    'the breakdown must sum to the total -- a knock with no source still ' +
    'needs a bucket, or the end screen quietly loses it');
});

test('the first lost seam asks to be explained', () => {
  const w = Wear.create();
  w.hit('dog'); w.hit('dog'); w.hit('dog');
  assert.ok(w.said > 0, 'losing the first seam should start the note');
  w.update(Wear.CFG.explain + 0.1);
  assert.equal(w.said, 0, 'and it should time out on its own');
  w.hit('dog'); w.hit('dog'); w.hit('dog');
  assert.equal(w.said, 0, 'the second seam does not need explaining again');
});

test('the kibble mends him', () => {
  const w = Wear.create();
  w.hit('dog'); w.hit('dog');
  assert.equal(w.wear, 2);
  for (let i = 0; i < Wear.CFG.perMend; i++) w.feed();
  assert.ok(w.wear < 2, `${Wear.CFG.perMend} kibble should take a mark off`);
});

/* ---- what a run carries ------------------------------------------------ */

test('damage carries between levels but seams do not', () => {
  const w = Wear.create({ scars: 4 });
  assert.equal(w.lives, Wear.CFG.lives,
    'a new level must hand him a full set of seams however worn he is');
  assert.equal(w.showScars(), 4, 'and he should still look worn');
});

test('a knock leaves something that does not wash out', () => {
  const w = Wear.create();
  w.hit('dog');
  assert.equal(w.wear, 1, 'it shows as a fresh mark');
  assert.equal(w.scars, 1, 'and it goes on the run tally');
  // Fresh marks are drawn separately, so they are not drawn twice.
  assert.equal(w.showScars(), 0);
  w.hit('dog'); w.hit('dog');
  assert.equal(w.wear, 0, 'the seam went, so nothing is fresh');
  assert.equal(w.showScars(), 3, 'but all three knocks still show');
});

test('carried damage never costs a seam', () => {
  // The whole reason it is cosmetic: 65 kibble in a run buy 16 mends against
  // 63 marks the seams forgive, so charging for carried damage would make the
  // back half of a run harder than the front by an amount nobody chose.
  const worn = Wear.create({ scars: 20 });
  worn.hit('dog'); worn.hit('dog');
  assert.equal(worn.lives, Wear.CFG.lives,
    'two knocks must cost the same whether he is fresh or filthy');
});

test('the marks he can show are capped', () => {
  const w = Wear.create({ scars: 500 });
  assert.equal(w.showScars(), Wear.SCARS.length,
    'there are only so many places to put one');
});

test('kibble is never wasted once he has a history', () => {
  const w = Wear.create({ scars: 3 });
  for (let i = 0; i < Wear.CFG.perMend; i++) w.feed();
  assert.equal(w.scars, 2,
    'with nothing fresh to fix, a mend should take an old mark off');
});

test('both demos are given the same places to draw', () => {
  // These used to be two copies of the same numbers, one per demo.
  assert.equal(Wear.MARKS.length, Wear.CFG.perLife - 1,
    'there is one fresh mark per knock a seam can take, less the one that ' +
    'spends it');
  for (const m of [...Wear.MARKS, ...Wear.SCARS]) {
    for (const k of ['x', 'y', 's', 'a']) {
      assert.equal(typeof m[k], 'number', `a mark is missing ${k}`);
    }
  }
});

/* ---- looking before you drop ------------------------------------------ */

/* Stepped by hand at a fixed 60fps, so these are the actual eased curve
 * rather than whatever the wall clock happened to do. */
const step = (look, seconds, world) => {
  for (let t = 0; t < seconds; t += 1 / 60) look.update(1 / 60, world);
  return look.offset;
};
const LEDGE = { held: true, onGround: true, vx: 0, y: 4 };

test('holding down on a ledge looks down, after a beat', () => {
  assert.equal(step(Look.create(), 0.2, LEDGE), 0,
    'a tap that crouches must not also move the camera');
  assert.ok(step(Look.create(), 1.0, LEDGE) > Look.CFG.drop * 0.9,
    'holding it should reach nearly the full drop within a second');
});

test('the view comes back when you let go', () => {
  const look = Look.create();
  step(look, 1.0, LEDGE);
  assert.ok(step(look, 0.8, { ...LEDGE, held: false }) < 0.1,
    'the offset should ease back to nothing');
});

test('the camera stays put when you did not ask it to move', () => {
  for (const [why, world] of [
    ['while walking', { ...LEDGE, vx: 2 }],
    ['in mid-air', { ...LEDGE, onGround: false }],
    ['on the ground storey', { ...LEDGE, y: 0 }]
  ]) {
    assert.equal(step(Look.create(), 1.0, world), 0,
      `the view should not slide ${why}`);
  }
});

/* ---- who closed the distance ------------------------------------------- */

/* Reported from a real playthrough: "the birds are brutal. Mid jump they will
 * attack and there is nothing you can do."
 *
 * A bird is put up either by being crowded or by being crowed at, and only
 * the first shoves him. The rule is that the shove needs him to have closed
 * the distance himself, on his feet -- measured against the critter's
 * position now, so what is left is his own contribution. */
const PERCH = { x: 10, y: 3, kind: 'bird' };
const DT = 1 / 60;

/** Run a bird against a scripted player and count the shoves. */
function shoves(at, seconds = 6) {
  const f = Distraction.flock({ critters: [PERCH], pickups: [], dog: null });
  let n = 0;
  for (let t = 0; t < seconds; t += DT) {
    f.update(DT, at(t));
    n += f.knocks().length;
  }
  return n;
}

test('a bird that flies into him does not shove him', () => {
  // He stands still. Whatever the bird does, he had no say in it.
  assert.equal(
    shoves(() => ({ x: PERCH.x + 0.6, y: PERCH.y - 0.5, onGround: true }), 40),
    0, 'standing still must never cost a knock');
});

test('a bird cannot shove him out of a jump', () => {
  // Sweeping through the box, airborne the whole way.
  assert.equal(
    shoves((t) => ({ x: PERCH.x - 1.6 + t * 2, y: PERCH.y, onGround: false })),
    0, 'an arc cannot be called off once he is on it');
});

test('walking into a perched bird still costs him', () => {
  // The counterplay is to crow at it from outside the box first; this is what
  // happens when you do not. If this ever reads 0 the birds have no teeth.
  const hit = shoves((t) => ({
    x: t < 2 ? PERCH.x - 3.2 : PERCH.x + 0.4, y: PERCH.y, onGround: true
  }));
  assert.ok(hit > 0, 'a bird you walk into should still put itself up in your face');
});

test('crowing at one is safe from anywhere', () => {
  const f = Distraction.flock({ critters: [PERCH], pickups: [], dog: null });
  for (let t = 0; t < 2; t += DT) f.update(DT, { x: PERCH.x - 5, y: PERCH.y, onGround: true });
  f.knocks();
  f.scare(PERCH.x - 5, PERCH.y);
  assert.equal(f.knocks().length, 0,
    'shouting at a bird from across the room must never shove him -- that is ' +
    'the whole reason to own a crow');
});

/* ---- a level can be tall ------------------------------------------------ */

/* A backdrop layer is one row at a fixed height above the floor, which is all
 * a level three heights tall ever needed. Climb a tall one and every row is
 * below you and the screen is the flat sky colour -- the art runs out. `tile`
 * is what carries a layer upward, so every theme needs at least one. */

test('every theme has something above the first storey', () => {
  for (const name of Theme.names()) {
    const t = Theme.get(name);
    const tiled = t.layers.filter((L) => L.tile > 0);
    assert.ok(tiled.length > 0,
      `the ${name} theme has no layer that repeats upward, so a tall level ` +
      `in it is a flat field of ${t.sky[0]} above its top row`);
  }
});

test('a repeat is spaced sensibly', () => {
  // The first version of this asserted that a repeat had to be at least as
  // tall as its spacing, so that the layer was continuous. That is true of a
  // plank wall and false of a picture rail, which is supposed to have wall
  // between the rails -- the test failed on exactly the layer that was
  // right. What is actually true is narrower.
  const SCREEN = 510;    // about MAX_VIEW_H, in the world pixels layers use
  for (const name of Theme.names()) {
    for (const L of Theme.get(name).layers) {
      if (!L.tile) continue;
      const height = L.kind === 'blobs' ? (L.ry || 70) * 2 : (L.h || 60);
      assert.ok(L.tile >= height,
        `${name}: a ${L.kind} ${height}px tall repeating every ${L.tile}px ` +
        `overlaps itself, which is overdraw for no picture`);
      assert.ok(L.tile <= SCREEN,
        `${name}: repeats ${L.tile}px apart are further than a screenful, ` +
        `so there are places between them where the layer is not there`);
    }
  }
});

test('only blobs float, and floating ones are up in the sky', () => {
  for (const name of Theme.names()) {
    for (const L of Theme.get(name).layers) {
      if (!L.float) continue;
      assert.equal(L.kind, 'blobs',
        `${name}: float only means anything to a blobs layer`);
      // Authored in world pixels, negative being up. A "floating" thing at
      // ground level is a hill that has been mislabelled.
      assert.ok((L.y || 0) < -100,
        `${name}: a floating layer at y ${L.y} is not in the sky`);
    }
  }
});

/* ---- the movement budget ---------------------------------------------- */

test('the jump budget is what the levels were authored against', () => {
  assert.equal(Jump.C.JUMP_VELOCITY, 8.8);
  assert.equal(Jump.C.GRAVITY, 24.0);
  // The analytic apex is v^2/2g = 1.613, but maxHeight() is the peak of the
  // *sampled* arc, which steps past the top and lands a little under. That
  // lower number is the one the level checker measures against.
  assert.ok(Math.abs(Jump.maxHeight() - 1.540) < 0.005,
    `the reachable apex moved to ${Jump.maxHeight().toFixed(3)}`);
  // How far he carries a given rise -- the numbers a level is drawn against.
  assert.ok(Math.abs(Jump.reach(0) - 2.437) < 0.02, 'flat gap');
  assert.ok(Math.abs(Jump.reach(1.0) - 1.983) < 0.02, 'a one-unit step up');
});

test('a ledge above the apex is not jumpable', () => {
  const from = { x: 0, y: 0, w: 2 };
  const over = { x: 2.2, y: Jump.maxHeight() + 0.4, w: 2 };
  assert.equal(Level.hop(from, over).ok, false,
    'nothing above the apex should read as reachable');
});

/* ---- what the run remembers ------------------------------------------- */

test('the run remembers how worn he is, and a reset forgets', () => {
  Progress.reset();
  assert.equal(Progress.scars(), 0, 'a fresh run starts unmarked');
  Progress.complete('the-kitchen', { kibble: 5, scars: 3 });
  assert.equal(Progress.scars(), 3);
  Progress.complete('the-shed', { kibble: 2, scars: 6 });
  assert.equal(Progress.scars(), 6, 'the latest wins -- it is a state, not a score');
  Progress.reset();
  assert.equal(Progress.scars(), 0);
});

test('progress keeps the best of each level, not the latest', () => {
  Progress.reset();
  Progress.complete('the-shed', { kibble: 3, seams: 1, pickups: 2 });
  Progress.complete('the-shed', { kibble: 1, seams: 3, pickups: 0 });
  const best = Progress.statsFor('the-shed');
  assert.equal(best.kibble, 3, 'a worse run must not erase a better one');
  assert.equal(best.seams, 3, 'and the best seam count is the one kept');
  assert.ok(Progress.isDone('the-shed'));
  Progress.reset();
});
