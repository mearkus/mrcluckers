/* The room tone.
 *
 * Every sound in the game was a one-shot: a squeak, a thud, a splash. Between
 * them the levels were silent, which made five rooms with five palettes sound
 * like one empty room. A bed underneath is the cheapest thing that makes a
 * place feel like a place.
 *
 * It is generated, like everything else here -- no files, nothing to download.
 * Each room gets a key, a tempo and a short line, and the line drifts a little
 * on every pass so it does not settle into a two-bar loop you start counting.
 * The notes come out of a **pentatonic** scale, which is the trick that makes
 * this safe: there is no interval in one that can clash, so a wandering line
 * cannot wander into a wrong note.
 *
 * It rides `shared/sound.js`'s audio context and its mute, so there is one
 * volume, one switch, and one thing browsers have to unlock.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Music = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Nothing in a pentatonic scale clashes with anything else in it.
  var MAJOR = [0, 2, 4, 7, 9];
  var MINOR = [0, 3, 5, 7, 10];

  /* A room is a key, a pace, a line and how much the line is allowed to
   * wander. `line` is sixteen eighth-notes -- two bars -- as scale degrees,
   * where null is a rest and 5 is the root an octave up. `bass` is one bar,
   * two octaves down, and it is what actually holds the room together. */
  var ROOMS = {
    indoors: {                       // The Living Room: warm, slow, music box
      bpm: 76, root: 174.61, scale: MAJOR, type: 'triangle', lift: 1,
      line: [0, null, 2, null, 4, null, 2, null,
             3, null, 2, null, 0, null, null, null],
      bass: [0, null, null, null, 3, null, null, null],
      drift: 0.10, rest: 0.10
    },
    kitchen: {                       // tiled, brighter, faintly clockwork
      bpm: 96, root: 196.00, scale: MAJOR, type: 'sine', lift: 2,
      line: [4, 3, 4, null, 2, null, 0, null,
             2, 3, 2, null, 4, null, null, null],
      bass: [0, null, 4, null, 0, null, null, null],
      drift: 0.14, rest: 0.08
    },
    shed: {                          // hushed, dusty, and a long way up
      bpm: 68, root: 130.81, scale: MAJOR, type: 'sine', lift: 2,
      line: [0, null, null, null, 2, null, null, 4,
             null, null, 2, null, null, null, 0, null],
      bass: [0, null, null, null, null, null, 3, null],
      drift: 0.10, rest: 0.16
    },
    garden: {                        // open and unhurried
      bpm: 84, root: 164.81, scale: MAJOR, type: 'triangle', lift: 1,
      line: [0, null, 4, null, 5, null, 4, null,
             2, null, 4, null, 2, null, 0, null],
      bass: [0, null, null, 4, null, null, 2, null],
      drift: 0.12, rest: 0.12
    },
    park: {                          // the widest room, so the most going on
      bpm: 104, root: 146.83, scale: MAJOR, type: 'triangle', lift: 2,
      line: [0, 2, 4, null, 5, 4, 2, null,
             4, null, 2, 0, 2, null, null, null],
      bass: [0, null, 4, null, 2, null, 4, null],
      drift: 0.14, rest: 0.08
    },
    lane: {                          // dusk, going home, and a little sad
      bpm: 72, root: 146.83, scale: MINOR, type: 'triangle', lift: 1,
      line: [0, null, null, 2, null, 3, null, null,
             2, null, 0, null, null, null, null, null],
      bass: [0, null, null, null, 2, null, null, null],
      drift: 0.08, rest: 0.14
    }
  };

  var CFG = {
    level: 0.55,     // against the effects, which share the same master
    look: 0.35,      // seconds of notes handed to the clock in advance
    tick: 60         // ms between scheduler wake-ups
  };

  var room = null;         // the ROOMS entry playing, or null
  var name = null;         // its key, so starting the same room twice is a no-op
  var ac = null, out = null, timer = null, drone = null;
  var step = 0, at = 0, seed = 1;

  /** Small, fast, and repeatable -- the same as the fetch round uses. */
  function rnd() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A scale degree as a frequency. Degrees past the scale wrap an octave. */
  function pitch(r, degree) {
    var n = r.scale.length;
    var oct = Math.floor(degree / n);
    return r.root * Math.pow(2, (r.scale[degree - oct * n] + 12 * oct) / 12);
  }

  /* One note, at an absolute time on the audio clock. Soft attack and a long
   * tail: the point is a room, not a melody you follow, and anything with a
   * hard edge starts competing with the squeaks. */
  function note(when, freq, dur, level, type) {
    var osc = ac.createOscillator();
    var g = ac.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(level, when + Math.min(0.08, dur * 0.4));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g); g.connect(out);
    osc.start(when); osc.stop(when + dur + 0.02);
  }

  /* The floor under the notes.
   *
   * A line of notes with rests in it is a tune, not a room: measured, the
   * quietest rooms were silent two thirds of the time, which is a pause
   * rather than a place. So the root and its fifth hold underneath, forever,
   * low and filtered until they are closer to felt than heard, and breathing
   * slowly so the pair never sits still enough to notice.
   */
  function hum() {
    hush();
    var g = ac.createGain();
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.setTargetAtTime(0.055, ac.currentTime, 1.4);   // arrive, don't cut in
    var lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 340;
    g.connect(lp); lp.connect(out);

    var breath = ac.createOscillator();     // a slow swell, well under a beat
    var depth = ac.createGain();
    breath.frequency.value = 0.07;
    depth.gain.value = 0.022;
    breath.connect(depth); depth.connect(g.gain);
    breath.start();

    var parts = [breath];
    var roots = [room.root / 2, pitch(room, 3) / 2];       // the root and its fifth
    for (var i = 0; i < roots.length; i++) {
      var o = ac.createOscillator();
      o.type = 'sine';
      // A hair apart, so the two beat against each other instead of ringing.
      o.frequency.value = roots[i] * (i ? 1.003 : 1);
      o.connect(g);
      o.start();
      parts.push(o);
    }
    drone = { parts: parts, gain: g };
  }

  /** Take the floor away, over a moment rather than at a stroke. */
  function hush() {
    if (!drone) return;
    var d = drone, t = ac.currentTime;
    drone = null;
    d.gain.gain.cancelScheduledValues(t);
    d.gain.gain.setValueAtTime(d.gain.gain.value, t);
    d.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    for (var i = 0; i < d.parts.length; i++) {
      try { d.parts[i].stop(t + 0.4); } catch (e) { /* already stopped */ }
    }
  }

  /** Hand the clock everything due in the next `look` seconds. */
  function fill() {
    var beat = 30 / room.bpm;               // an eighth note
    while (at < ac.currentTime + CFG.look) {
      var i = step % room.line.length;
      var d = room.line[i];
      if (d !== null && rnd() > room.rest) {
        // The drift: a degree either way, which in a pentatonic cannot be a
        // wrong note -- it is what stops two bars becoming a loop.
        if (rnd() < room.drift) d += rnd() < 0.5 ? 1 : -1;
        if (d >= 0) {
          note(at, pitch(room, d) * Math.pow(2, room.lift), beat * 2.2,
               0.085, room.type);
        }
      }
      var b = room.bass[step % room.bass.length];
      if (b !== null) note(at, pitch(room, b) / 2, beat * 4.0, 0.10, 'sine');
      at += beat;
      step++;
    }
  }

  function pump() {
    // No context until someone has touched the page, and no music while the
    // game is muted -- one switch for the lot.
    var S = typeof self !== 'undefined' ? self.Sound : null;
    if (!room || !S || !S.enabled()) return;
    var b = S.bus();
    if (!b) return;
    if (ac !== b.ctx) {
      ac = b.ctx;
      out = ac.createGain();
      out.gain.value = CFG.level;
      out.connect(b.master);
      drone = null;             // it belonged to the context that just went
      at = 0;
    }
    if (!drone) hum();
    // Coming back from a mute or a suspended tab: pick up from now rather
    // than playing back everything that was missed, all at once.
    if (at < ac.currentTime) at = ac.currentTime + 0.06;
    fill();
  }

  /**
   * Play a room. Naming the one already playing changes nothing, so this is
   * safe to call every frame if that is convenient.
   */
  function start(which) {
    var r = ROOMS[which];
    if (!r) return stop();
    if (name === which && timer) return;
    name = which;
    room = r;
    step = 0;
    seed = 1;                    // a room sounds the same every time you enter
    at = ac ? ac.currentTime + 0.08 : 0;
    if (!timer) timer = setInterval(pump, CFG.tick);
    pump();
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (ac) hush();
    room = null; name = null;
    // Notes already handed to the clock still play out, which is what you
    // want: cutting them dead is more noticeable than letting them finish.
  }

  return {
    CFG: CFG, ROOMS: ROOMS,
    rooms: function () { return Object.keys(ROOMS); },
    playing: function () { return name; },
    start: start,
    stop: stop
  };
});
