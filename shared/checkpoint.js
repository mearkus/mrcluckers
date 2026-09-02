/* Where he comes back to.
 *
 * Falling in water or down a gap used to put him at the level's spawn, so a
 * mistake near the end cost the whole level. That is why both levels put
 * their hardest jump in the middle rather than building to one, and why the
 * vacuum had to be harmless: a lethal obstacle plus a full rewind is a lot to
 * ask of a toy chicken.
 *
 * There is nothing to author. He checkpoints wherever he is *standing safely*
 * -- on ground with room either side, clear of the water and out of a
 * vacuum's sweep -- so a level gets this by existing. A level may still list
 * `checkpoints` explicitly if it wants a guaranteed spot.
 *
 * Positions are world units, and safety is decided from the same level data
 * both demos already hold, so the two cannot disagree about where he returns.
 */
(function (root, factory) {
  var api = factory(root.Patrol || (typeof require === 'function' ? require('./patrol.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Checkpoint = api;
})(typeof self !== 'undefined' ? self : this, function (Patrol) {
  'use strict';

  var CFG = {
    margin: 1.0,     // clear ground needed either side before a spot counts
    settle: 0.22,    // seconds stood still-ish before it is taken
    grace: 1.2,      // immunity after returning, so you are not hit on arrival
    lift: 0.02       // placed a hair above the surface, never inside it
  };

  /** The platform top he is standing on, if any. */
  function surfaceUnder(level, x, y) {
    var best = null;
    for (var i = 0; i < level.platforms.length; i++) {
      var p = level.platforms[i];
      if (x < p.x || x > p.x + p.w) continue;
      if (Math.abs(y - p.y) > 0.12) continue;
      if (!best || p.y > best.y) best = p;
    }
    return best;
  }

  /**
   * Is this a spot worth coming back to? Somewhere he could stand and take
   * stock: real ground under him, and room either side so he does not
   * reappear on a lip.
   *
   * Deliberately *not* excluded: the stretch a vacuum sweeps. That reads like
   * the careful thing to do and it costs the whole middle of the living room
   * -- the patrols there span nearly their entire floor section, so the level
   * would checkpoint on one side of its hardest jump and never after it. The
   * vacuum cannot kill him, and `grace` covers the arrival, so a machine
   * trundling past a checkpoint is fine.
   */
  function safe(level, x, y) {
    var p = surfaceUnder(level, x, y);
    if (!p) return false;
    if (x - p.x < CFG.margin || (p.x + p.w) - x < CFG.margin) return false;

    for (var i = 0; i < level.hazards.length; i++) {
      var h = level.hazards[i];
      if (x > h.x - CFG.margin && x < h.x + h.w + CFG.margin &&
          y <= h.y + 0.2) return false;
    }

    return true;
  }

  /**
   * Tracks the last safe spot. `at` is the level's spawn until he reaches
   * somewhere better; explicit `checkpoints` in the level are simply seeded
   * as candidates and then treated the same way.
   */
  function create(level) {
    var s = {
      at: { x: level.spawn.x, y: level.spawn.y },
      held: 0,
      moved: false          // has he ever banked anything past the spawn
    };

    /** Call every frame with where he is and whether he is on the ground. */
    s.consider = function (x, y, onGround, dt) {
      if (!onGround) { s.held = 0; return s.at; }
      s.held += dt;
      if (s.held < CFG.settle) return s.at;
      if (!safe(level, x, y)) return s.at;
      if (Math.abs(x - s.at.x) < 0.05 && Math.abs(y - s.at.y) < 0.05) return s.at;
      s.at = { x: x, y: y + CFG.lift };
      s.moved = true;
      return s.at;
    };

    /** Where to put him after a fall, and how long to leave him alone. */
    s.respawn = function () {
      return { x: s.at.x, y: s.at.y, grace: CFG.grace };
    };

    return s;
  }

  return { CFG: CFG, create: create, safe: safe, surfaceUnder: surfaceUnder };
});
