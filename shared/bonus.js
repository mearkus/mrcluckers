/* The fetch round: she throws him up, you run her under him.
 *
 * This is the third attempt, and the first two failed the same way. They put
 * you in the air *as the toy*, steering with left/right -- except left/right
 * changed his acceleration, not his position, so pressing right did not move
 * him right, it bent his path. On a flight of about a second that is not
 * something you can read, let alone aim, and no amount of retuning the
 * numbers fixed it. A landing marker helped you see the consequence, which
 * only papered over the control.
 *
 * So the control is inverted. You move *Ginger*, on the ground, directly:
 * press right and she goes right. One goal -- be under him when he comes
 * down -- and one thing to watch. It is the oldest catching game there is,
 * and it is legible in the second you have.
 *
 * Rules and physics only, no drawing, and no randomness: throw N is always
 * throw N, so both demos show the same round and a test can play it.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Bonus = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DT = 1 / 120;

  var CFG = {
    throws: 5,
    gravity: 7.0,       // gentle: he hangs, which is what makes it readable
    launchUp: 6.3,      // -> about 1.8s in the air, peaking 2.8 units up
    mouth: 0.95,        // where he leaves from, and where he can be caught
    windUp: 0.85,       // her wind-up, and your look at where he is going
    dogSpeed: 4.6,      // how fast she runs -- she covers 8 units in a flight
    dogEase: 22.0,      // how sharply she gets up to it
    catchRadius: 0.78,  // generous: this is a reunion, not a reflex test
    settle: 0.9,        // beat after each throw
    range: 6.2,         // how far either side of her spot she may run
    spin: 3.4,
    // Where throw N is aimed, as a distance from where she starts. They
    // alternate sides and get further out, so the round teaches itself.
    aims: [1.6, -2.4, 3.4, -4.3, 5.0, -5.4, 4.6, -3.6]
  };

  /** Peak of the throw above her feet -- both demos frame from this. */
  function arcHeight(cfg) {
    cfg = cfg || CFG;
    return cfg.mouth + cfg.launchUp * cfg.launchUp / (2 * cfg.gravity);
  }

  /** How far the round can range either side of where she starts. */
  function extent(cfg) {
    cfg = cfg || CFG;
    var far = Math.max.apply(null, cfg.aims.map(Math.abs));
    var edge = Math.max(far, cfg.range) + 1.0;
    return { min: -edge, max: edge };
  }

  /** Seconds the toy is in the air. */
  function hangTime(cfg) {
    cfg = cfg || CFG;
    return 2 * cfg.launchUp / cfg.gravity;
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

    var s = {
      cfg: cfg,
      phase: 'idle',        // idle | wind | flight | settle | done
      t: 0,
      throwsLeft: cfg.throws,
      throwIndex: 0,
      caught: 0,
      streak: 0,
      best: 0,
      score: 0,
      home: 0,              // where she started, and the middle of her run
      dog: { x: 0, y: 0, vx: 0, dir: -1 },
      toy: { x: 0, y: 0, vx: 0, vy: 0, spin: 0, held: true },
      events: []            // 'throw', 'catch', 'miss'
    };

    s.start = function (dogX, dogY) {
      s.home = dogX;
      s.dog.x = dogX; s.dog.y = dogY; s.dog.vx = 0; s.dog.dir = -1;
      s.phase = 'wind'; s.t = 0;
      s.throwsLeft = cfg.throws; s.throwIndex = 0;
      s.caught = 0; s.streak = 0; s.best = 0; s.score = 0;
      s.toy.held = true;
      s.toy.x = dogX; s.toy.y = dogY + cfg.mouth;
      s.toy.vx = s.toy.vy = s.toy.spin = 0;
      return s;
    };

    function launch() {
      var aim = cfg.aims[s.throwIndex % cfg.aims.length];
      s.toy.x = s.dog.x;
      s.toy.y = s.dog.y + cfg.mouth;
      s.toy.vy = cfg.launchUp;
      // Aimed at a spot, not thrown at a speed: the toy lands where the
      // throw says, so the round can promise you a reachable target.
      s.toy.vx = aim / hangTime(cfg);
      s.toy.spin = 0;
      s.toy.held = false;
      s.phase = 'flight';
      s.t = 0;
      s.events.push('throw');
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
      var lo = s.home - cfg.range, hi = s.home + cfg.range;
      if (s.dog.x < lo) { s.dog.x = lo; s.dog.vx = 0; }
      if (s.dog.x > hi) { s.dog.x = hi; s.dog.vx = 0; }
      if (Math.abs(s.dog.vx) > 0.15) s.dog.dir = s.dog.vx > 0 ? 1 : -1;

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
          if (Math.abs(s.toy.x - s.dog.x) <= cfg.catchRadius) {
            s.caught++;
            s.streak++;
            s.best = Math.max(s.best, s.streak);
            s.score += 1 + (s.streak > 1 ? 1 : 0);   // a run is worth more
            s.toy.held = true;
            s.toy.x = s.dog.x;
            s.events.push('catch');
          } else {
            s.streak = 0;
            s.toy.y = s.dog.y;                       // it bounces at her feet
            s.events.push('miss');
          }
          s.throwsLeft--;
          s.throwIndex++;
          s.phase = s.throwsLeft > 0 ? 'settle' : 'done';
          s.t = 0;
        }
        return s;
      }

      if (s.phase === 'settle') {
        if (s.toy.held) { s.toy.x = s.dog.x; s.toy.y = s.dog.y + cfg.mouth; }
        if (s.t >= cfg.settle) {
          s.toy.held = true;                  // she picks it back up
          s.toy.x = s.dog.x; s.toy.y = s.dog.y + cfg.mouth;
          s.phase = 'wind';
          s.t = 0;
        }
      }
      return s;
    };

    s.drain = function () { var e = s.events; s.events = []; return e; };

    return s;
  }

  return {
    CFG: CFG, create: create, arcHeight: arcHeight, extent: extent,
    hangTime: hangTime, landing: landing
  };
});
