/* Both renderers, every level, no errors.
 *
 * This is the check that would have caught the things that actually broke:
 * a script tag left out of one page, a level whose theme has no palette, an
 * asset path written as if it resolved against demo/ rather than the root.
 * Each of those shipped a black screen, and merging is deploying.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { serve, ROOT } from './serve.mjs';
import { launch, open, booted, pinnedVersion, installedVersion } from './browser.mjs';

const LEVELS = (await readdir(ROOT + 'levels'))
  .filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();

let site, browser;
before(async () => { site = await serve(); browser = await launch(); });
after(async () => { await browser.close(); await site.close(); });

test('the local three.js matches the one the page asks for', async () => {
  const want = await pinnedVersion();
  const have = await installedVersion();
  assert.equal(have, want,
    `web/index.html imports three@${want} but tests/ has ${have} installed ` +
    `-- update the devDependency, or the tests are exercising a different ` +
    `three from the one the site ships`);
});

for (const slug of LEVELS) {
  test(`${slug} renders in three.js`, async () => {
    const page = await open(browser);
    await page.goto(`${site.origin}/web/index.html?level=${slug}`);
    await booted(page);
    const seen = await page.evaluate(() => {
      let meshes = 0;
      window.__scene.traverse((o) => { if (o.isMesh) meshes++; });
      return { meshes, player: !!window.__player, level: window.__level?.name };
    });
    assert.ok(seen.meshes > 20, `only ${seen.meshes} meshes -- the level is empty`);
    assert.ok(seen.level, 'the level never named itself');
    assert.deepEqual(page.errors, []);
    await page.close();
  });

  test(`${slug} renders on the canvas`, async () => {
    const page = await open(browser);
    await page.goto(`${site.origin}/?level=${slug}&2d=1`);
    await page.waitForFunction(() => !!window.mrCluckers?.player, null,
                               { timeout: 15000 });
    const seen = await page.evaluate(() => ({
      name: window.mrCluckers.level?.name,
      drawn: window.mrCluckers.frames > 0
    }));
    assert.ok(seen.name, 'the level never named itself');
    assert.deepEqual(page.errors, []);
    await page.close();
  });
}

/* Every shared module is actually loaded, and actually wired up.
 *
 * Both demos reach for their modules defensively -- `window.Wear ? ... : null`
 * -- so a page that does not need one is not broken by its absence. The cost
 * of that is silence: delete a script tag and the game keeps running with the
 * wear system, or the camera peek, quietly switched off. Nothing throws and
 * nothing looks wrong in a screenshot.
 *
 * Found by deleting shared/wear.js from the three.js page on purpose and
 * watching every other check in this file stay green.
 *
 * Both pages load all fourteen, which is the guarantee the shared/ directory
 * exists to make: neither renderer gets to quietly play by different rules.
 */
const SHARED = ['Jump', 'Level', 'Wear', 'Look', 'Checkpoint', 'Distraction',
                'Patrol', 'Theme', 'Progress', 'Bonus', 'Thief', 'Sound',
                'Music', 'TouchControls'];

const WIRED = {
  three: {
    url: (o) => `${o}/web/index.html?level=the-shed`,
    ready: () => !!window.__player,
    live: () => ({ wear: !!window.__wear(), look: !!window.__look })
  },
  canvas: {
    url: (o) => `${o}/?level=the-shed&2d=1`,
    ready: () => !!window.mrCluckers?.player,
    live: () => ({ wear: !!window.mrCluckers.wear, look: !!window.mrCluckers.look })
  }
};

for (const [kind, spec] of Object.entries(WIRED)) {
  test(`the ${kind} demo has every shared module wired up`, async () => {
    const page = await open(browser);
    await page.goto(spec.url(site.origin));
    await page.waitForFunction(spec.ready, null, { timeout: 20000 });

    const missing = await page.evaluate(
      (names) => names.filter((k) => !window[k]), SHARED);
    assert.deepEqual(missing, [],
      `missing script tag(s) in the ${kind} page -- the game still runs ` +
      `without these, it just silently stops doing what they do`);

    // Loaded is not the same as used: the demo has to have created one.
    for (const [what, ok] of Object.entries(await page.evaluate(spec.live))) {
      assert.ok(ok, `${kind}: ${what} loaded but was never created`);
    }
    await page.close();
  });
}
