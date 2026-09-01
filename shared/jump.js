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

  /**
   * Trace a jump arc, in world units relative to the take-off point.
   *
   * `coyote` walks him off the ledge first and jumps that many seconds later,
   * which the grace period allows. It is worth real distance -- about half a
   * unit on the flat -- so a gap can be crossable that way and not by jumping
   * at the lip. Levels should not *require* it; see canReach's `tight`.
   */
  function arc(opts) {
    opts = opts || {};
    var speed = opts.speed === undefined ? C.RUN : opts.speed;
    var vx = opts.vx0 === undefined ? speed : opts.vx0;
    var holdFor = opts.hold === undefined ? Infinity : opts.hold;
    var floor = opts.floor === undefined ? 0 : opts.floor;
    var late = Math.min(opts.coyote || 0, C.COYOTE);
    var pts = [{ x: 0, y: 0 }];
    var x = 0, y = 0, vy = 0, t = 0;
    // Off the edge and falling, but still allowed to jump.
    while (t < late) {
      vy -= C.GRAVITY * DT;
      y += vy * DT;
      if (vx < speed) vx = Math.min(speed, vx + C.ACCEL * DT);
      x += vx * DT;
      t += DT;
      pts.push({ x: x, y: y });
    }
    // Where the jump itself starts, so `reach` can ignore the falling
    // pre-roll -- otherwise it sees y dropping and calls it a landing.
    pts.jumpAt = pts.length - 1;
    vy = C.JUMP_VELOCITY;
    t = 0;
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
  function reach(rise, speed, coyote) {
    var pts = arc({ speed: speed, floor: -Infinity, coyote: coyote });
    var best = 0, climbing = true;
    for (var i = (pts.jumpAt || 0) + 1; i < pts.length; i++) {
      if (pts[i].y < pts[i - 1].y) climbing = false;
      if (!climbing && pts[i].y <= rise) { best = pts[i].x; break; }
      if (pts[i].y >= rise) best = pts[i].x;
    }
    return best;
  }

  /**
   * Can he get from a ledge at `from` to one at `to`? Both are
   * {x, y} of the take-off and landing edges.
   *
   * Returns {ok, tight, rise, run, limit, stretch}:
   *   ok      -- clears it jumping at the lip, which is what a level may ask
   *   tight   -- only clears it using coyote time, which a level should not
   *              require: it means stepping off the edge first and jumping
   *              in mid-air, and nothing teaches that
   *
   * This used to treat any level or downhill gap as infinitely reachable
   * (`rise <= 0 ? Infinity`), so a forty-unit chasm passed. Both of the
   * water gaps shipped in The Garden are flat, so neither was ever checked.
   */
  function canReach(from, to, speed) {
    var rise = to.y - from.y;
    var run = to.x - from.x;
    if (rise > maxHeight()) {
      return { ok: false, tight: false, rise: rise, run: run,
               limit: 0, stretch: 0 };
    }
    var limit = reach(rise, speed);
    var stretch = reach(rise, speed, C.COYOTE);
    return { ok: run <= limit, tight: run > limit && run <= stretch,
             rise: rise, run: run, limit: limit, stretch: stretch };
  }

  return {
    C: C,
    arc: arc,
    maxHeight: maxHeight,
    reach: reach,
    canReach: canReach
  };
});
