/* Things that move along a surface and shove him about.
 *
 * Ginger is frightened of the robot vacuum, so one belongs in her living
 * room. For Mr. Cluckers it is not lethal -- he is a plush toy, and a vacuum
 * that catches him bats him back down the room rather than ending his run.
 * That matters: falling in water still costs the whole level, so a moving
 * obstacle that killed you would need checkpoints before it was fair.
 *
 * Position is a pure function of time rather than integrated state, so the
 * two demos cannot drift apart, and a test can ask where it will be.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Patrol = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CFG = {
    radius: 0.42,      // half-width of the machine, world units
    height: 0.34,      // how tall it stands; clear this and you are over it
    speed: 1.5,        // units/second, if the level does not say
    pause: 0.7,        // beat spent turning around at each end
    knock: 3.1,        // sideways shove
    lift: 4.4,         // and upward, so the hit reads as a bump not a stop
    stun: 0.32,        // seconds before he can steer again
    immune: 0.75,      // and before it can catch him again -- without this it
                       // bulldozes him, and a long enough shove pushes him
                       // into a pit, which *is* fatal
    clearance: 1.6     // keep a patrol this far from the ends of its surface,
                       // so a shove can never be the thing that drops him
  };

  /**
   * Where a patrol is at time `t`. It runs from `x` to `x + w` and back,
   * pausing at each end -- the pause is what makes it readable: you get a
   * moment to see which way it is about to go.
   *
   * Returns {x, dir, turning}.
   */
  function at(p, t) {
    var span = Math.max(0.001, p.w);
    var speed = p.speed || CFG.speed;
    var pause = p.pause === undefined ? CFG.pause : p.pause;
    var leg = span / speed;
    var period = 2 * (leg + pause);
    var u = ((t + (p.phase || 0)) % period + period) % period;

    if (u < leg) return { x: p.x + u * speed, dir: 1, turning: false };
    u -= leg;
    if (u < pause) return { x: p.x + span, dir: 1, turning: true };
    u -= pause;
    if (u < leg) return { x: p.x + span - u * speed, dir: -1, turning: false };
    return { x: p.x, dir: -1, turning: true };
  }

  /**
   * Does he collide with it? He is safe above it, which is the counterplay:
   * time the gap or jump the machine.
   *
   * `feet` is the y of his feet, `halfW` his collision half-width.
   */
  function hits(p, t, x, feet, halfW) {
    var here = at(p, t);
    if (Math.abs(x - here.x) > CFG.radius + (halfW === undefined ? 0.22 : halfW)) {
      return null;
    }
    // Above the machine, or well below the surface it runs on: no contact.
    if (feet >= p.y + CFG.height - 0.02) return null;
    if (feet < p.y - 0.6) return null;
    return here;
  }

  /** The shove a hit produces, away from the machine. */
  function knockFrom(here, x) {
    var away = x < here.x ? -1 : 1;
    return { vx: away * CFG.knock, vy: CFG.lift, stun: CFG.stun };
  }

  return { CFG: CFG, at: at, hits: hits, knockFrom: knockFrom };
});
