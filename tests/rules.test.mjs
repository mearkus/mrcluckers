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
