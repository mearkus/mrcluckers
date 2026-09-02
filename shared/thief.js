/* The other dog at the park.
 *
 * The vacuum shoves him, a squirrel takes Ginger's attention -- this one
 * takes *him*. It trots over, picks the toy up, carries it back down the
 * level and drops it. No damage, no distraction: you lose ground.
 *
 * Nothing here is lethal either, and it must never *become* lethal: the
 * carry is clamped to the surface the dog is standing on, so it can't set
 * him down in a pond. That is the whole reason it knows about the level.
 *
 * Counterplay is the same shape as the vacuum's -- be somewhere it isn't.
 * It trots slower than he runs, and it can't reach him above its head.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Thief = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CFG = {
    speed: 2.4,        // trotting -- he runs at 3.4, so he can be outrun
    notice: 5.0,       // how far off it spots him
    grab: 0.55,        // how close counts as picked up
    reach: 0.86,       // it cannot take him above this: jump and you are safe
    mouth: 0.52,       // how high he rides
    carry: 3.4,        // units it wants to take him back
    carrySpeed: 2.9,
    hold: 0.45,        // beat before it puts him down
    cooldown: 5.5,     // before it will bother again
    clear: 1.1         // never set him down closer than this to an edge
  };

  function surfaceUnder(level, x, y) {
    var best = null;
    for (var i = 0; i < level.platforms.length; i++) {
      var p = level.platforms[i];
      if (x < p.x || x > p.x + p.w) continue;
      if (Math.abs(y - p.y) > 0.2) continue;
      if (!best || p.y > best.y) best = p;
    }
    return best;
  }

  function create(level, spec, cfg) {
    cfg = cfg || CFG;
    var floor = surfaceUnder(level, spec.x, spec.y) ||
                { x: spec.x - 3, w: 6, y: spec.y };
    // It will not carry him past either end of its own footing.
    var minX = floor.x + cfg.clear, maxX = floor.x + floor.w - cfg.clear;

    var s = {
      cfg: cfg,
      home: spec.x,
      y: spec.y,
      x: spec.x,
      dir: -1,
      phase: 'idle',      // idle | chase | carry | setdown | returning
      t: 0,
      cool: 0,
      carrying: false,
      took: 0             // how many times it has got him
    };

    /** Where the toy rides while it has him. */
    s.carryPoint = function () {
      return { x: s.x + 0.34 * s.dir, y: s.y + cfg.mouth };
    };

    /** What the renderer should be playing. */
    s.clip = function () {
      if (s.phase === 'chase' || s.phase === 'carry' || s.phase === 'returning') {
        return 'trot';
      }
      return s.phase === 'setdown' ? 'greet' : 'stand';
    };

    s.update = function (dt, p) {
      s.t += dt;
      s.cool = Math.max(0, s.cool - dt);

      if (s.phase === 'idle') {
        s.carrying = false;
        // Amble home if it has drifted, otherwise wait.
        var d = s.home - s.x;
        if (Math.abs(d) > 0.05) {
          s.dir = d > 0 ? 1 : -1;
          s.x += Math.min(Math.abs(d), cfg.speed * dt) * s.dir;
        }
        // `safe` is the grace a checkpoint grants on arrival. Being picked
        // up the instant you reappear is the same unfairness the vacuum's
        // grace period exists to prevent.
        if (s.cool <= 0 && p && p.onGround && !p.safe &&
            Math.abs(p.y - s.y) < 0.35 &&
            Math.abs(p.x - s.x) < cfg.notice) {
          s.phase = 'chase'; s.t = 0;
        }
        return s;
      }

      if (s.phase === 'chase') {
        // Lost interest: he got away, or got above it.
        if (!p || Math.abs(p.x - s.x) > cfg.notice + 1.5 ||
            Math.abs(p.y - s.y) > 1.6) {
          s.phase = 'returning'; return s;
        }
        var to = p.x - s.x;
        s.dir = to > 0 ? 1 : -1;
        s.x += Math.min(Math.abs(to), cfg.speed * dt) * s.dir;
        s.x = Math.max(minX, Math.min(maxX, s.x));
        if (p.safe) { s.phase = 'returning'; return s; }
        var low = p.y < s.y + cfg.reach;      // it cannot reach him overhead
        if (low && Math.abs(p.x - s.x) < cfg.grab) {
          s.phase = 'carry'; s.carrying = true; s.took++;
          s.dir = -1;                         // back the way he came
          s.goal = Math.max(minX, s.x - cfg.carry);
          s.t = 0;
        }
        return s;
      }

      if (s.phase === 'carry') {
        var left = s.goal - s.x;
        s.dir = left > 0 ? 1 : -1;
        s.x += Math.min(Math.abs(left), cfg.carrySpeed * dt) * s.dir;
        if (Math.abs(s.goal - s.x) < 0.02) { s.phase = 'setdown'; s.t = 0; }
        return s;
      }

      if (s.phase === 'setdown') {
        if (s.t >= cfg.hold) {
          s.carrying = false;
          s.cool = cfg.cooldown;
          s.phase = 'returning';
        }
        return s;
      }

      // returning
      s.carrying = false;
      var back = s.home - s.x;
      if (Math.abs(back) < 0.05) { s.phase = 'idle'; return s; }
      s.dir = back > 0 ? 1 : -1;
      s.x += Math.min(Math.abs(back), cfg.speed * dt) * s.dir;
      return s;
    };

    return s;
  }

  return { CFG: CFG, create: create, surfaceUnder: surfaceUnder };
});
