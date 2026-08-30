/* Mr. Cluckers' movement budget — the numbers that decide what a level can ask.
 *
 * Everything is in world units, where 1 unit is his standing height. The
 * canvas demo works in pixels and derives its constants from these, so the
 * two demos cannot drift apart and the editor's jump arc is the real one.
 *
 * Usable from a plain <script> or as an ES module.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Jump = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var C = {
    GRAVITY: 24.0,
    RUN: 3.4,
    WALK: 1.45,
    ACCEL: 20.0,
    FRICTION: 26.0,
    JUMP_VELOCITY: 8.8,
    RELEASE_CUT: 1.6,     // extra gravity once the jump key is let go
    COYOTE: 0.09,
    JUMP_BUFFER: 0.11,
    HALF_WIDTH: 0.22,     // collision half-width
    PX_PER_HEIGHT: 72.73  // canvas demo's world pixels per character height
  };

  var DT = 1 / 60;

  /** Trace a jump arc, in world units relative to the take-off point. */
  function arc(opts) {
    opts = opts || {};
    var speed = opts.speed === undefined ? C.RUN : opts.speed;
    var vx = opts.vx0 === undefined ? speed : opts.vx0;
    var holdFor = opts.hold === undefined ? Infinity : opts.hold;
    var floor = opts.floor === undefined ? 0 : opts.floor;
    var pts = [{ x: 0, y: 0 }];
    var x = 0, y = 0, vy = C.JUMP_VELOCITY, t = 0;
    while (t < 4) {
      if (vy > 0 && t >= holdFor) vy -= C.GRAVITY * C.RELEASE_CUT * DT;
      vy -= C.GRAVITY * DT;
      y += vy * DT;
      if (vx < speed) vx = Math.min(speed, vx + C.ACCEL * DT);
      x += vx * DT;
      t += DT;
      pts.push({ x: x, y: y });
      if (y <= floor && vy < 0) break;
    }
    return pts;
  }

  /** Peak height of a full-hold jump. */
  function maxHeight() {
    return arc().reduce(function (m, p) { return Math.max(m, p.y); }, 0);
  }

  /** Horizontal distance covered before falling back to `rise`. */
  function reach(rise, speed) {
    var pts = arc({ speed: speed, floor: -Infinity });
    var best = 0, climbing = true;
    for (var i = 1; i < pts.length; i++) {
      if (pts[i].y < pts[i - 1].y) climbing = false;
      if (!climbing && pts[i].y <= rise) { best = pts[i].x; break; }
      if (pts[i].y >= rise) best = pts[i].x;
    }
    return best;
  }

  /**
   * Can he get from a ledge at `from` to one at `to`? Both are
   * {x, y} of the take-off and landing edges. Returns
   * {ok, rise, run, limit} so a caller can explain the failure.
   */
  function canReach(from, to, speed) {
    var rise = to.y - from.y;
    var run = to.x - from.x;
    if (rise > maxHeight()) return { ok: false, rise: rise, run: run, limit: 0 };
    var limit = rise <= 0 ? Infinity : reach(rise, speed);
    return { ok: run <= limit, rise: rise, run: run, limit: limit };
  }

  return {
    C: C,
    arc: arc,
    maxHeight: maxHeight,
    reach: reach,
    canReach: canReach
  };
});
