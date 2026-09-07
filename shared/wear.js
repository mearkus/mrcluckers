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

    s.update = function (dt) { s.mending = Math.max(0, s.mending - dt); };

    return s;
  }

  return { CFG: CFG, create: create };
});
