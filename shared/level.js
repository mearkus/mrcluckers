/* Level format: one file, both demos.
 *
 * Levels are authored in world units — 1 unit is Mr. Cluckers' height —
 * with **Y up** and the ground's top surface at y = 0. A platform's `y` is
 * its top surface, which is the edge that matters for landing, and `h`
 * extends downward from it.
 *
 * The three.js demo uses these coordinates directly. The canvas demo works
 * in pixels with Y down, so it calls `toPixels` on load.
 */
(function (root, factory) {
  var api = factory(root.Jump || (typeof require === 'function' ? require('./jump.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Level = api;
})(typeof self !== 'undefined' ? self : this, function (Jump) {
  'use strict';

  var GROUND_Y = 400;   // where y = 0 lands in the canvas demo's pixel space

  var DEFAULTS = {
    name: 'Untitled',
    theme: 'indoors',
    width: 34,
    spawn: { x: 1.5, y: 0 },
    goal: null,
    platforms: [],
    pickups: [],
    hazards: [],
    patrols: []
  };

  function normalize(raw) {
    var lv = {};
    for (var k in DEFAULTS) {
      lv[k] = raw[k] === undefined ? DEFAULTS[k] : raw[k];
    }
    lv.platforms = (lv.platforms || []).map(function (p) {
      return { x: +p.x, y: +p.y, w: +p.w, h: p.h === undefined ? 0.5 : +p.h,
               ground: !!p.ground };
    });
    lv.pickups = (lv.pickups || []).map(function (p) {
      return { x: +p.x, y: +p.y, kind: p.kind || 'kibble' };
    });
    lv.hazards = (lv.hazards || []).map(function (h) {
      return { x: +h.x, y: +h.y, w: +h.w, h: h.h === undefined ? 0.4 : +h.h,
               kind: h.kind || 'water' };
    });
    // A patrol runs along the surface at `y`, from `x` to `x + w`.
    lv.patrols = (lv.patrols || []).map(function (m) {
      return { x: +m.x, y: +m.y, w: +m.w,
               speed: m.speed === undefined ? 1.5 : +m.speed,
               pause: m.pause === undefined ? 0.7 : +m.pause,
               phase: m.phase === undefined ? 0 : +m.phase,
               kind: m.kind || 'vacuum' };
    });
    return lv;
  }

  /** Convert to the canvas demo's space: pixels, Y down, ground at GROUND_Y. */
  function toPixels(level, pxPerHeight) {
    var px = pxPerHeight || (Jump ? Jump.C.PX_PER_HEIGHT : 72.73);
    var lv = normalize(level);
    var toY = function (y) { return GROUND_Y - y * px; };
    return {
      name: lv.name,
      theme: lv.theme,
      width: lv.width * px,
      ground: GROUND_Y,
      spawn: { x: lv.spawn.x * px, y: toY(lv.spawn.y) },
      goal: lv.goal ? { x: lv.goal.x * px, y: toY(lv.goal.y) } : null,
      platforms: lv.platforms.map(function (p) {
        return { x: p.x * px, y: toY(p.y), w: p.w * px, h: p.h * px,
                 ground: p.ground };
      }),
      pickups: lv.pickups.map(function (p) {
        return { x: p.x * px, y: toY(p.y), kind: p.kind };
      }),
      hazards: lv.hazards.map(function (h) {
        return { x: h.x * px, y: toY(h.y), w: h.w * px, h: h.h * px,
                 kind: h.kind };
      }),
      // Patrols keep their world units: the demo asks shared/patrol.js where
      // one is and converts the answer, rather than converting the machine.
      patrols: lv.patrols.map(function (m) {
        return { x: m.x, y: m.y, w: m.w, speed: m.speed, pause: m.pause,
                 phase: m.phase, kind: m.kind };
      })
    };
  }

  /** Every surface he can stand on, as {x, y, w} top edges in world units. */
  function surfaces(level) {
    return normalize(level).platforms.map(function (p) {
      return { x: p.x, y: p.y, w: p.w };
    });
  }

  /**
   * Flag platforms nothing can reach. Heuristic and deliberately generous:
   * it only reports a platform when *no* other surface can get to it.
   */
  function unreachable(level) {
    if (!Jump) return [];
    var tops = surfaces(level);
    var bad = [];
    tops.forEach(function (to, i) {
      var ok = tops.some(function (from, j) {
        if (i === j) return false;
        // Jump from whichever end of `from` is nearer, to the nearer edge.
        var fromX = to.x > from.x + from.w ? from.x + from.w
                  : (to.x + to.w < from.x ? from.x : to.x);
        var toX = to.x > from.x + from.w ? to.x
                : (to.x + to.w < from.x ? to.x + to.w : to.x);
        var r = Jump.canReach({ x: fromX, y: from.y },
                              { x: Math.abs(toX - fromX) + fromX, y: to.y });
        return r.ok;
      });
      if (!ok) bad.push(to);
    });
    return bad;
  }

  /** The jump between two surfaces, taken from their facing edges. */
  function hop(from, to) {
    var fromX, toX;
    if (to.x > from.x + from.w) {          // target is to the right
      fromX = from.x + from.w; toX = to.x;
    } else if (to.x + to.w < from.x) {     // target is to the left
      fromX = from.x; toX = to.x + to.w;
    } else {                               // they overlap: straight up
      fromX = toX = Math.max(from.x, to.x);
    }
    return Jump.canReach({ x: fromX, y: from.y },
                         { x: fromX + Math.abs(toX - fromX), y: to.y });
  }

  function surfaceUnder(tops, pt) {
    var best = -1, bestY = -Infinity;
    for (var i = 0; i < tops.length; i++) {
      var t = tops[i];
      if (pt.x >= t.x - 0.3 && pt.x <= t.x + t.w + 0.3 &&
          t.y <= pt.y + 0.3 && t.y > bestY) { best = i; bestY = t.y; }
    }
    return best;
  }

  /**
   * Walk the level the way a player has to: from the surface under the spawn,
   * across every jump he can actually make, and see whether the goal is on
   * the far end.
   *
   * `unreachable` only ever asked "can *anything* get to this platform",
   * which says nothing about whether the level can be finished. Both shipped
   * levels passed it while one of them could be completed without jumping at
   * all and the other asked for a coyote-time jump at its first hazard.
   */
  function route(level) {
    if (!Jump) return null;
    var lv = normalize(level);
    var tops = surfaces(lv);
    var start = surfaceUnder(tops, lv.spawn);
    var goal = lv.goal ? surfaceUnder(tops, lv.goal) : -1;

    // Breadth-first over the jumps he can make at the lip, remembering the
    // hardest one needed to get anywhere.
    var seen = {}, queue = [start], hardest = null, coyoteOnly = [];
    seen[start] = true;
    while (queue.length) {
      var i = queue.shift();
      for (var j = 0; j < tops.length; j++) {
        if (seen[j] || i < 0) continue;
        var r = hop(tops[i], tops[j]);
        if (r.tight) coyoteOnly.push({ from: tops[i], to: tops[j], run: r.run });
        if (!r.ok) continue;
        seen[j] = true;
        if (!hardest || r.run / r.limit > hardest.run / hardest.limit) hardest = r;
        queue.push(j);
      }
    }

    var reached = tops.filter(function (t, i) { return seen[i]; });
    var stranded = tops.filter(function (t, i) { return !seen[i]; });

    // A pickup counts as collectible if a surface he can stand on gets him
    // within a jump of it.
    var lost = lv.pickups.filter(function (pk) {
      return !reached.some(function (t) {
        var rise = pk.y - t.y;
        if (rise > Jump.maxHeight() + 0.55) return false;
        var span = Jump.reach(Math.max(0, rise));
        return pk.x >= t.x - span && pk.x <= t.x + t.w + span;
      });
    });

    // The hardest jump he is *forced* to make: over every route to the goal,
    // the one whose worst jump is easiest. That is the number that says how
    // demanding a level is -- `hardest` only says what the hardest reachable
    // jump was, which an optional side route can inflate.
    var required = null;
    if (goal >= 0 && seen[goal]) {
      var worst = tops.map(function () { return Infinity; });
      worst[start] = 0;
      var todo = [start];
      while (todo.length) {
        var a = todo.shift();
        for (var k = 0; k < tops.length; k++) {
          if (k === a) continue;
          var e = hop(tops[a], tops[k]);
          if (!e.ok) continue;
          var cost = Math.max(worst[a], e.limit > 0 ? e.run / e.limit : 1);
          if (cost < worst[k] - 1e-9) { worst[k] = cost; todo.push(k); }
        }
      }
      required = worst[goal] === Infinity ? null : worst[goal];
    }

    return {
      name: lv.name,
      startsOnGround: start >= 0,
      goalReachable: goal >= 0 && !!seen[goal],
      hardest: hardest,
      required: required,
      coyoteOnly: coyoteOnly,
      stranded: stranded,
      lostPickups: lost
    };
  }

  return {
    GROUND_Y: GROUND_Y,
    DEFAULTS: DEFAULTS,
    normalize: normalize,
    toPixels: toPixels,
    surfaces: surfaces,
    unreachable: unreachable,
    hop: hop,
    route: route
  };
});
