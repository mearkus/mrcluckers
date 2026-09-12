/* What the player has finished, and what that opens up.
 *
 * Levels unlock in order: the first is always available, and each other one
 * opens when the level before it is complete. Progress lives in
 * localStorage, which can be missing, full, or switched off, so every read
 * and write is guarded -- a browser that refuses to store anything still
 * plays, it just forgets.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Progress = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEY = 'mrcluckers.progress.v1';

  /* `scars` is the one thing here that belongs to the *run* rather than to a
   * level: how battered he is, carried from one level into the next. Every
   * other field is per-slug and best-of. */
  function blank() { return { done: {}, scars: 0 }; }

  function load() {
    try {
      var raw = root_storage() && root_storage().getItem(KEY);
      if (!raw) return blank();
      var data = JSON.parse(raw);
      return (data && typeof data === 'object' && data.done) ? data : blank();
    } catch (e) {
      return blank();          // private mode, quota, disabled storage
    }
  }

  function save(data) {
    try {
      var s = root_storage();
      if (s) s.setItem(KEY, JSON.stringify(data));
    } catch (e) { /* nothing to be done, and nothing worth breaking over */ }
  }

  function root_storage() {
    try {
      return (typeof localStorage !== 'undefined') ? localStorage : null;
    } catch (e) { return null; }
  }

  /**
   * Records a finished level. `stats` is whatever the level wants to
   * remember -- kibble found, bonus score -- and the best of each is kept.
   */
  function complete(slug, stats) {
    var data = load();
    var was = data.done[slug] || {};
    // `seams` is how much of himself he kept -- what he started with, less
    // what he lost. Best-of, like the rest: a clean run stays on the card
    // even after a scruffy replay.
    var now = { kibble: 0, pickups: 0, bonus: 0, seams: 0 };
    for (var k in now) {
      var v = (stats && stats[k]) || 0;
      now[k] = Math.max(was[k] || 0, v);
    }
    // pickups is a total, not a score: take the latest non-zero.
    now.pickups = (stats && stats.pickups) || was.pickups || 0;
    /* Knocks are a measurement, not a score, so the *latest* run wins rather
     * than the best or the worst. Keeping the max would report your unluckiest
     * attempt forever, which is the opposite of what it is for. */
    if (stats && stats.knocks !== undefined) {
      now.knocks = stats.knocks;
      now.by = stats.by || {};
    } else if (was.knocks !== undefined) {
      now.knocks = was.knocks;
      now.by = was.by || {};
    }
    data.done[slug] = now;
    // Carried out of this level and into the next one.
    if (stats && stats.scars !== undefined) data.scars = Math.max(0, stats.scars | 0);
    save(data);
    return data;
  }

  /**
   * How worn he is right now, to hand to the next level. Best-of is wrong for
   * this one -- it is a running state, not a score -- so the latest wins, and
   * it is capped by the caller at however many places there are to draw one.
   */
  function scars() { return load().scars || 0; }

  function setScars(n) {
    var data = load();
    data.scars = Math.max(0, n | 0);
    save(data);
    return data.scars;
  }

  function isDone(slug) { return !!load().done[slug]; }
  function statsFor(slug) { return load().done[slug] || null; }

  /** Every level finished. The end of the game, such as it is. */
  function allDone(order) {
    if (!order || !order.length) return false;
    var data = load();
    for (var i = 0; i < order.length; i++) if (!data.done[order[i]]) return false;
    return true;
  }

  /**
   * The whole run added up: what he found, what he brought her, and how much
   * of himself he kept. Sums the best of each level, which is the same thing
   * the cards show -- so the total is the one you can point at, not a
   * separate score kept somewhere else.
   */
  function tally(order) {
    var data = load();
    var t = { levels: 0, kibble: 0, pickups: 0, bonus: 0, seams: 0,
              knocks: 0, by: {} };
    for (var i = 0; i < order.length; i++) {
      var d = data.done[order[i]];
      if (!d) continue;
      t.levels++;
      t.kibble += d.kibble || 0;
      t.pickups += d.pickups || 0;
      t.bonus += d.bonus || 0;
      t.seams += d.seams || 0;
      t.knocks += d.knocks || 0;
      for (var k in (d.by || {})) t.by[k] = (t.by[k] || 0) + d.by[k];
    }
    return t;
  }

  /**
   * Levels open in order; the first is always playable.
   *
   * A level you have already finished stays open, and so does anything
   * before one you have finished -- otherwise inserting a level into the
   * middle of the game re-locks levels somebody had already beaten.
   */
  function unlocked(order) {
    var data = load(), out = {}, open = true;
    var furthest = -1;
    for (var i = 0; i < order.length; i++) {
      if (data.done[order[i]]) furthest = i;
    }
    for (var j = 0; j < order.length; j++) {
      out[order[j]] = open || j <= furthest + 1;
      open = !!data.done[order[j]];
    }
    return out;
  }

  /** The next level after `slug`, or null at the end of the game. */
  function next(order, slug) {
    var i = order.indexOf(slug);
    return (i >= 0 && i + 1 < order.length) ? order[i + 1] : null;
  }

  function reset() { save(blank()); }

  return {
    KEY: KEY, load: load, complete: complete, isDone: isDone,
    statsFor: statsFor, allDone: allDone, tally: tally,
    unlocked: unlocked, next: next, reset: reset,
    scars: scars, setScars: setScars
  };
});
