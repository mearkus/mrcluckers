/* Every sound in the game, synthesised on the spot.
 *
 * No audio files, for the same reason there are no image files: the rest of
 * this repo generates what it needs, and a squeak is a pitch bend and an
 * envelope. It also keeps the whole game a few hundred kilobytes.
 *
 * Browsers will not let a page make noise before someone has interacted with
 * it, so the context is built lazily on the first key or touch and resumed if
 * it was suspended -- a tab switch suspends it, and it does not come back on
 * its own.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Sound = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'mrcluckers.sound.v1';
  var ctx = null, master = null, on = true, noiseBuf = null;

  try {
    var saved = (typeof localStorage !== 'undefined') && localStorage.getItem(KEY);
    if (saved === 'off') on = false;
  } catch (e) { /* storage may be unavailable; default to on */ }

  function ready() {
    if (!on) return null;
    if (!ctx) {
      var AC = root_AC();
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = 0.28;          // the whole game, kept polite
      master.connect(ctx.destination);
    }
    // A tab switch suspends the context and it does not resume by itself.
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    return ctx;
  }

  function root_AC() {
    return (typeof AudioContext !== 'undefined') ? AudioContext
         : (typeof webkitAudioContext !== 'undefined') ? webkitAudioContext
         : null;
  }

  /** One second of white noise, made once and reused. */
  function noise() {
    if (noiseBuf) return noiseBuf;
    var n = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, n, n);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  /** A shaped tone. `bend` sweeps the pitch, which is most of the character. */
  function tone(o) {
    var t = ctx.currentTime + (o.delay || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(o.from, t);
    if (o.to && o.to !== o.from) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + o.dur);
    }
    var peak = (o.gain === undefined ? 1 : o.gain);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.02, o.dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g); g.connect(master);
    osc.start(t); osc.stop(t + o.dur + 0.02);
  }

  /** A shaped burst of noise: thuds, splashes, whooshes. */
  function hiss(o) {
    var t = ctx.currentTime + (o.delay || 0);
    var src = ctx.createBufferSource();
    src.buffer = noise();
    var f = ctx.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.from, t);
    if (o.to && o.to !== o.from) {
      f.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t + o.dur);
    }
    f.Q.value = o.q === undefined ? 1 : o.q;
    var g = ctx.createGain();
    var peak = (o.gain === undefined ? 1 : o.gain);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + o.dur + 0.02);
  }

  // Each one is a little sketch rather than a preset: the squeak is the toy's
  // voice, so it gets two notes and a wobble; a bark is short and gruff.
  var VOICES = {
    squeak: function () {
      tone({ type: 'square', from: 900, to: 1750, dur: 0.09, gain: 0.35 });
      tone({ type: 'square', from: 1650, to: 780, dur: 0.13, gain: 0.30, delay: 0.09 });
    },
    jump: function () {
      tone({ type: 'triangle', from: 380, to: 760, dur: 0.11, gain: 0.22 });
    },
    land: function () {
      hiss({ from: 900, to: 130, dur: 0.10, gain: 0.30 });
      tone({ type: 'sine', from: 150, to: 70, dur: 0.11, gain: 0.22 });
    },
    kibble: function () {
      tone({ type: 'sine', from: 1180, to: 1760, dur: 0.07, gain: 0.22 });
      tone({ type: 'sine', from: 1760, to: 2100, dur: 0.06, gain: 0.14, delay: 0.06 });
    },
    splash: function () {
      hiss({ from: 2600, to: 260, dur: 0.34, gain: 0.34 });
      tone({ type: 'sine', from: 420, to: 150, dur: 0.22, gain: 0.12 });
    },
    bark: function () {
      hiss({ filter: 'bandpass', from: 900, to: 500, dur: 0.09, q: 3, gain: 0.34 });
      tone({ type: 'sawtooth', from: 300, to: 170, dur: 0.11, gain: 0.20 });
    },
    throwUp: function () {
      hiss({ filter: 'bandpass', from: 500, to: 1900, dur: 0.26, q: 1.2, gain: 0.16 });
    },
    catch_: function () {
      tone({ type: 'triangle', from: 700, to: 1050, dur: 0.09, gain: 0.26 });
      tone({ type: 'triangle', from: 1050, to: 1560, dur: 0.13, gain: 0.24, delay: 0.09 });
    },
    miss: function () {
      tone({ type: 'triangle', from: 400, to: 220, dur: 0.18, gain: 0.20 });
    },
    bump: function () {
      hiss({ from: 700, to: 90, dur: 0.13, gain: 0.32 });
      tone({ type: 'square', from: 120, to: 60, dur: 0.10, gain: 0.16 });
    },
    grab: function () {
      hiss({ filter: 'bandpass', from: 700, to: 380, dur: 0.10, q: 2, gain: 0.26 });
      tone({ type: 'sawtooth', from: 260, to: 150, dur: 0.14, gain: 0.16 });
    },
    win: function () {
      var n = [523, 659, 784, 1046];
      for (var i = 0; i < n.length; i++) {
        tone({ type: 'triangle', from: n[i], to: n[i], dur: 0.16,
               gain: 0.22, delay: i * 0.11 });
      }
    },
    ui: function () {
      tone({ type: 'sine', from: 620, to: 880, dur: 0.06, gain: 0.16 });
    }
  };

  function play(name) {
    if (!ready()) return false;
    var v = VOICES[name === 'catch' ? 'catch_' : name];
    if (!v) return false;
    try { v(); } catch (e) { return false; }
    return true;
  }

  function setEnabled(v) {
    on = !!v;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch (e) { /* nothing worth breaking over */ }
    if (!on && ctx && ctx.suspend) ctx.suspend();
    if (on) ready();
    return on;
  }

  return {
    KEY: KEY,
    names: function () { return Object.keys(VOICES).map(function (n) {
      return n === 'catch_' ? 'catch' : n; }); },
    enabled: function () { return on; },
    setEnabled: setEnabled,
    toggle: function () { return setEnabled(!on); },
    unlock: function () { return !!ready(); },
    play: play
  };
});
