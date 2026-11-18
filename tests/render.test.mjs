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

/* Holds him at (x, y) until the camera has arrived -- it eases, and the long
 * way down starts five units above where it begins -- then measures how much
 * of him the frame shows. Runs in the page. */
function seenAt([x, y]) {
  return new Promise((done) => {
    const P = window.__player;
    let f = 0;
    (function tick() {
      P.x = x; P.y = y; P.vx = 0; P.vy = 0; P.onGround = true; P.hitCool = 99;
      if (++f < 70) return requestAnimationFrame(tick);
      done(measure());
    })();
  });

  function measure() {
    const r = window.__renderer, gl = r.getContext();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const scene = window.__scene, bird = window.__bird.root;
    // Any unlit material will do as a template; the backdrop is full of them.
    let flat = null;
    scene.traverse((o) => { if (!flat && o.material?.isMeshBasicMaterial) flat = o.material; });
    flat = flat.clone();
    Object.assign(flat, { transparent: false, opacity: 1, fog: false, toneMapped: false });
    flat.color.setRGB(1, 0, 1);
    const own = [];
    bird.traverse((o) => {
      if (o.isMesh) { own.push([o, o.material]); o.material = flat; }
      else if (o.isSprite && o.visible) { own.push([o, null]); o.visible = false; }
    });
    const grab = () => {
      r.render(scene, window.__camera);
      const px = new Uint8Array(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return px;
    };
    const changed = (a, b) => {
      let n = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]),
                           Math.abs(a[i + 2] - b[i + 2]));
        if (d > 40) n++;
      }
      return n;
    };
    const pair = () => {
      bird.visible = true; const on = grab();
      bird.visible = false; const off = grab();
      bird.visible = true;
      return changed(on, off);
    };
    const seen = pair();
    // What may never cover him: the backdrop, and the platforms -- which he
    // walks through, and which the canvas demo draws behind him.
    const layers = [...window.__backdrops.map((b) => b.g), window.__platforms];
    layers.forEach((g) => { g.visible = false; });
    const bare = pair();
    layers.forEach((g) => { g.visible = true; });
    const was = scene.children.map((o) => o.visible);
    scene.children.forEach((o) => { if (o !== bird) o.visible = false; });
    const solo = pair();
    scene.children.forEach((o, i) => { o.visible = was[i]; });
    for (const [o, m] of own) { if (m) o.material = m; else o.visible = true; }
    return { solo, bare, seen };
  }
}

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
    // A theme that names a surface web/surfaces.js does not have gets that
    // part drawn flat, with no error -- nothing else here would notice.
    assert.deepEqual(await page.evaluate(() => window.__missingSurfaces()), [],
      `${slug}'s theme names a surface that does not exist`);
    // Likewise what drifts in the air: a misspelt kind is simply nothing.
    const amb = await page.evaluate(() => window.__ambient());
    assert.deepEqual(amb.missing, [], `${slug}'s theme names an ambient kind that does not exist`);
    assert.ok(amb.count > 0, `${slug}'s theme asks for ambient life and none was made`);
    // And the scenery: a prop kind assets/model/props.glb does not have is
    // skipped, which a screenshot would never point out.
    assert.deepEqual(await page.evaluate(() => window.__missingProps()), [],
      `${slug} places props that assets/model/props.glb does not have`);
    await page.close();
  });

  /* He is in shot, and the scenery never covers him. Every other check here
   * passed while, in the park, he vanished completely into a bush he was
   * walking through: it rendered, it threw nothing, it had plenty of meshes.
   * Platforms are solid only from above, the canvas demo draws them behind
   * him, and this one built each as a box around his plane.
   *
   * Measured by rendering the same frame with and without him and counting
   * the pixels that change -- how much of him survives whatever is in front
   * -- once as it is and once without the backdrop and the platforms.
   * Everything else is the same in both, so a bird swooping past or the other
   * dog standing over him cancels out, and what is left is what the scenery
   * takes. A third count with nothing else drawn says whether he is in the
   * frame at all: the camera's lift toward a perch once took him off the
   * bottom. Read straight off the drawing buffer in the same task as the
   * render, so the HUD and the next frame's motion never enter into it.
   *
   * He is painted flat magenta for the count. In his own grey against a
   * mid-brown shed wall too few of his pixels change by enough to count, and
   * the shed failed with nothing in front of him at all. Magenta is far from
   * every colour the themes use, so what is measured is cover, not contrast.
   * Front layers are meant to pass over him -- grass he wades through -- so
   * the bar is that most of him shows, not all. */
  test(`${slug}: he is in shot, and never behind the scenery`, async (t) => {
    const page = await open(browser);
    await page.goto(`${site.origin}/web/index.html?level=${slug}`);
    await booted(page);
    // The spawn, and the middle of the widest few platforms.
    // And inside up to three platforms he can walk through on the way past --
    // the bush that swallowed him was one. Not next to Ginger, who is bigger
    // than he is and rightly stands in front of him.
    const spots = await page.evaluate(() => {
      const L = window.__level;
      const away = (x) => Math.abs(x - L.goal.x) > 4;
      const wide = L.platforms.filter((q) => q.w >= 2 && away(q.x + q.w / 2))
        .sort((a, b) => b.w - a.w).slice(0, 4)
        .map((q) => [q.x + q.w / 2, q.y]);
      const through = [];
      for (const q of L.platforms) {
        const x = q.x + q.w / 2;
        if (q.ground || !away(x)) continue;
        // A floor under it, close enough that he passes through its body.
        const floor = L.platforms.find((f) => f !== q && x > f.x && x < f.x + f.w &&
          f.y < q.y && q.y - q.h < f.y + 1);
        if (floor && through.length < 3) through.push([x, floor.y]);
      }
      return [[L.spawn.x, L.spawn.y], ...wide, ...through];
    });
    for (const [x, y] of spots) {
      const { solo, bare, seen } = await page.evaluate(seenAt, [x, y]);
      t.diagnostic(`x ${x.toFixed(1)}: ${seen} of ${bare} pixels show ` +
                   `(${solo} with nothing else drawn)`);
      // The camera's lift toward a perch once took him off the bottom.
      assert.ok(solo > 2000, `only ${solo} pixels of him at x ` +
        `${x.toFixed(1)} in ${slug} with nothing else drawn -- he is out of shot`);
      assert.ok(seen / bare > 0.75,
        `the backdrop or a platform covers ${Math.round(100 - 100 * seen / bare)}% ` +
        `of him at x ${x.toFixed(1)} in ${slug}`);
    }

    /* Anything drawn in front of him is a strip at his feet, not a wall. The
     * park's grass tufts were built like hills -- filled fourteen units down
     * from their tops -- so each was a translucent pillar standing in front
     * of everything. Measured by cover they only take his legs, which grass
     * is allowed to do; measured by shape they are taller than he is. */
    const tallest = await page.evaluate(() => {
      let worst = 0;
      for (const b of window.__backdrops) {
        if (b.g.position.z <= 0) continue;          // behind the play plane
        b.g.traverse((o) => {
          if (!o.isMesh) return;
          o.geometry.computeBoundingBox();
          const bb = o.geometry.boundingBox;
          // An instance's y scale is element 5 of its column-major matrix.
          const sy = o.isInstancedMesh ? Math.abs(o.instanceMatrix.array[5]) : 1;
          worst = Math.max(worst, (bb.max.y - bb.min.y) * sy);
        });
      }
      return worst;
    });
    assert.ok(tallest < 1,
      `a layer in front of him in ${slug} is ${tallest.toFixed(2)} units ` +
      `tall -- he is one -- so it is a wall over the play area, not grass`);
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

/* His contact shadow can be seen. It was a disc lying flat on the floor, and
 * the camera is side-on and orthographic, so it saw it exactly edge-on: with
 * and without it, not one pixel changed, in any level, from the day the
 * three.js demo was written. Measured the same way here, so a shadow laid
 * back down -- or hidden behind the platforms -- fails. */
test('his contact shadow can be seen', async () => {
  const page = await open(browser);
  await page.goto(`${site.origin}/web/index.html?level=the-garden`);
  await booted(page);
  const changed = await page.evaluate(() => new Promise((done) => {
    const P = window.__player;
    let f = 0;
    (function tick() {
      P.x = 8; P.y = 0; P.vx = 0; P.vy = 0; P.onGround = true; P.hitCool = 99;
      if (++f < 60) return requestAnimationFrame(tick);
      const r = window.__renderer, gl = r.getContext();
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      const grab = () => {
        r.render(window.__scene, window.__camera);
        const px = new Uint8Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return px;
      };
      const sh = window.__contact;
      const on = grab(); sh.visible = false; const off = grab(); sh.visible = true;
      let n = 0;
      for (let i = 0; i < on.length; i += 4) {
        if (Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) +
            Math.abs(on[i + 2] - off[i + 2]) > 12) n++;
      }
      done(n);
    })();
  }));
  assert.ok(changed > 500, `his shadow changes ${changed} pixels -- it is not ` +
    `on screen, or it is lying flat where a side-on camera cannot see it`);
  await page.close();
});

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
