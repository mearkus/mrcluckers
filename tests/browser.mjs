/* Launching a browser at the game, with three.js served locally.
 *
 * The three.js demo imports three from a CDN. A test that fetches it for real
 * is a test that fails when the network does, and it pins the suite to
 * whatever jsdelivr is serving today, so the CDN URL is routed to the copy
 * npm installed here. The version is read from the page, not hardcoded: if
 * web/index.html moves to a newer three, this file does not need to know.
 */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ROOT } from './serve.mjs';

// three's exports map hides its package.json, so it is found by path rather
// than by require.resolve.
export const THREE_DIR = fileURLToPath(new URL('node_modules/three/', import.meta.url));

/** The version of the local copy the tests serve. */
export async function installedVersion() {
  const pkg = JSON.parse(await readFile(THREE_DIR + 'package.json', 'utf8'));
  return pkg.version;
}

/** The three version web/index.html asks for, so the local copy must match. */
export async function pinnedVersion() {
  const html = await readFile(ROOT + 'web/index.html', 'utf8');
  const m = html.match(/three@([\d.]+)\//);
  if (!m) throw new Error('web/index.html no longer names a three version');
  return m[1];
}

export async function launch() {
  // swiftshader: CI runners have no GPU, and the demo must still draw.
  return chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']
  });
}

/**
 * A page that collects its own errors. `page.errors` is every uncaught
 * exception and failed request -- the thing most worth asserting on, since a
 * broken demo usually still paints something.
 */
export async function open(browser, opts = {}) {
  const page = await browser.newPage({
    viewport: opts.viewport || { width: 1000, height: 620 }
  });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e.message)));
  page.on('requestfailed', (r) => {
    // Chromium reports the aborted navigation of an in-flight redirect as a
    // failed request; that is the router working, not a missing file. Web
    // fonts are blocked below on purpose and are cosmetic besides.
    const why = r.failure()?.errorText;
    if (why !== 'net::ERR_ABORTED' && !/fonts\.(googleapis|gstatic)\.com/.test(r.url())) {
      page.errors.push(`${r.url()} ${why}`);
    }
  });
  // Blocked rather than fetched, so the suite behaves the same on a machine
  // with no network as on one with. The pages all name a real fallback stack.
  await page.route('https://fonts.g*.com/**', (r) => r.abort());
  await page.route('https://cdn.jsdelivr.net/npm/three@*/**', async (route) => {
    const rest = route.request().url().split(/three@[\d.]+\//)[1].split('?')[0];
    try {
      await route.fulfill({ status: 200, contentType: 'text/javascript',
                            body: await readFile(THREE_DIR + rest) });
    } catch {
      await route.fulfill({ status: 404, body: 'not in the local three' });
    }
  });
  return page;
}

/** Resolves once the three.js demo has a player, or throws saying it didn't. */
export async function booted(page, ms = 20000) {
  await page.waitForFunction(() => !!window.__player, null, { timeout: ms })
    .catch(() => {
      throw new Error('the three.js demo never booted: ' +
                      (page.errors.join('; ') || 'no errors reported'));
    });
}
