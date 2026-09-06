/* The fetch round: she throws him up, you run her under him.
 *
 * The control was the hard part, and it is settled. Two earlier attempts put
 * you in the air *as the toy*, steering with left/right -- except left/right
 * changed his acceleration, not his position, so pressing right did not move
 * him right, it bent his path. On a flight of about a second that is not
 * something you can read. So the control is inverted: you move *Ginger*, on
 * the ground, directly. One goal -- be under him when he comes down.
 *
 * What was not settled was the round. The first version threw five times from
 * a fixed list of aims, every throw the same height and the same 1.8 seconds
 * in the air, in every level, forever. It read well the first time and was
 * over by the third: nothing changed, nothing escalated, and there was
 * nothing to do but hold a direction.
 *
 * So three things vary now.
 *
 *   **The throw.** A lob hangs; a flick is low, fast and quickly over; a high
 *   one goes up forever and lands a long way out. Where it lands is chosen
 *   from where she is standing and how far she can actually get in the time
 *   the throw gives her, so every throw is reachable and none is free.
 *
 *   **The rival.** From the third throw the other dog turns up and runs for
 *   the same spot, arriving later than the toy at first and earlier as the
 *   round goes on. Two answers: be standing there first, or **crow** at it --
 *   the toy is a rooster, and it works exactly once per throw.
 *
 *   **The length.** Five throws, and a run of three or more earns you more,
 *   up to eight. A good round lasts longer than a poor one.
 *
 * Rules and physics only, no drawing. The variety is seeded, not random:
 * `create({ seed })` plays the same round every time, so a test can replay
 * one and both demos can be handed the same round to compare.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Bonus = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DT = 1 / 120;

  var CFG = {
    throws: 5,          // the round you are promised
    extra: 3,           // and the most a good run can add to it
    gravity: 7.0,       // gentle: he hangs, which is what makes it readable
    mouth: 0.95,        // where he leaves from, and where he can be caught
    windUp: 0.85,       // her wind-up, and your look at where he is going
    dogSpeed: 4.6,      // how fast she runs
    dogEase: 22.0,      // how sharply she gets up to it
    catchRadius: 0.78,  // generous: this is a reunion, not a reflex test
    settle: 0.9,        // beat after each throw
    range: 6.2,         // how far either side of her spot she may run
    spin: 3.4,
    streakFor: 3,       // the run that starts earning extra throws

    /* The three shapes, and how far out each is willing to land -- as a
     * fraction of the ground she can actually cover in that throw's own hang
     * time, so `far` means "at the edge of possible" for every shape rather
     * than a distance that happens to be brutal for the quick one. */
    kinds: {
      lob:   { up: 6.30, near: 0.30, far: 0.94 },
      flick: { up: 4.20, near: 0.40, far: 0.96 },
      high:  { up: 7.00, near: 0.55, far: 0.98 }
    },
    order: ['lob', 'flick', 'high'],

    /* The other dog. It does not appear until the basics have been shown
     * twice, and it is timed to arrive *after* the toy to begin with. */
    rivalFrom: 2,       // first throw it turns up for, counting from zero
    rivalSpeed: 3.6,
    rivalTop: 6.2,      // however far back it starts, it is still a dog
    rivalLate: 1.18,    // it reaches the spot at this much of the hang time
    rivalKeen: 0.34,    // and that shrinks by this much as the round hardens
    rivalWait: 0.3,     // it sets off this long after the throw
    flinch: 1.15,       // how long a crow stops it dead
    backOff: 1.5        // and how far it gives up while it recovers
  };

  /** Deterministic, tiny, and good enough to shuffle a round with. */
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hangFor(cfg, up) { return 2 * up / cfg.gravity; }

  /** The tallest throw in the set -- both demos frame from this. */
  function arcHeight(cfg) {
    cfg = cfg || CFG;
    var up = 0;
    for (var k in cfg.kinds) up = Math.max(up, cfg.kinds[k].up);
    return cfg.mouth + up * up / (2 * cfg.gravity);
  }

  /**
   * The ground the round covers, in the caller's own bonus coordinates: her
   * patch plus the strip the other dog waits in. Both demos frame from this.
   */
  function span(s) {
    var pad = 2.0;
    if (!s || s.lo === s.hi) {
      var edge = (s ? s.cfg : CFG).range + pad;
      return { min: -edge, max: edge };
    }
    return { min: s.lo - pad, max: s.hi + pad };
  }

  /** Seconds the toy is in the air, for the throw in progress. */
  function hangTime(sOrCfg) {
    if (sOrCfg && sOrCfg.throwUp) return hangFor(sOrCfg.cfg, sOrCfg.throwUp);
    var cfg = sOrCfg || CFG;
    return hangFor(cfg, cfg.kinds.lob.up);
  }

  /** Where the toy will come down, in world units. Drawn as the target. */
  function landing(s) {
    var cfg = s.cfg, vy = s.toy.vy, y = s.toy.y, x = s.toy.x;
    var floor = s.dog.y + cfg.mouth;
    for (var i = 0; i < 4096; i++) {
      vy -= cfg.gravity * DT;
      x += s.toy.vx * DT;
      y += vy * DT;
      if (vy < 0 && y <= floor) break;
    }
    return x;
  }

  function create(opts) {
    opts = opts || {};
    var cfg = {};
    for (var k in CFG) cfg[k] = opts[k] === undefined ? CFG[k] : opts[k];
    // A round with no seed is a different round each time, which is the
    // point; a test hands one in and gets the same round back.
    var seed = opts.seed === undefined
      ? ((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0) : opts.seed;
    var rand = rng(seed);

    var s = {
      cfg: cfg,
      seed: seed,
      phase: 'idle',        // idle | wind | flight | settle | done
      t: 0,
      throwsLeft: cfg.throws,
      throwIndex: 0,
      earned: 0,            // throws a run has added to the promised five
      caught: 0,
      lost: 0,              // taken off her by the other dog
      streak: 0,
      best: 0,
      score: 0,
      home: 0,              // where she started
      lo: 0, hi: 0,         // the ends of her patch, inside the level
      bounds: null,         // how much floor there is, if the caller said
      dog: { x: 0, y: 0, vx: 0, dir: -1 },
      toy: { x: 0, y: 0, vx: 0, vy: 0, spin: 0, held: true },
      // The throw in progress, so the demos can say what is coming.
      throwKind: 'lob',
      throwUp: cfg.kinds.lob.up,
      aimedAt: 0,
      rival: { active: false, x: 0, vx: 0, dir: -1, target: 0, speed: 0,
               flinch: 0, used: false, has: false },
      events: []            // 'throw', 'catch', 'miss', 'steal', 'flinch'
    };

    /**
     * `bounds` is how much level there is, in the caller's own bonus
     * coordinates. Without it the round is simply centred on her, which is
     * what it used to do -- and in a level whose goal is near the right-hand
     * wall that put her, the toy and the other dog out past the end of the
     * floor. With it the patch keeps its full width and slides inside.
     */
    s.start = function (dogX, dogY, bounds) {
      s.home = dogX;
      var half = cfg.range;
      s.bounds = bounds || null;
      s.lo = dogX - half; s.hi = dogX + half;
      if (bounds) {
        if (s.hi > bounds.max) { var over = s.hi - bounds.max; s.lo -= over; s.hi -= over; }
        if (s.lo < bounds.min) { var under = bounds.min - s.lo; s.lo += under; s.hi += under; }
        // A level too narrow for the whole patch gets what there is.
        s.lo = Math.max(s.lo, bounds.min); s.hi = Math.min(s.hi, bounds.max);
        s.hi = Math.max(s.hi, s.lo + 1.0);
      }
      // Whatever else, the patch contains the ground she is standing on:
      // being shoved sideways on the first frame of the round would be a
      // worse answer than a patch that reaches a little further.
      s.lo = Math.min(s.lo, dogX); s.hi = Math.max(s.hi, dogX);
      s.dog.x = dogX; s.dog.y = dogY; s.dog.vx = 0; s.dog.dir = -1;
      s.phase = 'wind'; s.t = 0;
      s.throwsLeft = cfg.throws; s.throwIndex = 0; s.earned = 0;
      s.caught = 0; s.lost = 0; s.streak = 0; s.best = 0; s.score = 0;
      s.toy.held = true;
      s.toy.x = dogX; s.toy.y = dogY + cfg.mouth;
      s.toy.vx = s.toy.vy = s.toy.spin = 0;
      s.rival.active = false; s.rival.has = false;
      return s;
    };

    /** 0 at the start of an easy round, 1 once it is asking properly. */
    function ramp() {
      return Math.min(1, (s.throwIndex + s.best) / 8);
    }

    /** Ground she can cover in `hang`, allowing for getting up to speed. */
    function covers(hang) {
      return Math.max(0.9, cfg.dogSpeed * hang - 0.35) + cfg.catchRadius;
    }

    function pickKind() {
      // The first two are plain lobs: the round should teach itself before
      // it starts varying.
      if (s.throwIndex < 2) return 'lob';
      var order = cfg.order;
      return order[Math.floor(rand() * order.length) % order.length];
    }

    function launch() {
      var kindName = pickKind(), k = cfg.kinds[kindName];
      var hang = hangFor(cfg, k.up);
      var d = ramp();
      var want = (k.near + (k.far - k.near) * d) * covers(hang) * (0.82 + 0.18 * rand());

      // Which way, with room to run: she cannot chase past the ends of her
      // patch, so a throw toward the end she is already standing at would be
      // clamped into a gift.
      var roomR = s.hi - s.dog.x;
      var roomL = s.dog.x - s.lo;
      var side = rand() < 0.5 ? -1 : 1;
      if (side > 0 && roomR < want * 0.7) side = -1;
      else if (side < 0 && roomL < want * 0.7) side = 1;
      // Trim to the room on that side rather than letting the clamp below do
      // it: clamping parks throw after throw against the same end wall, which
      // is its own kind of repetition. Trim to a *varying* fraction of the
      // room, or the pile-up just moves to wherever the trim lands.
      var room = (side > 0 ? roomR : roomL) - 0.25;
      if (want > room) want = room * (0.72 + 0.28 * rand());

      var landX = Math.max(s.lo, Math.min(s.hi, s.dog.x + side * want));
      // Never so close that standing still catches it.
      if (Math.abs(landX - s.dog.x) < cfg.catchRadius + 0.4) {
        landX = Math.max(s.lo, Math.min(s.hi, s.dog.x - side * (cfg.catchRadius + 0.9)));
      }

      s.throwKind = kindName;
      s.throwUp = k.up;
      s.aimedAt = landX;
      s.toy.x = s.dog.x;
      s.toy.y = s.dog.y + cfg.mouth;
      s.toy.vy = k.up;
      // Aimed at a spot, not thrown at a speed: the toy lands where the
      // throw says, so the round can promise you a reachable target.
      s.toy.vx = (landX - s.dog.x) / hang;
      s.toy.spin = 0;
      s.toy.held = false;

      // The other dog sets off for the same spot, timed to arrive a little
      // after the toy early on and a little before it by the end.
      var r = s.rival;
      r.used = false; r.flinch = 0; r.has = false;
      r.active = s.throwIndex >= cfg.rivalFrom;
      if (r.active) {
        var arrive = Math.max(0.45, hang * (cfg.rivalLate - cfg.rivalKeen * d));
        var run = Math.max(0.6, (arrive - cfg.rivalWait) * cfg.rivalSpeed);
        // It comes in from beyond the landing spot, so the two of them
        // converge on it from opposite sides -- but never from past the end
        // of the floor, so it waits just outside her patch instead and runs
        // the distance it has in the time it has.
        var from = landX >= s.dog.x ? 1 : -1;
        var edge = from > 0 ? s.hi + 1.4 : s.lo - 1.4;
        edge = onFloor(edge);
        var startX = landX + from * run;
        r.x = from > 0 ? Math.min(startX, edge) : Math.max(startX, edge);
        r.speed = Math.min(cfg.rivalTop,
          Math.abs(r.x - landX) / Math.max(0.25, arrive - cfg.rivalWait));
        r.target = landX;
        r.dir = -from;
        r.vx = 0;
      }

      s.phase = 'flight';
      s.t = 0;
      s.events.push('throw');
    }

    /**
     * A crow stops the other dog dead and pushes it back a stride. Once per
     * throw, and only while it is actually coming. Returns whether it landed.
     */
    s.crow = function () {
      var r = s.rival;
      if (s.phase !== 'flight' || !r.active || r.used || r.has) return false;
      r.used = true;
      r.flinch = cfg.flinch;
      r.x -= (r.target - r.x >= 0 ? 1 : -1) * cfg.backOff;
      s.events.push('flinch');
      return true;
    };

    /** Nothing in the round should stand where the level has no floor. */
    function onFloor(x) {
      if (!s.bounds) return x;
      return Math.max(s.bounds.min - 0.4, Math.min(s.bounds.max + 0.4, x));
    }

    function moveRival(dt) {
      var r = s.rival;
      if (!r.active) return;
      if (r.flinch > 0) { r.flinch = Math.max(0, r.flinch - dt); r.vx = 0; return; }
      if (s.t < cfg.rivalWait && s.phase === 'flight') return;
      var speed = r.speed || cfg.rivalSpeed;
      var to = (r.has ? r.target + (r.dir * 12) : r.target) - r.x;
      var step = speed * dt;
      if (Math.abs(to) <= step) { r.x = r.has ? r.x : r.target; r.vx = 0; return; }
      r.vx = to > 0 ? speed : -speed;
      r.dir = to > 0 ? 1 : -1;
      r.x = onFloor(r.x + r.vx * dt);
    }

    function land(outcome) {
      if (outcome === 'catch') {
        s.caught++;
        s.streak++;
        s.best = Math.max(s.best, s.streak);
        // Worth more under pressure, and worth more on a run.
        // Worth an extra point only if the other dog was still breathing down
        // her neck: crowing at it is the safe play and standing your ground
        // is the brave one, and the score should say which you took.
        var pressed = s.rival.active &&
                      Math.abs(s.rival.x - s.toy.x) < 2.4 ? 1 : 0;
        s.score += 1 + (s.streak > 1 ? 1 : 0) + pressed;
        s.toy.held = true;
        s.toy.x = s.dog.x;
        s.rival.active = false;
        // A run keeps the round going.
        if (s.streak >= cfg.streakFor && s.earned < cfg.extra) {
          s.earned++; s.throwsLeft++;
        }
        s.events.push('catch');
      } else {
        s.streak = 0;
        s.toy.y = s.dog.y;                  // it comes down at her feet
        if (outcome === 'steal') {
          s.lost++;
          s.rival.has = true;
          s.events.push('steal');
        } else {
          s.events.push('miss');
        }
      }
      s.throwsLeft--;
      s.throwIndex++;
      s.phase = s.throwsLeft > 0 ? 'settle' : 'done';
      s.t = 0;
    }

    s.update = function (dt, input) {
      input = input || {};
      s.t += dt;

      // She is steerable the whole time, including the wind-up, so you can
      // set off the moment you see where it is going.
      var want = ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * cfg.dogSpeed;
      var k = Math.min(1, cfg.dogEase * dt);
      s.dog.vx += (want - s.dog.vx) * k;
      s.dog.x += s.dog.vx * dt;
      if (s.dog.x < s.lo) { s.dog.x = s.lo; s.dog.vx = 0; }
      if (s.dog.x > s.hi) { s.dog.x = s.hi; s.dog.vx = 0; }
      if (Math.abs(s.dog.vx) > 0.15) s.dog.dir = s.dog.vx > 0 ? 1 : -1;

      moveRival(dt);

      if (s.phase === 'wind') {
        s.toy.x = s.dog.x;                    // still in her mouth
        s.toy.y = s.dog.y + cfg.mouth;
        if (s.t >= cfg.windUp) launch();
        return s;
      }

      if (s.phase === 'flight') {
        s.toy.vy -= cfg.gravity * dt;
        s.toy.x += s.toy.vx * dt;
        s.toy.y += s.toy.vy * dt;
        s.toy.spin += dt * cfg.spin;

        if (s.toy.vy < 0 && s.toy.y <= s.dog.y + cfg.mouth) {
          s.toy.y = s.dog.y + cfg.mouth;
          // She wins a tie: standing on the spot is the answer to the other
          // dog, and it should not be taken away by half a unit.
          if (Math.abs(s.toy.x - s.dog.x) <= cfg.catchRadius) land('catch');
          else if (s.rival.active && s.rival.flinch <= 0 &&
                   Math.abs(s.toy.x - s.rival.x) <= cfg.catchRadius * 1.1) land('steal');
          else land('miss');
        }
        return s;
      }

      if (s.phase === 'settle') {
        if (s.toy.held) { s.toy.x = s.dog.x; s.toy.y = s.dog.y + cfg.mouth; }
        else if (s.rival.has) { s.toy.x = s.rival.x; s.toy.y = s.dog.y + 0.55; }
        if (s.t >= cfg.settle) {
          // However it ended, she has it back for the next throw.
          s.rival.active = false; s.rival.has = false;
          s.toy.held = true;
          s.toy.x = s.dog.x; s.toy.y = s.dog.y + cfg.mouth;
          s.phase = 'wind';
          s.t = 0;
        }
      }
      return s;
    };

    /** Throws in this round as it stands -- the promised five plus earned. */
    s.total = function () { return cfg.throws + s.earned; };

    s.drain = function () { var e = s.events; s.events = []; return e; };

    return s;
  }

  return {
    CFG: CFG, create: create, arcHeight: arcHeight, span: span,
    hangTime: hangTime, landing: landing
  };
});
