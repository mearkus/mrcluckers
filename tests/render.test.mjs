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

/* The art does not run out above a level's first storey.
 *
 * A backdrop layer is one row at a fixed height above the floor. Climb past
 * the top one and there is nothing above it but the flat sky colour, which is
 * what a nine-unit level used to look like: brown, in the shed, all the way
 * up. `tile` carries layers upward, and this is the check that it still does.
 *
 * Measured as the spread of colour across the upper half of the frame, which
 * is near zero for a flat field and not for a wall with studs and joists on
 * it. Only the three.js demo, because its canvas fills the viewport -- the
 * sprite demo screenshots its page furniture too, and that has plenty of
 * contrast all by itself.
 */
async function skySpread(page, y) {
  await page.evaluate((y) => new Promise((done) => {
    const P = window.__player;
    let f = 0;
    (function tick() {
      P.x = 7.9; P.y = y; P.vx = 0; P.vy = 0; P.onGround = true; P.hitCool = 99;
      if (++f < 70) return requestAnimationFrame(tick);
      done();
    })();
  }), y);
  const shot = await page.screenshot();
  return page.evaluate(async (data) => {
    const img = await new Promise((ok) => {
      const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + data;
    });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    // Skip the HUD along the top and him in the middle.
    const y0 = Math.floor(c.height * 0.20), y1 = Math.floor(c.height * 0.45);
    const px = g.getImageData(0, y0, c.width, y1 - y0).data;
    let n = 0, sum = 0, sq = 0;
    for (let i = 0; i < px.length; i += 4) {
      const v = (px[i] + px[i + 1] + px[i + 2]) / 3;
      n++; sum += v; sq += v * v;
    }
    return Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2));
  }, shot.toString('base64'));
}

test('the shed is still a shed nine units up', async () => {
  const page = await open(browser);
  await page.goto(`${site.origin}/web/index.html?level=the-shed`);
  await booted(page);
  const low = await skySpread(page, 1);
  const high = await skySpread(page, 9);
  assert.ok(high > 4,
    `nine units up the frame is flat (spread ${high.toFixed(1)} against ` +
    `${low.toFixed(1)} down at the floor) -- the backdrop has run out`);
  await page.close();
});
