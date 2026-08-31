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
  var api = factory(root.Jump || (typeof require === 'function' ? require('./jump.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Bonus = api;
})(typeof self !== 'undefined' ? self : this, function (Jump) {
  'use strict';

  var G = Jump ? Jump.C.GRAVITY : 24.0;
  var DT = 1 / 120;                // fixed step for the planning arcs

  var CFG = {
    throws: 3,
    windUp: 0.55,          // seconds Ginger spends winding up
    launchUp: 11.5,        // upward launch -> ~0.96s of hang time, 3.7 units up
    launchOut: 2.4,        // and forward: he lands 2.65 units off if you idle
    steer: 13.0,           // air control, units/s^2
    steerMax: 6.0,         // and the sideways speed it tops out at
    catchRadius: 0.70,     // how close to her counts as a catch
    catchScore: 5,         // a catch is worth this many treats -- on the throw
                           // that leads away, exactly as much as all of them
    treats: 5,
    treatRadius: 0.40,
    reach: 0.70,           // how far into the steerable envelope treats sit
    settle: 1.1            // pause after landing before the next throw
  };

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
      vy -= G * DT;
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
      s.toy.x = dogX;
      s.toy.y = dogY;
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
        s.toy.vy -= G * dt;
        s.toy.x += s.toy.vx * dt;
        s.toy.y += s.toy.vy * dt;
        s.toy.spin += dt * 7.0;

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
    create: create, nominalArc: nominalArc, arc: arc,
    layTreats: layTreats, CFG: CFG
  };
});
