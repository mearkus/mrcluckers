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
    flush: 2.2,        // how close alongside you get before it puts itself up
    flushUp: 1.0,      // and how far above or below still counts as alongside --
                       // walking *under* a squirrel is not crowding it, which
                       // matters now one can sit over the path and drop things
    boltRate: 2.0,     // how much faster it leaves when something startles it
    boltArc: 0.45,     // and the hop or the lift it gets away on
    rest: 5.0,         // and how much longer than usual it stays away after
    recall: 3.2,       // how far a squeak or a crow carries
    settle: 0.5,       // her head coming back round afterwards
    notice: 3.6,       // how near her perch has to be to take her attention
    reach: 2.0,        // how far from the perch it will go for a kibble
    wary: 2.8,         // it only starts once the kibble is on your screen --
                       // the demos show about five units across, so a theft
                       // begun further off than this is a tax, not a race
    takes: 3.2,        // seconds of eyeing a kibble before it takes it

    /* What it does to *him*. Taking Ginger's attention and taking a kibble
     * are both things that happen beside him rather than to him, and a
     * critter you can walk straight through is scenery with a scoreboard.
     * A squirrel still will not attack a plush rooster -- but it will sit
     * over your head and knock things down, which is exactly what a squirrel
     * does. */
    burst: false,      // does putting it up knock him about
    drops: 0,          // seconds between the things it throws down (0 = never)
    dropSpan: 2.4,     // how far either side of the perch it will aim
    dropFall: 5.5,     // and how far one falls before it is gone
    knock: 2.6,        // the shove either of those lands
    lift: 3.6,
    stun: 0.3,
    immune: 0.7,       // and how long before the same critter can land another
    gravity: 16.0      // what it drops falls at; slower than he does, to read
  };

  /* A bird visits more often and stays a shorter time, is quicker about a
   * theft -- it only has to drop, take and go -- and it sits *on* the ledge
   * you were going to land on, so going up off it is a faceful of wings.
   * Crowing at it from a distance clears the ledge without the shove, which
   * is the whole point of owning the verb.
   *
   * These are **overrides**, not a replacement. A kind that listed its own
   * complete set silently lost every field added to CFG afterwards -- birds
   * had no `flushUp` and so could not be disturbed at all, and no `immune`,
   * which would have let one shove him exactly once and then never again. */
  var CHANGES = {
    squirrel: {},
    bird: {
      period: 6.4, approach: 0.85, linger: 2.6, leave: 0.7,
      from: 3.4, arc: 0.75, startles: true,
      flush: 1.0, boltRate: 2.1, boltArc: 0.9, rest: 3.5,
      settle: 0.45, notice: 4.0, takes: 2.6, reach: 2.2,
      burst: true, knock: 2.4, lift: 4.0, stun: 0.28
    }
  };

  /** Every default, then what the kind changes: complete, by construction. */
  function settings(kind) {
    var out = {}, k;
    for (k in CFG) out[k] = CFG[k];
    for (k in CHANGES[kind]) out[k] = CHANGES[kind][k];
    return out;
  }

  var KINDS = { squirrel: settings('squirrel'), bird: settings('bird') };

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
        exit: c.cfg.side,     // which way it leaves; it never leaves through you
        bolting: false,       // startled: going now, and quickly
        rest: 0,              // extra seconds away, once something has been
        dropIn: 0,            // countdown to the next thing it knocks down
        cool: 0,              // it cannot land two shoves back to back
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
      // What a squirrel has knocked off its branch and is on its way down.
      // The caller draws these and asks whether one landed on him.
      acorns: [],           // {x, y, vy, from}
      // Shoves to apply this frame, drained like events: the rules decide how
      // hard, so both demos are knocked about identically.
      blows: [],            // {x, y, vx, vy, stun, kind}
      stolen: [],           // pickup indices carried off, in the order taken
      watching: false,      // is her attention on a critter
      watcher: null,        // which one
      settling: 0,          // her head coming back round
      done: false
    };

    function place(c) {
      var cfg = c.cfg, u = c.u;
      var from = c.home.x + cfg.from * cfg.side;   // where it came in from
      var away = c.home.x + cfg.from * c.exit;     // and where it is going
      var lift = 0, x, moving;
      if (u < cfg.approach) {
        var k = u / cfg.approach;
        x = from + (c.home.x - from) * k;
        moving = -cfg.side;
        // Coming in: a bird drops onto the perch rather than arriving at it.
        lift = cfg.arc * Math.sin(Math.PI * k) + cfg.arc * 0.6 * (1 - k);
      } else if (u < cfg.approach + cfg.linger) {
        x = c.home.x;
        moving = cfg.side;                      // sitting up, facing the way in
      } else {
        var k2 = (u - cfg.approach - cfg.linger) / cfg.leave;
        x = c.home.x + (away - c.home.x) * k2;
        moving = c.exit;
        // Going: a bird lifts off. A squirrel that has been startled gets a
        // hop out of it too, which is most of what makes a bolt read as a
        // bolt rather than as the thing having been switched off.
        var arc = c.bolting ? Math.max(cfg.arc, cfg.boltArc) : cfg.arc;
        lift = arc * 1.3 * k2;
      }
      c.x = x; c.y = c.home.y + lift; c.dir = moving;
      c.flying = lift > 0.02;
    }

    /**
     * Put one up. It does not vanish -- it *goes*: dropped straight into the
     * leaving leg of its visit, running it at `boltRate`, and away from
     * whatever startled it rather than back the way it came. It had been
     * switched off on the spot, which from the other side of the screen looks
     * like a bug and not like a squirrel.
     */
    function putUp(c, fromX, close) {
      if (!c.here || c.bolting) return false;
      // Going up in his face is a shove; being shouted at from across the
      // room is not. That difference is the whole reason to own a `crow`.
      if (close && c.cfg.burst && c.cool <= 0) {
        c.cool = c.cfg.immune;
        s.blows.push({ x: c.x, y: c.y, kind: c.kind,
                       vx: (c.x >= fromX ? -1 : 1) * c.cfg.knock,
                       vy: c.cfg.lift, stun: c.cfg.stun });
      }
      c.bolting = true;
      c.rest = c.cfg.rest;
      c.target = -1;
      c.dropIn = c.cfg.drops;
      c.exit = (fromX === undefined || c.home.x >= fromX) ? 1 : -1;
      c.u = Math.max(c.u, c.cfg.approach + c.cfg.linger);
      place(c);
      if (s.watcher === c) { s.watching = false; s.watcher = null;
                             s.settling = c.cfg.settle; }
      return true;
    }

    /**
     * Close enough to crowd it. Measured as a box, not a circle: sideways is
     * what bothers a critter, and being a body-length below it is not.
     * The flush and the will-it-come-back check share this, or a critter can
     * be locked out of a perch you were never close enough to move it from.
     */
    function crowding(c, x, y, perchY) {
      if (x === undefined) return false;
      var ay = perchY === undefined ? c.y : perchY;
      return Math.abs(x - c.x) < c.cfg.flush &&
             Math.abs((y === undefined ? ay : y) - ay) < c.cfg.flushUp;
    }

    /** Sitting on the perch, as opposed to arriving at it or leaving it. */
    function perchedAt(c) {
      return c.u >= c.cfg.approach && c.u < c.cfg.approach + c.cfg.linger;
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
        s.acorns.length = 0;
        s.watching = false; s.watcher = null;
        return s;
      }

      // What is already falling keeps falling, whatever the critters do next.
      for (var a = s.acorns.length - 1; a >= 0; a--) {
        var n = s.acorns[a];
        n.vy -= CFG.gravity * dt;
        n.y += n.vy * dt;
        var hit = world.x !== undefined &&
                  Math.abs(n.x - world.x) < 0.34 &&
                  Math.abs(n.y - (world.y === undefined ? n.y : world.y)) < 0.5;
        if (hit) {
          s.blows.push({ x: n.x, y: n.y, kind: 'acorn',
                         vx: (n.x >= world.x ? -1 : 1) * CFG.knock,
                         vy: CFG.lift, stun: CFG.stun });
        }
        // Gone when it lands on him or when it has fallen out of the picture.
        // The module does not know where the floor is, so it counts the drop.
        if (hit || n.from - n.y > CFG.dropFall) s.acorns.splice(a, 1);
      }

      for (var i = 0; i < critters.length; i++) {
        var c = critters[i], cfg = c.cfg;
        c.cool = Math.max(0, c.cool - dt);
        // A startled one runs its leaving leg fast, which is what shortens
        // the visit: nothing is hidden, it just gets out sooner. Only the
        // leaving leg -- carry the hurry into the gap between visits and it
        // is back within a second, which is a strobe, not a squirrel.
        var hurrying = c.bolting && c.u < c.cycle;
        c.u += dt * (hurrying ? cfg.boltRate : 1);
        // One that has been put up stays away longer than one that simply
        // finished its visit.
        var period = cfg.period + c.rest;
        if (c.u >= period) {
          // And it does not come back at all while you are stood on its
          // perch, or it would arrive into you and be put up again on the
          // frame it landed. Exactly the flush radius, not a hair more: any
          // wider and a critter can be locked out of a perch you were never
          // close enough to have startled it off, which silently removes the
          // one beside Ginger from levels where she waits a little back.
          if (!s.done && crowding({ cfg: cfg, x: c.home.x, y: c.home.y },
                                  world.x, world.y, c.home.y)) {
            c.u = period - 1e-4;
            c.here = false;
            continue;
          }
          c.u -= period * Math.floor(c.u / period);
          c.bolting = false; c.recalled = false; c.exit = cfg.side;
          c.rest = 0; c.target = -1; c.carry = -1; c.visits++;
        }
        c.here = c.u < c.cycle;
        if (!c.here) continue;
        place(c);
        if (c.bolting) continue;              // already going; leave it to it

        // Close enough to put it up yourself. A bird perches out of reach, so
        // in practice this is how you move a squirrel and a crow is how you
        // move a bird.
        if (crowding(c, world.x, world.y)) {
          putUp(c, world.x, true);      // close enough to wear the wings
          continue;
        }

        // Sitting over your head with something to hand. A squirrel will not
        // come down and fight a plush rooster, but it will drop things on
        // one, which is both truer and more use to a platformer.
        var overhead = perchedAt(c) && cfg.drops > 0 && world.x !== undefined &&
                       Math.abs(world.x - c.home.x) < cfg.dropSpan &&
                       (world.y === undefined || world.y < c.home.y - 0.4);
        if (overhead) {
          c.dropIn -= dt;
          if (c.dropIn <= 0) {
            c.dropIn = cfg.drops;
            s.acorns.push({ x: c.x, y: c.y, vy: 0, from: c.home.y });
          }
        } else {
          // A short fuse when you walk back under it, not a saved-up volley.
          c.dropIn = Math.min(c.dropIn <= 0 ? cfg.drops : c.dropIn, cfg.drops);
        }

        // Sitting on the perch, with a kibble within reach and you near
        // enough to watch it happen: it will take it.
        var perched = perchedAt(c);
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
          if (!q.here || q.recalled || q.bolting) continue;
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
        if (!c.cfg.startles || !c.here || c.bolting) continue;
        if (dist(x, y === undefined ? c.y : y, c.x, c.y) > c.cfg.recall) continue;
        var at = { x: c.x, y: c.y };
        if (putUp(c, x)) put.push(at);
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
        var c = critters[i];
        if (c.here && !c.bolting && c.target >= 0) return c;
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
        if (c.here && !c.bolting && c.target === i) {
          return Math.max(0, Math.min(1, 1 - c.timer / c.cfg.takes));
        }
      }
      return -1;
    };

    /**
     * The shoves landed since you last asked -- a bird going up in his face,
     * or something a squirrel knocked down onto him. The caller applies them,
     * so both demos are knocked about by the same numbers.
     */
    s.knocks = function () { var b = s.blows; s.blows = []; return b; };

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
