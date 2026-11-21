/* Every level has to be finishable.
 *
 * shared/level.js already knows how to answer that -- `route()` walks the
 * surfaces with the jump budget from shared/jump.js and reports what it could
 * reach. The editor shows it live while you drag a platform. Nothing was
 * checking it after the fact, so a level could be authored into an
 * unwinnable state, committed, and merged, and merging is deploying.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { ROOT } from './serve.mjs';

const require = createRequire(import.meta.url);
const Level = require('../shared/level.js');
const Jump = require('../shared/jump.js');

const files = (await readdir(ROOT + 'levels'))
  .filter((f) => f.endsWith('.json')).sort();

test('there are levels to check', () => {
  assert.ok(files.length >= 6, `only found ${files.length} level files`);
});

for (const file of files) {
  const slug = file.replace(/\.json$/, '');
  const data = JSON.parse(await readFile(`${ROOT}levels/${file}`, 'utf8'));

  /* The three.js demo runs the ground forward past his plane, so it is a
   * floor he stands on when seen from a little above -- which is only safe
   * because he is never *inside* a ground body. Every platform is solid from
   * above only, so anything whose top sits within a ground's body, over the
   * same stretch of x, is somewhere he could stand inside that ground with
   * its front face between him and the camera. */
  test(`${slug}: nothing stands inside the ground`, () => {
    for (const p of data.platforms.filter((q) => q.ground)) {
      for (const q of data.platforms) {
        if (q === p) continue;
        const overlap = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
        const inside = q.y < p.y && q.y > p.y - (p.h || 1) - 0.01;
        assert.ok(!(overlap > 0.05 && inside),
          `a platform at x ${q.x}, y ${q.y} stands inside the ground at x ${p.x} ` +
          `-- the ground's front face would hide him there`);
      }
    }
  });

  test(`${slug} is playable`, () => {
    const r = Level.route(data);
    assert.ok(r, 'route() returned nothing -- is shared/jump.js loadable?');
    assert.ok(r.startsOnGround, 'he spawns with no surface under him');
    assert.ok(r.goalReachable, 'the goal cannot be reached from the spawn');

    // `required` is the hardest jump he is *forced* to make, as a fraction of
    // what the budget allows. Over 1 is impossible; this is the margin.
    assert.ok(r.required !== null, 'no route to the goal to measure');
    assert.ok(r.required <= 0.97,
      `the hardest forced jump is ${(r.required * 100).toFixed(0)}% of the ` +
      `budget -- too tight to land reliably`);

    // A pickup nothing can reach is a star the player cannot earn.
    assert.equal(r.lostPickups.length, 0,
      'unreachable pickups: ' +
      r.lostPickups.map((p) => `(${p.x}, ${p.y})`).join(' '));
  });
}

test('the generated bundle matches the level files', async () => {
  // levels/levels.js is what the pages actually load -- the JSON is the
  // source. If build.py has not been run since the last edit, the game ships
  // the old level and every check above measured the wrong thing.
  const bundle = await readFile(ROOT + 'levels/levels.js', 'utf8');
  for (const file of files) {
    const slug = file.replace(/\.json$/, '');
    assert.ok(bundle.includes(`"${slug}"`) || bundle.includes(`'${slug}'`),
      `${slug} is not in levels.js -- run python3 build.py --only levels`);
  }
});

test('the jump budget is what the levels were authored against', () => {
  // These three numbers decide what every level can ask for. Changing one
  // silently re-tunes six levels at once, so the change should have to be
  // deliberate enough to update this line too.
  assert.equal(Jump.C.JUMP_VELOCITY, 8.8);
  assert.equal(Jump.C.GRAVITY, 24.0);
  // The analytic apex is v^2/2g = 1.613, but maxHeight() is the peak of the
  // *sampled* arc, which steps past the top and comes in a little under. That
  // lower number is the one the level checker measures against, so it is the
  // one worth pinning.
  assert.ok(Math.abs(Jump.maxHeight() - 1.540) < 0.005,
    `the reachable apex moved to ${Jump.maxHeight().toFixed(3)}`);
});
