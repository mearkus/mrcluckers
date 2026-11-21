/* What a level costs a phone, and the game's own defence when it is too much.
 *
 * Four pull requests of visual work added fabric maps, sheen, rounded and
 * textured platforms, particles and a felt prop set, and every one of them
 * was measured on a desktop-sized software renderer. On an emulated phone
 * the frame had doubled in cost and a level downloaded up to 8.9 MB -- the
 * park and the lane fetched Ginger's model three times. Nothing would have
 * said so; the page still drew, still threw nothing.
 *
 * So: a ceiling on what each level asks of a phone, measured on a Pixel 7
 * held sideways. The numbers are counts, not timings, because a CI runner
 * has no GPU and its frame times say nothing about anybody's phone. Each
 * ceiling sits about a quarter above the heaviest level when it was set;
 * raise one deliberately, with the reason, not to make a red check go away.
 *
 * And the defence: adaptive resolution (web/index.html), which watches the
 * real frame rate on the real device and draws fewer pixels if it is slow.
 * It is checked by feeding it frame times, because it must not be at the
 * mercy of how fast the machine running the check happens to be.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { devices } from 'playwright';
import { serve, ROOT } from './serve.mjs';
import { launch, open, booted } from './browser.mjs';

const LEVELS = (await readdir(ROOT + 'levels'))
  .filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();

const PHONE = devices['Pixel 7'];
const SIDEWAYS = { ...PHONE,
  viewport: { width: PHONE.viewport.height, height: PHONE.viewport.width } };

const BUDGET = {
  downloadKB: 6600,      // 5590 at the time, the park
  drawCalls: 76,         // 59, the shed
  triangles: 27000,      // 21092, the garden
  textures: 18,          // 14, the outdoor levels, with maps shared
  textureMB: 3.7,        // 2.94, the outdoor levels (mipmaps counted)
};

let site, browser;
before(async () => { site = await serve(); browser = await launch(); });
after(async () => { await browser.close(); await site.close(); });

/** A phone-sized page, with the resolution held still so it measures the same. */
async function phonePage() {
  const page = await open(browser, { context: SIDEWAYS });
  await page.addInitScript(() => { window.__fixedResolution = true; });
  return page;
}

for (const slug of LEVELS) {
  test(`${slug} fits a phone's budget`, async (t) => {
    const page = await phonePage();
    let bytes = 0;
    page.on('response', async (r) => {
      try { bytes += (await r.body()).length; } catch { /* redirects have none */ }
    });
    await page.goto(`${site.origin}/web/index.html?level=${slug}`);
    await booted(page, 40000);
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => {
      const r = window.__renderer;
      r.info.autoReset = false;
      r.info.reset();
      window.__frame();                         // both passes, far and near
      const calls = r.info.render.calls, triangles = r.info.render.triangles;
      r.info.autoReset = true;
      // Texture memory by what is actually sampled: every distinct image
      // behind a material's maps, mipmaps included.
      const seen = new Set();
      let bytes = 0;
      const look = (o) => {
        const mats = o.material ? [].concat(o.material) : [];
        for (const m of mats) {
          for (const k of ['map', 'normalMap', 'bumpMap', 'alphaMap']) {
            const tx = m[k];
            if (!tx || seen.has(tx.source)) continue;
            seen.add(tx.source);
            const im = tx.image;
            if (im && im.width) bytes += im.width * im.height * 4 * 1.33;
          }
        }
      };
      window.__scene.traverse(look);
      window.__farScene.traverse(look);
      return { calls, triangles, textures: r.info.memory.textures,
               textureMB: bytes / 1048576 };
    });
    const kb = bytes / 1024;
    t.diagnostic(`${Math.round(kb)} KB, ${m.calls} calls, ${m.triangles} triangles, ` +
                 `${m.textures} textures, ${m.textureMB.toFixed(2)} MB of them`);
    assert.deepEqual(page.errors, []);
    assert.ok(kb <= BUDGET.downloadKB, `${slug} downloads ${Math.round(kb)} KB ` +
      `on a phone, over the ${BUDGET.downloadKB} KB budget`);
    assert.ok(m.calls <= BUDGET.drawCalls, `${slug} takes ${m.calls} draw calls ` +
      `a frame, over the ${BUDGET.drawCalls} budget`);
    assert.ok(m.triangles <= BUDGET.triangles, `${slug} draws ${m.triangles} ` +
      `triangles a frame, over the ${BUDGET.triangles} budget`);
    assert.ok(m.textures <= BUDGET.textures, `${slug} holds ${m.textures} ` +
      `textures, over the ${BUDGET.textures} budget`);
    assert.ok(m.textureMB <= BUDGET.textureMB, `${slug} holds ` +
      `${m.textureMB.toFixed(2)} MB of textures, over the ${BUDGET.textureMB} MB budget`);
    await page.close();
  });
}

test('a phone that cannot keep up draws fewer pixels', async () => {
  const page = await phonePage();
  await page.goto(`${site.origin}/web/index.html?level=the-garden`);
  await booted(page, 40000);
  const r = await page.evaluate(() => {
    const out = { start: window.__renderer.getPixelRatio() };
    // Five seconds of 20 fps: past the three-second grace, then slow.
    for (let i = 0; i < 100; i++) window.__adapt(50);
    out.slow = window.__renderer.getPixelRatio();
    for (let i = 0; i < 400; i++) window.__adapt(50);
    out.floor = window.__renderer.getPixelRatio();
    return out;
  });
  assert.ok(r.slow < r.start, `five seconds at 20 fps left the pixel ratio at ` +
    `${r.slow} -- it should have stepped down from ${r.start}`);
  assert.equal(r.floor, 0.75, 'a phone stops stepping down at 0.75');
  await page.close();
});

test('a phone that keeps up, or comes back from the background, keeps its pixels', async () => {
  const page = await phonePage();
  await page.goto(`${site.origin}/web/index.html?level=the-garden`);
  await booted(page, 40000);
  const r = await page.evaluate(() => {
    const start = window.__renderer.getPixelRatio();
    for (let i = 0; i < 600; i++) window.__adapt(16.7);   // ten seconds at 60
    const smooth = window.__renderer.getPixelRatio();
    // A frame that long is the tab returning, not a slow phone.
    for (let i = 0; i < 20; i++) window.__adapt(900);
    return { start, smooth, back: window.__renderer.getPixelRatio() };
  });
  assert.equal(r.smooth, r.start, 'a phone at 60 fps lost pixels');
  assert.equal(r.back, r.start, 'coming back from the background cost pixels');
  await page.close();
});
