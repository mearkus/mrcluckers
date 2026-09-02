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

  function blank() { return { done: {} }; }

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
    var now = { kibble: 0, pickups: 0, bonus: 0 };
    for (var k in now) {
      var v = (stats && stats[k]) || 0;
      now[k] = Math.max(was[k] || 0, v);
    }
    // pickups is a total, not a score: take the latest non-zero.
    now.pickups = (stats && stats.pickups) || was.pickups || 0;
    data.done[slug] = now;
    save(data);
    return data;
  }

  function isDone(slug) { return !!load().done[slug]; }
  function statsFor(slug) { return load().done[slug] || null; }

  /** Levels open in order; the first is always playable. */
  function unlocked(order) {
    var data = load(), out = {}, open = true;
    for (var i = 0; i < order.length; i++) {
      out[order[i]] = open;
      open = !!data.done[order[i]];      // the next one waits on this one
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
    statsFor: statsFor, unlocked: unlocked, next: next, reset: reset
  };
});
