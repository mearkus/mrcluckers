/* The things Ginger would rather be looking at.
 *
 * A squirrel is no threat to a plush chicken, so making it hurt *him* would
 * be borrowed from another game. What a squirrel actually does is take the
 * dog's attention -- so it goes after the one thing the whole level is for.
 * Arrive while she is watching one and there is no reunion: you have to
 * squeak to get her back.
 *
 * That gives `squeak` something to do. It has been in the animation set and
 * on the button bar since the beginning as a pure flourish.
 *
 * Timing is a pure function of a clock the caller advances, so both demos
 * agree about where the squirrel is and whether she has noticed it.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Distraction = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CFG = {
    period: 10.0,      // seconds from one visit to the next
    approach: 1.1,     // spent running in
    linger: 3.4,       // spent sitting there being interesting
    leave: 0.9,        // spent running off
    from: 2.8,         // where it comes in from, relative to her
    perch: 0.95,       // where it stops, relative to her -- behind her, so
                       // she turns away from the way he is coming, and he
                       // never has to walk through it
    height: 0.0,       // squirrels stay on the floor
    recall: 3.2,       // how close a squeak has to be to work
    settle: 0.5        // her head coming back round afterwards
  };

  function create(dogX, dogY, dir, cfg) {
    cfg = cfg || CFG;
    var visit = cfg.approach + cfg.linger + cfg.leave;

    var s = {
      cfg: cfg,
      t: 0,
      dogX: dogX, dogY: dogY,
      dir: dir === undefined ? -1 : dir,   // the side it comes from
      critter: null,        // {x, y, dir} while one is about
      watching: false,      // is her attention on it
      recalled: false,      // has a squeak already fetched her back this visit
      settling: 0,          // her head coming back round
      visits: 0,
      done: false           // once they are reunited she stops caring
    };

    /** Where in the current cycle we are, or null between visits. */
    function phase() {
      var u = s.t % cfg.period;
      return u < visit ? u : null;
    }

    s.update = function (dt) {
      if (s.done) { s.critter = null; s.watching = false; return s; }
      var was = phase();
      s.t += dt;
      var u = phase();
      if (was === null && u !== null) { s.recalled = false; s.visits++; }
      s.settling = Math.max(0, s.settling - dt);

      if (u === null) { s.critter = null; s.watching = false; return s; }

      // Run in, sit, run out -- all relative to her, on the side she faces.
      var away = s.dir;
      var far = s.dogX + cfg.from * away;
      var near = s.dogX + cfg.perch * away;
      var x, moving;
      if (u < cfg.approach) {
        var k = u / cfg.approach;
        x = far + (near - far) * k; moving = away;
      } else if (u < cfg.approach + cfg.linger) {
        x = near; moving = -away;                 // sitting up, facing her
      } else {
        var k2 = (u - cfg.approach - cfg.linger) / cfg.leave;
        x = near + (far - near) * k2; moving = -away;
      }
      s.critter = { x: x, y: s.dogY + cfg.height, dir: moving };
      s.watching = !s.recalled;
      return s;
    };

    /** Her attention is on him when nothing has stolen it. */
    s.onYou = function () {
      return !s.watching && s.settling <= 0;
    };

    /**
     * A squeak fetches her back, if he is close enough for her to hear it
     * over a squirrel. Returns whether it did anything.
     */
    s.squeak = function (x) {
      if (s.done || !s.watching) return false;
      if (Math.abs(x - s.dogX) > cfg.recall) return false;
      s.recalled = true;
      s.watching = false;
      s.settling = cfg.settle;
      return true;
    };

    /** Once she has her toy back, nothing else is interesting. */
    s.finish = function () { s.done = true; s.critter = null; s.watching = false; };

    return s;
  }

  return { CFG: CFG, create: create };
});
