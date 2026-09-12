/* The committed assets are the ones build.py produces.
 *
 * assets/ is generated output that is committed on purpose -- the site loads
 * the model and the sprite sheets straight from the repository and nothing is
 * built in CI. That only works while the committed files and the generator
 * agree. Change the geometry and forget to rebuild and the site keeps shipping
 * the old rooster, with nothing to say so.
 *
 * So: build somewhere else, and compare.
 *
 * ## Why this pins a Python version
 *
 * The build is deterministic, but only on one interpreter. The generator
 * turns joint angles into geometry with math.sin and math.cos, and those are
 * the platform's libm: the standard fixes their meaning but not their last
 * bit. Python 3.11 and 3.12 here disagree about trig in the final ulp, one
 * bad bit becomes a slightly different normal, and by the time it reaches the
 * renderer a pixel has rounded the other way. Seven of the generated files
 * come out with different bytes and an identical-looking rooster.
 *
 * That is not staleness and there is nothing to fix in the generator -- you
 * cannot make libm bit-identical across builds without shipping your own.
 * What can be done is to compare like with like: CI pins REFERENCE, which is
 * the interpreter the committed assets were built with, and anywhere else
 * this falls back to the checks that do not depend on the last bit.
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

/** The interpreter the committed assets/ were generated with. */
const REFERENCE = '3.11';

async function pythonVersion() {
  const { stdout, stderr } = await run('python3', ['--version']);
  return (stdout || stderr).trim().split(' ')[1];
}

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
  const version = await pythonVersion();
  const out = await mkdtemp(join(tmpdir(), 'mrc-assets-'));
  t.after(() => rm(out, { recursive: true, force: true }));

  await run('python3', ['build.py', '--out', out], { cwd: ROOT, timeout: 600000 });

  // True on every interpreter: the generator still produces the same set of
  // files, and none has been added or dropped without being committed.
  const [have, want] = [await walk(ROOT + 'assets'), await walk(out)];
  assert.deepEqual(have, want,
    'the set of generated files changed -- run python3 build.py and commit');

  if (!version.startsWith(REFERENCE + '.')) {
    // Comparing bytes here would fail on trig, not on anything real.
    t.diagnostic(`python ${version}, not ${REFERENCE}.x: skipping the byte ` +
                 `comparison (see the note at the top of this file)`);
    return;
  }

  const differ = [];
  for (const file of want) {
    const [a, b] = await Promise.all([
      readFile(join(ROOT, 'assets', file)), readFile(join(out, file))
    ]);
    if (!a.equals(b)) differ.push(file);
  }
  assert.deepEqual(differ, [],
    `these committed assets are stale -- run python3 build.py and commit ` +
    `them. (Built with python ${version}. If you did rebuild and they still ` +
    `differ, check that you are on ${REFERENCE}.x: the last bit of sin and ` +
    `cos moves between interpreters and changes these bytes without ` +
    `changing the model.)`);
});
