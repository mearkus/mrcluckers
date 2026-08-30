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
    hazards: []
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

  return {
    GROUND_Y: GROUND_Y,
    DEFAULTS: DEFAULTS,
    normalize: normalize,
    toPixels: toPixels,
    surfaces: surfaces,
    unreachable: unreachable
  };
});
