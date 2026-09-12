/* The committed assets are the ones build.py produces.
 *
 * assets/ is generated output that is committed on purpose -- the site loads
 * the model and the sprite sheets straight from the repository and nothing is
 * built in CI. That only works while the committed files and the generator
 * agree. Change the geometry and forget to run build.py and the site keeps
 * shipping the old rooster, with nothing to say so.
 *
 * The build is byte-for-byte deterministic, so this is just: build somewhere
 * else, and compare. It takes about a minute, which is why it is a separate
 * file with its own npm script rather than part of `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir, readFile, mkdtemp, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { ROOT } from './serve.mjs';

const run = promisify(execFile);

/** Every file under `dir`, as paths relative to it. */
async function walk(dir, base = dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(full, base));
    else out.push(relative(base, full));
  }
  return out.sort();
}

test('assets/ matches a fresh build', async (t) => {
  const out = await mkdtemp(join(tmpdir(), 'mrc-assets-'));
  t.after(() => rm(out, { recursive: true, force: true }));

  await run('python3', ['build.py', '--out', out], { cwd: ROOT, timeout: 600000 });

  const [have, want] = [await walk(ROOT + 'assets'), await walk(out)];
  assert.deepEqual(have, want,
    'the set of generated files changed -- run python3 build.py and commit');

  const differ = [];
  for (const file of want) {
    const [a, b] = await Promise.all([
      readFile(join(ROOT, 'assets', file)), readFile(join(out, file))
    ]);
    if (!a.equals(b)) differ.push(file);
  }
  assert.deepEqual(differ, [],
    'these committed assets are stale -- run python3 build.py and commit them');
});
