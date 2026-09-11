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
 * Three things can knock him, and the counter did not care which. It should:
 * "the wear is too harsh" and "the birds are relentless" want different fixes,
 * and only a real run can tell them apart -- a bot that walks the route gets
 * wedged and then stands still, which measures where it happened to stop
 * rather than what a level costs.
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

  /* The three things that can knock him, plus a bucket for a knock that
   * arrives without saying where it came from. Nothing in either demo does
   * that -- but a fourth source added later, by someone who forgets the
   * argument, would otherwise vanish from the breakdown while still counting
   * in the total, and a measurement whose parts do not add up to its total is
   * worse than no measurement. It shows up as "unaccounted", which is a bug
   * report rather than a score. */
  var SOURCES = ['wildlife', 'vacuum', 'dog', 'other'];

  var CFG = {
    lives: 3,        // seams he can afford to lose
    perLife: 3,      // knocks each one takes
    perMend: 4,      // kibble that goes into the next split
    patched: 1.2,    // seconds of being obviously freshly mended
    explain: 4.5     // seconds to say what a seam is, the first time one goes
  };

  function blank() {
    var o = {};
    for (var i = 0; i < SOURCES.length; i++) o[SOURCES[i]] = 0;
    return o;
  }

  /**
   * What did the damage, worst first, as a phrase. Lives here so the two
   * demos cannot word it differently, and so a level's results screen and the
   * end of the game say the same thing.
   */
  function blame(by) {
    if (!by) return '';
    var parts = SOURCES.slice().filter(function (k) { return by[k] > 0; });
    parts.sort(function (a, b) { return by[b] - by[a]; });
    var said = [];
    for (var i = 0; i < parts.length; i++) {
      var name = parts[i] === 'dog' ? 'other dog'
               : parts[i] === 'other' ? 'unaccounted' : parts[i];
      said.push(by[parts[i]] + ' ' + name);
    }
    return said.join(', ');
  }

  function create(opts) {
    opts = opts || {};
    var cfg = {};
    for (var k in CFG) cfg[k] = opts[k] === undefined ? CFG[k] : opts[k];

    var s = {
      cfg: cfg,
      wear: 0,          // marks showing now: 0 .. perLife - 1
      lives: cfg.lives,
      taken: 0,         // every knock this run, for the results line
      by: blank(),      // and which of the three did each one
      spent: 0,         // lives lost
      fed: 0,           // kibble since the last mend
      mended: 0,        // mends the kibble has paid for
      mending: 0,       // counts down while the mend is still obvious
      /* Counts down while the first lost seam still wants explaining.
       *
       * "Seams" is this game's word for lives, and nothing ever said so: the
       * only thing that carried it was three blocks in a HUD line and some
       * stitches on a sprite 73 pixels tall. Somebody who finished the whole
       * game with one seam of fifteen still had to ask what they were.
       *
       * The first one going is the moment it can be explained and the only
       * moment anyone is looking at him. It lives here rather than in each
       * demo because both want the same sentence at the same instant. */
      said: 0
    };

    /**
     * One knock. Returns what it cost: `mark` always, plus `life` when a seam
     * went and `out` when that was the last one.
     */
    s.hit = function (from) {
      s.taken++;
      s.by[s.by[from] === undefined ? 'other' : from]++;
      s.wear++;
      if (s.wear < cfg.perLife) return { mark: true, life: false, out: false };
      // Three marks and something gives.
      s.wear = 0;
      s.mending = cfg.patched;
      s.lives--;
      s.spent++;
      if (s.spent === 1) s.said = cfg.explain;     // the first one, and only that
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

    s.update = function (dt) {
      s.mending = Math.max(0, s.mending - dt);
      s.said = Math.max(0, s.said - dt);
    };

    return s;
  }

  return { CFG: CFG, SOURCES: SOURCES, blame: blame, create: create };
});
