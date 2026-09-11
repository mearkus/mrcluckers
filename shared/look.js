/* Looking down before you jump down.
 *
 * Standing on a ledge, the view is framed on him -- which is the right shot
 * while you are moving and the wrong one while you are deciding. You cannot
 * see what is under you, so dropping off a platform is a guess: another ledge,
 * the floor, or water.
 *
 * Holding *down* slides the view down a couple of heights. It is the same key
 * that crouches, because they are the same intent -- stop, look -- and because
 * the on-screen pad already has it, so touch gets this for nothing.
 *
 * The rule lives here rather than in each demo: the two cameras are separate
 * implementations, and this is exactly the kind of feel that drifts apart if
 * each one owns its own copy of "how far" and "how long".
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Look = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CFG = {
    drop: 1.9,     // character heights the view slides, about one ledge and a half
    delay: 0.22,   // held this long first, so crouching is not a camera move
    ease: 5.0,     // how fast the offset follows, per second
    still: 0.3,    // he counts as standing below this sideways speed
    floor: 0.15    // and only above the ground: nothing to see under that
  };

  function create(opts) {
    opts = opts || {};
    var cfg = {};
    for (var k in CFG) cfg[k] = opts[k] === undefined ? CFG[k] : opts[k];

    var s = { cfg: cfg, offset: 0, held: 0 };

    /**
     * `w` is {held, onGround, vx, y} in world units. Returns how far down the
     * view should sit, eased, so a demo can add it straight to its camera.
     *
     * Standing still is part of it: holding down while walking is the slow
     * walk, and panning the view during it would fight the thing you are
     * doing. And there is no peek at ground level -- there is nothing under
     * the floor but the colour of the floor.
     */
    s.update = function (dt, w) {
      w = w || {};
      var wants = !!w.held && !!w.onGround &&
                  Math.abs(w.vx || 0) < cfg.still && (w.y || 0) > cfg.floor;
      s.held = wants ? s.held + dt : 0;
      var want = (wants && s.held >= cfg.delay) ? cfg.drop : 0;
      s.offset += (want - s.offset) * Math.min(1, dt * cfg.ease);
      if (Math.abs(s.offset - want) < 0.002) s.offset = want;
      return s.offset;
    };

    return s;
  }

  return { CFG: CFG, create: create };
});
