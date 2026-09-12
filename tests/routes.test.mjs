/* The site's URLs go where CLAUDE.md says they go.
 *
 * The root is the title screen, a level is the three.js one, and the sprite
 * game is the fallback at ?2d=1 -- with `2d=1` being what stops the redirect
 * bouncing in a loop. That loop is a page that never loads, so it is worth a
 * check that does not depend on anyone remembering the rule.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';
import { launch, open, booted } from './browser.mjs';

let site, browser;
before(async () => { site = await serve(); browser = await launch(); });
after(async () => { await browser.close(); await site.close(); });

const path = (page) => page.url().slice(site.origin.length);

test('the root is the title screen', async () => {
  const page = await open(browser);
  await page.goto(site.origin + '/');
  // Both screens render into #shell; the title is the one with the key art.
  await page.waitForSelector('#shell .title-art', { state: 'visible' });
  assert.equal(await page.getAttribute('#shell h1', 'aria-label'), 'Mr. Cluckers');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('#levels is the level select', async () => {
  const page = await open(browser);
  await page.goto(site.origin + '/#levels');
  await page.waitForSelector('#shell.picker', { state: 'visible' });
  const count = await page.evaluate(
    () => document.querySelectorAll('#shell button').length);
  assert.ok(count >= 6, `only ${count} buttons on the level select`);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('a level redirects to the three.js one', async () => {
  const page = await open(browser);
  await page.goto(site.origin + '/?level=the-shed');
  await page.waitForURL(/\/web\//, { timeout: 15000 });
  assert.match(path(page), /^\/web\/\?level=the-shed/);
  await booted(page);
  await page.close();
});

test('2d=1 stops the redirect instead of bouncing', async () => {
  const page = await open(browser);
  await page.goto(site.origin + '/?level=the-shed&2d=1');
  await page.waitForFunction(() => !!window.mrCluckers?.player,
                             null, { timeout: 15000 });
  assert.match(path(page), /2d=1/,
    'the sprite game redirected away -- that is the bounce loop');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('a blocked CDN falls back to the sprite game, and it sticks', async () => {
  const page = await open(browser);
  // Everything from the CDN fails, which is what a corporate proxy or a bad
  // day at jsdelivr looks like.
  await page.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
  await page.goto(site.origin + '/web/index.html?level=the-garden');
  await page.waitForURL(/2d=1/, { timeout: 30000 });
  assert.match(path(page), /2d=1/);

  // And the next level must not pay the timeout again.
  const stuck = await page.evaluate(
    () => { try { return sessionStorage.getItem('mrcluckers.2d'); } catch { return null; } });
  assert.ok(stuck, 'the fallback did not stick -- every level costs the wait again');
  await page.close();
});

test('the editor and the making-of page load', async () => {
  for (const where of ['/editor/', '/admin/']) {
    const page = await open(browser);
    await page.goto(site.origin + where);
    await page.waitForLoadState('networkidle');
    assert.deepEqual(page.errors, [], `${where} reported errors`);
    await page.close();
  }
});
