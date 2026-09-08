/* What being knocked about costs him.
 *
 * The vacuum, a bird going up in his face and an acorn off a branch were all
 * survivable and all forgettable: a shove, a stumble, and nothing to show for
 * it a second later. A plush toy dragged through five levels should *look*
 * like it, and the knocks should add up to something.
 *
 * So a hit leaves a mark. Three marks and a seam goes: that costs a **life**,
 * he is patched up, and he carries on from the last place he stood safely.
 * Run out of lives and the level starts again -- with the kibble you have
 * already found still yours, because losing your collection to a bad run is
 * the punishment checkpoints exist to avoid.
 *
 * And the kibble patches him up. Every fourth one goes in the split: a seam
 * back if one has gone, otherwise a mark rubbed out. A plush toy full of dog
 * food is the joke the game was already making, and it gives the collecting
 * something to do *during* a level rather than only on the results screen --
 * he wants to please her, and the detour for the kibble in the awkward corner
 * now buys him the knock it costs to get there.
 *
 * Nothing here draws: it counts. Both demos read the same wear number and
 * each puts its own stuffing and grime on him, so a plush chicken cannot be
 * scruffier in one than in the other.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Wear = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CFG = {
    lives: 3,        // seams he can afford to lose
    perLife: 3,      // knocks each one takes
    perMend: 4,      // kibble that goes into the next split
    patched: 1.2     // seconds of being obviously freshly mended
  };

  function create(opts) {
    opts = opts || {};
    var cfg = {};
    for (var k in CFG) cfg[k] = opts[k] === undefined ? CFG[k] : opts[k];

    var s = {
      cfg: cfg,
      wear: 0,          // marks showing now: 0 .. perLife - 1
      lives: cfg.lives,
      taken: 0,         // every knock this run, for the results line
      spent: 0,         // lives lost
      fed: 0,           // kibble since the last mend
      mended: 0,        // mends the kibble has paid for
      mending: 0        // counts down while the mend is still obvious
    };

    /**
     * One knock. Returns what it cost: `mark` always, plus `life` when a seam
     * went and `out` when that was the last one.
     */
    s.hit = function () {
      s.taken++;
      s.wear++;
      if (s.wear < cfg.perLife) return { mark: true, life: false, out: false };
      // Three marks and something gives.
      s.wear = 0;
      s.mending = cfg.patched;
      s.lives--;
      s.spent++;
      if (s.lives > 0) return { mark: true, life: true, out: false };
      s.lives = cfg.lives;          // back to the start of the level, mended
      return { mark: true, life: true, out: true };
    };

    /**
     * One kibble, stuffed in as he goes. Every `perMend`th one mends
     * something: a whole seam if one has gone, otherwise the most recent
     * mark. Returns what it fixed, or nulls when he had nothing to fix --
     * the kibble still counts for her, it just does not need to.
     */
    s.feed = function () {
      s.fed++;
      if (s.fed < cfg.perMend) return { mended: false, seam: false };
      s.fed = 0;
      if (s.lives < cfg.lives) {
        s.lives++;
        s.mended++;
        s.mending = cfg.patched;
        return { mended: true, seam: true };
      }
      if (s.wear > 0) {
        s.wear--;
        s.mended++;
        s.mending = cfg.patched;
        return { mended: true, seam: false };
      }
      return { mended: false, seam: false };   // nothing to fix
    };

    s.update = function (dt) { s.mending = Math.max(0, s.mending - dt); };

    return s;
  }

  return { CFG: CFG, create: create };
});
