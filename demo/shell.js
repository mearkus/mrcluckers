/* Title screen, level select, and the panel you get when a level is done.
 *
 * These are DOM, not canvas: they want text, buttons and a scrollable list,
 * all of which the browser already does, and it means the on-screen controls
 * and a mouse both work without a second input path.
 *
 * Picking a level navigates -- `?level=slug` is how the game has always
 * chosen one, so the flow uses the mechanism that already existed rather
 * than teaching the game to tear itself down and rebuild mid-session.
 */
(function () {
  "use strict";

  var ORDER = window.MRCLUCKERS_LEVEL_ORDER || [];
  var LEVELS = window.MRCLUCKERS_LEVELS || {};
  var P = window.Progress;

  function slugInURL() {
    var m = location.search.match(/[?&]level=([\w-]+)/);
    return m && LEVELS[m[1]] ? m[1] : null;
  }

  var fade = null;
  function cover() {
    if (!fade) fade = document.getElementById("fade");
    return fade;
  }

  /**
   * Leave the page behind a cover, naming where we are going. The navigation
   * waits for the fade, but not forever -- `transitionend` never arrives if
   * the element is already opaque or the tab is in the background, so the
   * timer is the one that actually guarantees we go.
   */
  function leaveTo(href, label) {
    var f = cover();
    if (!f) { location.href = href; return; }
    f.querySelector("span").textContent = label || "";
    f.classList.add("up");
    var went = false;
    var jump = function () { if (!went) { went = true; location.href = href; } };
    f.addEventListener("transitionend", jump, { once: true });
    setTimeout(jump, 520);
  }

  function go(slug) {
    leaveTo("?level=" + slug, (LEVELS[slug] || {}).name || "");
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function stars(stats, total) {
    if (!stats) return "";
    var bits = [stats.kibble + "/" + (total || stats.pickups || 0) + " kibble"];
    if (stats.bonus) bits.push(stats.bonus + " at fetch");
    return bits.join("  ·  ");
  }

  function buildSelect(host) {
    var open = P ? P.unlocked(ORDER) : null;
    var list = el("div", "lvl-list");
    ORDER.forEach(function (slug, i) {
      var lv = LEVELS[slug] || {};
      var unlocked = !open || open[slug];
      var stats = P ? P.statsFor(slug) : null;
      var card = el("button", "lvl" + (unlocked ? "" : " locked"));
      card.disabled = !unlocked;
      card.appendChild(el("b", null, lv.name || slug));
      card.appendChild(el("small", null,
        unlocked ? (stats ? stars(stats, (lv.pickups || []).length)
                          : "not finished yet")
                 : "finish " + ((LEVELS[ORDER[i - 1]] || {}).name || "the level before")
                   + " to open"));
      if (stats) card.appendChild(el("span", "tick", "✓"));
      card.addEventListener("click", function () {
        if (!unlocked) return;
        if (window.Sound) window.Sound.play("ui");
        go(slug);
      });
      list.appendChild(card);
    });
    host.appendChild(list);
  }

  function showTitle() {
    document.body.classList.add("shell-on");
    var host = document.getElementById("shell");
    host.hidden = false;
    host.innerHTML = "";

    var wrap = el("div", "shell-inner");
    wrap.appendChild(el("h1", null, "Mr. Cluckers"));
    wrap.appendChild(el("p", "tag",
      "Ginger's favourite toy has a long way to go. Get him home."));

    var open = P ? P.unlocked(ORDER) : null;
    var furthest = ORDER[0];
    if (open) {
      for (var i = 0; i < ORDER.length; i++) if (open[ORDER[i]]) furthest = ORDER[i];
    }
    var play = el("button", "big", (P && P.isDone(ORDER[0])) ? "Continue" : "Play");
    play.addEventListener("click", function () {
      if (window.Sound) window.Sound.play("ui");
      go(furthest);
    });
    wrap.appendChild(play);

    buildSelect(wrap);

    if (P && P.load().done && Object.keys(P.load().done).length) {
      var wipe = el("button", "quiet", "Start over");
      wipe.addEventListener("click", function () {
        if (confirm("Forget which levels you have finished?")) { P.reset(); showTitle(); }
      });
      wrap.appendChild(wipe);
    }
    host.appendChild(wrap);
  }

  window.MrCluckersShell = {
    slugInURL: slugInURL,
    leaveTo: leaveTo,
    showTitle: showTitle,
    go: go,
    /** Shown by the game once a level is finished. */
    finished: function (slug, stats) {
      if (P) P.complete(slug, stats);
      var host = document.getElementById("done");
      if (!host) return;
      host.hidden = false;
      host.innerHTML = "";
      var box = el("div", "done-inner");
      var lv = LEVELS[slug] || {};
      box.appendChild(el("h2", null, (lv.name || slug) + " — done"));
      box.appendChild(el("p", "tag", stars(stats, (lv.pickups || []).length)));
      var nxt = P ? P.next(ORDER, slug) : null;
      if (nxt) {
        var b = el("button", "big", "Next: " + ((LEVELS[nxt] || {}).name || nxt));
        b.addEventListener("click", function () { go(nxt); });
        box.appendChild(b);
      } else {
        box.appendChild(el("p", "tag", "That's the last one. She has her toy back."));
      }
      var back = el("button", "quiet", "Level select");
      back.addEventListener("click", function () { leaveTo("?", "Mr. Cluckers"); });
      box.appendChild(back);
      host.appendChild(box);
    }
  };

  // Every page starts covered, so arriving is a fade rather than a cut. The
  // level's name is already on the cover from the page we left.
  (function uncover() {
    var f = cover();
    if (!f) return;
    var here = slugInURL();
    f.querySelector("span").textContent =
      here ? ((LEVELS[here] || {}).name || "") : "";
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { f.classList.remove("up"); });
    });
  })();

  // The sound toggle lives on every screen; the pause button only appears
  // once a level is running, and game.js owns it.
  (function soundButton() {
    var S = window.Sound, btn = document.getElementById("muteBtn");
    if (!btn) return;
    var paint = function () {
      var on = !S || S.enabled();
      btn.textContent = on ? "\uD83D\uDD0A" : "\uD83D\uDD07";
      btn.setAttribute("aria-label", on ? "Sound on" : "Sound off");
    };
    paint();
    btn.addEventListener("click", function () {
      if (S) { S.toggle(); if (S.enabled()) S.play("ui"); }
      paint();
    });
    // Browsers refuse to make noise until the page has been interacted with.
    var wake = function () { if (S) S.unlock(); };
    window.addEventListener("keydown", wake, { once: true });
    window.addEventListener("pointerdown", wake, { once: true });
  })();

  if (!slugInURL()) showTitle();
})();
