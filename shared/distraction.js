/* The things Ginger would rather be looking at -- and the things that want
 * your kibble.
 *
 * A squirrel is no threat to a plush chicken, so making it hurt *him* would
 * be borrowed from another game. What a squirrel actually does is take
 * things: the dog's attention, and anything edible you left lying about.
 *
 * A critter lives at an authored **perch** somewhere in the level, not on the
 * dog. That is the whole point of this file: where a critter sits decides
 * what it does to you.
 *
 *   - Perch one near Ginger and it takes her attention, so arriving is not
 *     the end of the level: squeak to get her back. That gives `squeak`
 *     something to do -- it has been a pure flourish since the beginning.
 *   - Perch one near a kibble and it will carry that kibble off while you
 *     watch, unless you get there first. It only starts eyeing one once you
 *     are near enough to see it happen, so a theft is a race you were offered
 *     rather than a tax collected off screen.
 *
 * Two kinds, two answers. A **bird** perches high, out of reach, and the only
 * thing that moves it is a `crow` -- the other flourish that never meant
 * anything. A **squirrel** sits where you can get at it, ignores shouting
 * entirely (as in life), and bolts when you come close, so beating one to a
 * kibble is a matter of legs rather than lungs.
 *
 * Timing is a pure function of a clock the caller advances, so both demos
 * agree about where every critter is and whether she has noticed one.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Distraction = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CFG = {
    period: 10.0,      // seconds from one visit to the next
    approach: 1.1,     // spent coming in
    linger: 3.4,       // spent sitting there being interesting
    leave: 0.9,        // spent going away again
    from: 2.8,         // how far off it comes in from
    side: 1,           // which side of the perch that is
    arc: 0.0,          // extra height while travelling; a bird flies in
    startles: false,   // does a crow put it up
    flush: 2.2,        // how close you get before it puts itself up
    recall: 3.2,       // how far a squeak or a crow carries
    settle: 0.5,       // her head coming back round afterwards
    notice: 3.6,       // how near her perch has to be to take her attention
    reach: 2.0,        // how far from the perch it will go for a kibble
    wary: 2.8,         // it only starts once the kibble is on your screen --
                       // the demos show about five units across, so a theft
                       // begun further off than this is a tax, not a race
    takes: 3.2         // seconds of eyeing a kibble before it takes it
  };

  /* A bird visits more often and stays a shorter time, perches over your head
   * where you could never reach it, and is quicker about a theft -- it only
   * has to drop, take and go. */
  var KINDS = {
    squirrel: CFG,
    bird: {
      period: 6.4, approach: 0.85, linger: 2.6, leave: 0.7,
      from: 3.4, side: 1, arc: 0.75, startles: true,
      flush: 1.0, recall: 3.2, settle: 0.45, notice: 4.0,
      reach: 2.2, wary: 2.8, takes: 2.6
    }
  };

  function cfgFor(spec) {
    var kind = KINDS[spec && spec.kind] ? spec.kind : 'squirrel';
    var base = KINDS[kind], cfg = {};
    for (var k in base) cfg[k] = base[k];
    // Anything on the perch itself wins, so a level can author a critter that
    // sits nearly all the time (a guard) or one that only flickers past.
    for (var j in (spec || {})) if (cfg[j] !== undefined) cfg[j] = +spec[j];
    return { kind: kind, cfg: cfg };
  }

  function dist(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * A flock is everything in one level.
   *
   *   opts.critters  perches, in world units: {x, y, kind, side, ...timings}
   *   opts.dog       where Ginger is standing, or null
   *   opts.pickups   the level's kibble, in world units and in index order
   */
  function flock(opts) {
    opts = opts || {};
    var dog = opts.dog || null;
    var pickups = opts.pickups || [];

    var critters = (opts.critters || []).map(function (spec, i) {
      var c = cfgFor(spec);
      var cycle = c.cfg.approach + c.cfg.linger + c.cfg.leave;
      // A visit cannot be longer than the gap between visits. Authoring a
      // long `linger` is how you make a critter that is nearly always there,
      // so stretch the period to fit rather than wrapping mid-visit.
      c.cfg.period = Math.max(c.cfg.period, cycle + 0.6);
      return {
        kind: c.kind, cfg: c.cfg,
        home: { x: +spec.x, y: +spec.y },
        // Spread them out, so a level does not blink all its critters on
        // together, and honour an authored phase over the spread.
        u: spec.phase === undefined
             ? (i * 2.7) % c.cfg.period
             : (+spec.phase) % c.cfg.period,
        cycle: cycle,
        here: false, x: +spec.x, y: +spec.y, dir: -1, flying: false,
        spooked: false,       // put up early -- gone for the rest of the visit
        recalled: false,      // she has already been called off this one
        target: -1,           // a kibble it has its eye on
        timer: 0,
        carry: -1,            // a kibble it is leaving with
        visits: 0
      };
    });

    var s = {
      critters: critters,
      dog: dog,
      stolen: [],           // pickup indices carried off, in the order taken
      watching: false,      // is her attention on a critter
      watcher: null,        // which one
      settling: 0,          // her head coming back round
      done: false
    };

    function place(c) {
      var cfg = c.cfg, u = c.u;
      var far = c.home.x + cfg.from * cfg.side;
      var lift = 0, x, moving;
      if (u < cfg.approach) {
        var k = u / cfg.approach;
        x = far + (c.home.x - far) * k;
        moving = -cfg.side;
        // Coming in: a bird drops onto the perch rather than arriving at it.
        lift = cfg.arc * Math.sin(Math.PI * k) + cfg.arc * 0.6 * (1 - k);
      } else if (u < cfg.approach + cfg.linger) {
        x = c.home.x;
        moving = cfg.side;                      // sitting up, facing the way in
      } else {
        var k2 = (u - cfg.approach - cfg.linger) / cfg.leave;
        x = c.home.x + (far - c.home.x) * k2;
        moving = cfg.side;
        lift = cfg.arc * 1.3 * k2;               // and lifts off going away
      }
      c.x = x; c.y = c.home.y + lift; c.dir = moving;
      c.flying = lift > 0.02;
    }

    /** Put one up: it goes at once and takes its hold on her with it. */
    function putUp(c) {
      if (!c.here || c.spooked) return false;
      c.spooked = true; c.here = false; c.target = -1;
      if (s.watcher === c) { s.watching = false; s.settling = c.cfg.settle; }
      return true;
    }

    function freeKibble(c, taken) {
      var best = -1, bestD = c.cfg.reach;
      for (var i = 0; i < pickups.length; i++) {
        if (s.stolen.indexOf(i) >= 0) continue;
        if (taken && taken(i)) continue;
        var d = dist(pickups[i].x, pickups[i].y, c.home.x, c.home.y);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    }

    /**
     * `world` is where the player is and what he has already picked up:
     * {x, y, taken} -- `taken(i)` says whether kibble i is his already.
     */
    s.update = function (dt, world) {
      world = world || {};
      s.settling = Math.max(0, s.settling - dt);
      if (s.done) {
        for (var d = 0; d < critters.length; d++) critters[d].here = false;
        s.watching = false; s.watcher = null;
        return s;
      }

      for (var i = 0; i < critters.length; i++) {
        var c = critters[i], cfg = c.cfg;
        c.u += dt;
        if (c.u >= cfg.period) {              // round again: a fresh visit
          c.u -= cfg.period * Math.floor(c.u / cfg.period);
          c.spooked = false; c.recalled = false;
          c.target = -1; c.carry = -1; c.visits++;
        }
        c.here = c.u < c.cycle && !c.spooked;
        if (!c.here) continue;
        place(c);

        // Close enough to put it up yourself. A bird perches out of reach, so
        // in practice this is how you move a squirrel and a crow is how you
        // move a bird.
        if (world.x !== undefined &&
            dist(world.x, world.y === undefined ? c.y : world.y, c.x, c.y) < cfg.flush) {
          putUp(c);
          continue;
        }

        // Sitting on the perch, with a kibble within reach and you near
        // enough to watch it happen: it will take it.
        var perched = c.u >= cfg.approach && c.u < cfg.approach + cfg.linger;
        if (perched && c.carry < 0) {
          if (c.target >= 0 &&
              (s.stolen.indexOf(c.target) >= 0 || (world.taken && world.taken(c.target)))) {
            c.target = -1;                     // you got there first
          }
          if (c.target < 0) {
            if (world.x !== undefined && Math.abs(world.x - c.home.x) < cfg.wary) {
              c.target = freeKibble(c, world.taken);
              c.timer = cfg.takes;
            }
          } else {
            c.timer -= dt;
            if (c.timer <= 0) {
              c.carry = c.target; c.target = -1;
              s.stolen.push(c.carry);
              c.u = cfg.approach + cfg.linger;   // and away with it
              place(c);
            }
          }
        }
      }

      // Her attention goes to the nearest critter perched near her that she
      // has not already been called off.
      s.watcher = null;
      if (dog) {
        var bestD = Infinity;
        for (var k = 0; k < critters.length; k++) {
          var q = critters[k];
          if (!q.here || q.recalled) continue;
          var dd = dist(dog.x, dog.y, q.x, q.y);
          if (dd < q.cfg.notice && dd < bestD) { bestD = dd; s.watcher = q; }
        }
      }
      s.watching = !!s.watcher;
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
      if (s.done || !s.watcher) return false;
      if (!dog || Math.abs(x - dog.x) > s.watcher.cfg.recall) return false;
      s.watcher.recalled = true;
      s.settling = s.watcher.cfg.settle;
      s.watcher = null;
      s.watching = false;
      return true;
    };

    /**
     * A crow puts up every bird near enough to hear it -- which ends a visit,
     * and with it any theft that bird was halfway through. Squirrels are
     * unimpressed. Returns the ones that went up, so the caller can put a
     * puff of feathers where each of them was.
     */
    s.scare = function (x, y) {
      var put = [];
      if (s.done) return put;
      for (var i = 0; i < critters.length; i++) {
        var c = critters[i];
        if (!c.cfg.startles || !c.here) continue;
        if (dist(x, y === undefined ? c.y : y, c.x, c.y) > c.cfg.recall) continue;
        var at = { x: c.x, y: c.y };
        if (putUp(c)) put.push(at);
      }
      return put;
    };

    /**
     * A critter midway through taking a kibble, if any -- what the demos put
     * in the status line. Her watcher is deliberately not included: she can
     * be looking at something at the far end of the level while you are
     * nowhere near her, and that is not news.
     */
    s.pressing = function () {
      for (var i = 0; i < critters.length; i++) {
        if (critters[i].here && critters[i].target >= 0) return critters[i];
      }
      return null;
    };

    /**
     * How far along a theft of kibble `i` is, 0..1, or -1 if nothing is
     * eyeing it. The demos use it to shake the kibble and close a ring round
     * it, so you can see the race you are in.
     */
    s.eyeing = function (i) {
      for (var k = 0; k < critters.length; k++) {
        var c = critters[k];
        if (c.here && c.target === i) {
          return Math.max(0, Math.min(1, 1 - c.timer / c.cfg.takes));
        }
      }
      return -1;
    };

    /** Whether a kibble is gone for good. */
    s.lost = function (i) { return s.stolen.indexOf(i) >= 0; };

    /** Once she has her toy back, nothing else is interesting. */
    s.finish = function () {
      s.done = true; s.watching = false; s.watcher = null;
      for (var i = 0; i < critters.length; i++) critters[i].here = false;
    };

    return s;
  }

  return { CFG: CFG, KINDS: KINDS, flock: flock };
});
