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

  /* Where the damage shows.
   *
   * Both demos had their own copy of this table -- the same numbers, with the
   * y sign flipped because one draws with y down and the other with y up --
   * which is exactly the drift shared/ exists to stop. They live here now and
   * each demo flips what it needs to.
   *
   * MARKS is this level's fresh scuffs, and there are only `perLife - 1` of
   * them because the third knock costs a seam instead. SCARS is the run's
   * history: older damage, further round the body, drawn duller and stitched
   * rather than raw. Keeping them in different places is what preserves the
   * read -- two fresh marks still means "one more and a seam goes", however
   * battered he already is.
   */
  var MARKS = [
    { x: -0.05, y: 0.66, s: 0.30, a: -0.35 },   // over the shoulder
    { x: 0.15, y: 0.46, s: 0.26, a: 0.8 }       // and at the flank
  ];

  /* Placed inside the same band as MARKS rather than spread around him. The
   * first attempt fanned them out to x +/- 0.26 and y 0.32 to 0.86, which
   * read fine as numbers and put half of them in mid-air beside him: he is
   * barely a third of a unit wide at the waist and narrower at the neck. The
   * only way to find that was to render him worn and look. */
  var SCARS = [
    { x: 0.02, y: 0.58, s: 0.20, a: 0.45 },
    { x: 0.16, y: 0.62, s: 0.17, a: -0.9 },
    { x: -0.02, y: 0.44, s: 0.19, a: 1.2 },
    { x: 0.12, y: 0.72, s: 0.16, a: 0.2 },
    { x: 0.20, y: 0.52, s: 0.18, a: -0.5 },
    { x: 0.06, y: 0.38, s: 0.17, a: 1.0 }
  ];

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
      /* Lasting damage: every knock this run, mends taken off again.
       *
       * Seams do not carry between levels -- each one hands him three, and
       * that is what keeps the game finishable. What carries is how he
       * *looks*. A run that has been through the kitchen, the shed and the
       * long way down should arrive at the lane visibly worse for it, and
       * arriving at the last level as pristine as he left the first is the
       * one thing the wear system was not saying.
       *
       * Purely cosmetic, deliberately. Counting it toward a seam would make
       * the last levels of a run harder than the first by an amount nobody
       * chose: there are 65 kibble in a run and they buy 16 mends, against
       * 63 marks the seams currently forgive.
       */
      scars: Math.max(0, opts.scars || 0),

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
      s.scars++;                    // and this one does not wash out
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
        if (s.scars > 0) s.scars--;   // every mend takes one off the tally
        s.mended++;
        s.mending = cfg.patched;
        return { mended: true, seam: true };
      }
      if (s.wear > 0) {
        s.wear--;
        if (s.scars > 0) s.scars--;
        s.mended++;
        s.mending = cfg.patched;
        return { mended: true, seam: false };
      }
      if (s.scars > 0) {
        // Nothing fresh, but there is always the last level to answer for.
        // Before this, kibble stopped counting once he was locally whole.
        s.scars--;
        s.mended++;
        s.mending = cfg.patched;
        return { mended: true, seam: false };
      }
      return { mended: false, seam: false };   // nothing left to fix
    };

    /**
     * How many old marks to draw. `scars` counts this level's knocks too, and
     * those are already showing as fresh ones, so they are taken back off --
     * a knock moves from fresh to lasting when the seam it belonged to goes.
     * Capped at the number of places there are to put one.
     */
    s.showScars = function () {
      return Math.max(0, Math.min(SCARS.length, s.scars - s.wear));
    };

    s.update = function (dt) {
      s.mending = Math.max(0, s.mending - dt);
      s.said = Math.max(0, s.said - dt);
    };

    return s;
  }

  return { CFG: CFG, MARKS: MARKS, SCARS: SCARS, SOURCES: SOURCES,
           blame: blame, create: create };
});
