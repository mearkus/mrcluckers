/* The bonus round: Ginger throws Mr. Cluckers, you steer him through the air.
 *
 * This is rules and physics only -- no drawing. Both demos run the same
 * instance and render it their own way, which is what keeps the 2D and 3D
 * versions playing identically rather than merely looking similar.
 *
 * Coordinates are the level's own world units (Y up), so a caller in the
 * canvas demo converts exactly as it does for everything else.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Bonus = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DT = 1 / 120;                // fixed step for the planning arcs

  /* The throw does NOT use the platformer's gravity, and that is deliberate.
   *
   * At 24 units/s^2 a throw worth steering peaks about 3.7 units up and is
   * over in 0.96s. Nothing that tall fits a phone screen -- the toy left the
   * frame entirely in portrait -- and 0.96s is not long enough to read where
   * he is going and do something about it. A tossed plush hangs; leaning into
   * that buys a low, slow arc you can actually see and steer.
   *
   * The numbers below are chosen together so the whole throw fits the
   * smallest view either demo can produce. Change one and check arcHeight()
   * against the framing, or the toy goes off-screen again.
   */
  var CFG = {
    throws: 3,
    gravity: 7.0,          // gentle: he hangs rather than drops
    windUp: 0.9,           // seconds Ginger spends winding up
    launchUp: 4.35,        // -> ~1.25s of hang, peaking 2.3 units above her feet
    launchOut: 1.5,        // and forward: he lands ~1.9 units off if you idle
    steer: 6.0,            // air control, units/s^2
    steerMax: 3.2,         // and the sideways speed it tops out at
    catchRadius: 0.95,     // how close to her counts as a catch -- generous on
                           // purpose, and drawn on the ground so you can aim
    catchScore: 3,
    treats: 5,
    treatRadius: 0.42,
    reach: 0.86,           // treats sit near the full-steer path, so holding a
                           // direction sweeps them up -- aiming, not modulating
    spin: 3.4,             // radians/s the toy turns over while thrown
    settle: 1.2            // pause after landing before the next throw
  };

  /** Peak of the throw above the dog's feet, in world units.
   *
   * Both demos frame the round from this rather than from a number typed into
   * their own file, so the camera cannot drift out of step with the physics.
   */
  function arcHeight(cfg) {
    cfg = cfg || CFG;
    return 0.95 + cfg.launchUp * cfg.launchUp / (2 * cfg.gravity);
  }

  /**
   * How far the round can range either side of the dog, in world units,
   * counting both extremes of steering and every treat it might lay.
   *
   * A camera built from this cannot crop the round, whatever the screen. The
   * first version framed to a number typed into each demo, and the toy flew
   * off the top of a phone in portrait while every scoring test still passed.
   */
  function extent(dir, cfg) {
    cfg = cfg || CFG;
    var x0 = 0.35 * dir, y0 = 0.95;
    var lo = Math.min(0, x0), hi = Math.max(0, x0);
    function span(pts) {
      for (var i = 0; i < pts.length; i++) {
        if (pts[i].x < lo) lo = pts[i].x;
        if (pts[i].x > hi) hi = pts[i].x;
      }
    }
    span(arc(x0, y0, dir, 1, cfg));
    span(arc(x0, y0, dir, -1, cfg));
    span(arc(x0, y0, dir, 0, cfg));
    for (var i = 0; i < cfg.throws; i++) span(layTreats(x0, y0, dir, i, cfg));
    return { min: lo, max: hi };
  }

  /**
   * Where the toy comes down if you stop steering right now.
   *
   * This is what makes the round readable: both demos draw it on the ground
   * as a moving marker, so steering has a visible consequence at the moment
   * you steer rather than a second later when he lands. Without it you are
   * integrating acceleration in your head, which is the same reason the round
   * felt like guesswork.
   */
  function predictLanding(s) {
    var cfg = s.cfg;
    var vy = s.toy.vy, y = s.toy.y, x = s.toy.x, floor = s.dog.y + 0.95;
    for (var i = 0; i < 4096; i++) {
      vy -= cfg.gravity * DT;
      x += s.toy.vx * DT;
      y += vy * DT;
      if (vy < 0 && y <= floor) break;
    }
    return x;
  }

  /**
   * Integrate one throw with a constant steering input. `steer` is -1, 0 or 1
   * in *world* terms. Returns the sampled path; every arc shares the same
   * vertical motion, so only x differs between them.
   */
  function arc(x0, y0, dir, steer, cfg) {
    cfg = cfg || CFG;
    var pts = [];
    var vx = cfg.launchOut * dir, vy = cfg.launchUp, x = x0, y = y0;
    for (var i = 0; i < 4096; i++) {
      if (steer) {
        vx += steer * cfg.steer * DT;
        if (vx > cfg.steerMax) vx = cfg.steerMax;
        if (vx < -cfg.steerMax) vx = -cfg.steerMax;
      }
      vy -= cfg.gravity * DT;
      x += vx * DT;
      y += vy * DT;
      pts.push({ x: x, y: y, t: (i + 1) * DT });
      if (vy < 0 && y <= y0) break;
    }
    return pts;
  }

  /** Where the toy goes if you never touch the controls. */
  function nominalArc(x0, y0, dir, cfg) {
    return arc(x0, y0, dir, 0, cfg);
  }

  /** Shortest distance from a point to a sampled path. */
  function distToPath(path, x, y) {
    var best = Infinity;
    for (var i = 0; i < path.length; i++) {
      var dx = path[i].x - x, dy = path[i].y - y;
      var d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  /**
   * Treats are placed by asking the physics where the toy *could* be, rather
   * than by guessing offsets: each one sits a fixed fraction of the way from
   * the do-nothing arc to the hardest steer in one direction. So they are
   * always just reachable, and they stay that way if the constants change.
   *
   * Each is then checked against the whole do-nothing path rather than
   * against the sample it came from -- near the apex the arc is horizontal,
   * so a sideways offset there buys no distance at all and the treat would
   * be swept up by a player who never touched the controls.
   *
   * The side alternates by throw. Away from Ginger, treats and a catch pull
   * against each other and you have to choose how many to take before
   * turning back; toward her, the greedy line is also the safe one.
   */
  function layTreats(x0, y0, dir, index, cfg) {
    cfg = cfg || CFG;
    var side = (index % 2 === 0) ? dir : -dir;   // first throw leads away
    var mid = nominalArc(x0, y0, dir, cfg);
    var out = arc(x0, y0, dir, side, cfg);
    var n = Math.min(mid.length, out.length);
    var clear = cfg.treatRadius * 1.3;
    // Stop short of the landing so there is still air left to turn around in.
    var last = Math.min(n - 1, Math.round(0.86 * (n - 1)));

    function place(k) {
      return { x: mid[k].x + cfg.reach * (out[k].x - mid[k].x), y: mid[k].y };
    }
    // Where the envelope first buys more than a treat's width of daylight.
    var k0 = 0;
    while (k0 <= last) {
      var q = place(k0);
      if (distToPath(mid, q.x, q.y) >= clear) break;
      k0++;
    }
    if (k0 > last) return [];       // no steerable room on this throw at all

    var treats = [];
    var span = last - k0;
    for (var i = 0; i < cfg.treats; i++) {
      var k = k0 + Math.round(span * (i / Math.max(1, cfg.treats - 1)));
      var p = place(k);
      if (distToPath(mid, p.x, p.y) < clear) continue;
      treats.push({ x: p.x, y: p.y, taken: false });
    }
    return treats;
  }

  function create(opts) {
    opts = opts || {};
    var cfg = {};
    for (var k in CFG) cfg[k] = opts[k] === undefined ? CFG[k] : opts[k];

    var s = {
      cfg: cfg,
      phase: 'idle',      // idle | wind | flight | settle | done
      t: 0,
      throwsLeft: cfg.throws,
      throwIndex: 0,
      score: 0,
      treatsTaken: 0,
      caught: 0,          // times she caught him cleanly
      treats: [],
      toy: { x: 0, y: 0, vx: 0, vy: 0, spin: 0 },
      dog: { x: 0, y: 0, dir: -1 },
      events: []          // drained by the caller: 'squeak', 'catch', 'land'
    };

    s.start = function (dogX, dogY, dir) {
      s.dog.x = dogX;
      s.dog.y = dogY;
      s.dog.dir = dir === undefined ? -1 : dir;
      s.phase = 'wind';
      s.t = 0;
      s.throwsLeft = cfg.throws;
      s.throwIndex = 0;
      s.score = 0;
      s.treatsTaken = 0;
      s.caught = 0;
      s.treats = [];
      // He is in her mouth from the moment the round starts, not standing in
      // the middle of her waiting to be thrown.
      s.toy.x = dogX + 0.35 * s.dog.dir;
      s.toy.y = dogY + 0.95;
      s.toy.vx = s.toy.vy = s.toy.spin = 0;
      return s;
    };

    function launch() {
      s.toy.x = s.dog.x + 0.35 * s.dog.dir;
      s.toy.y = s.dog.y + 0.95;
      s.toy.vx = cfg.launchOut * s.dog.dir;
      s.toy.vy = cfg.launchUp;
      s.toy.spin = 0;
      s.treats = layTreats(s.toy.x, s.toy.y, s.dog.dir, s.throwIndex, cfg);
      s.phase = 'flight';
      s.t = 0;
    }

    s.update = function (dt, input) {
      input = input || {};
      s.t += dt;

      if (s.phase === 'wind') {
        if (s.t >= cfg.windUp) launch();
        return s;
      }

      if (s.phase === 'flight') {
        var steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        if (steer) {
          s.toy.vx += steer * cfg.steer * dt;
          if (s.toy.vx > cfg.steerMax) s.toy.vx = cfg.steerMax;
          if (s.toy.vx < -cfg.steerMax) s.toy.vx = -cfg.steerMax;
        }
        s.toy.vy -= cfg.gravity * dt;
        s.toy.x += s.toy.vx * dt;
        s.toy.y += s.toy.vy * dt;
        s.toy.spin += dt * cfg.spin;

        for (var i = 0; i < s.treats.length; i++) {
          var tr = s.treats[i];
          if (tr.taken) continue;
          var dx = tr.x - s.toy.x, dy = tr.y - s.toy.y;
          if (dx * dx + dy * dy < cfg.treatRadius * cfg.treatRadius) {
            tr.taken = true;
            s.score++;
            s.treatsTaken++;
            s.events.push('squeak');
          }
        }

        // Landing is measured at her mouth height, which is where he left.
        if (s.toy.vy < 0 && s.toy.y <= s.dog.y + 0.95) {
          s.toy.y = s.dog.y + 0.95;
          if (Math.abs(s.toy.x - s.dog.x) < cfg.catchRadius) {
            s.caught++;
            s.score += cfg.catchScore;
            s.events.push('catch');
          } else {
            s.toy.y = s.dog.y;
            s.events.push('land');
          }
          s.throwsLeft--;
          s.throwIndex++;
          s.phase = s.throwsLeft > 0 ? 'settle' : 'done';
          s.t = 0;
        }
        return s;
      }

      if (s.phase === 'settle' && s.t >= cfg.settle) {
        s.phase = 'wind';
        s.t = 0;
        s.toy.x = s.dog.x + 0.35 * s.dog.dir;   // she picks him back up
        s.toy.y = s.dog.y + 0.95;
        s.toy.vx = s.toy.vy = 0;
      }
      return s;
    };

    s.drain = function () {
      var e = s.events;
      s.events = [];
      return e;
    };

    return s;
  }

  return {
    create: create, nominalArc: nominalArc, arc: arc, layTreats: layTreats,
    arcHeight: arcHeight, extent: extent, predictLanding: predictLanding,
    CFG: CFG
  };
});
