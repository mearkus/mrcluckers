# Checks

`main` is the live site and merging a PR is the deploy, so these run on every
pull request. There is no staging environment to catch anything they miss.

```
cd tests
npm run rules      # a few seconds, and needs nothing installed
npm install        # playwright and three, for the rest
npm run browser    # both renderers, every level, and the routing
npm run assets     # about a minute: rebuild and compare
npm test           # everything except the assets rebuild
```

`npm run rules` deliberately has no dependencies — `levels.test.mjs` and
`rules.test.mjs` import nothing but the repository and the standard library, so
the check that a level is finishable works on a clean clone with node and
nothing else.

| File | What it protects |
| --- | --- |
| `levels.test.mjs` | Every level is finishable, nothing is stranded, and the jump budget is the one the levels were drawn against |
| `rules.test.mjs` | The shared rules: what a knock costs, when a seam goes, what the kibble mends, when the camera peeks |
| `render.test.mjs` | Both renderers draw every level with no errors, and every shared module is loaded *and* wired up |
| `routes.test.mjs` | The URLs go where `CLAUDE.md` says, including the fallback when the CDN is blocked |
| `assets.check.mjs` | The committed `assets/` are what `build.py` produces today |

## Two things worth knowing

**three.js is served from `node_modules`, not the CDN.** The demo imports it
from jsdelivr; `browser.mjs` intercepts that and serves the local copy, so the
suite does not fail when the network does and does not silently start testing a
different three from the one the site ships. `render.test.mjs` asserts the two
versions match, so bumping the page without bumping the devDependency is caught
rather than ignored.

**Web fonts are blocked on purpose**, for the same reason. They are cosmetic
and every page names a real fallback stack.

## Adding a check

The useful question is not "does this pass" but "what would have to break for
this to fail". Before adding one, break the thing it is meant to catch and
watch it go red — four deliberate breaks were used to build this suite, and
the one that stayed green found a real blind spot: both demos reach for their
shared modules defensively, so deleting a script tag turned a whole system off
without erroring. That is what the wiring test in `render.test.mjs` is for.
