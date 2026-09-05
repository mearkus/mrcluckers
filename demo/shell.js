/* Title screen, level select, and the panel you get when a level is done.
 *
 * The title screen holds three actions and never grows. Everything that
 * scales with the number of levels lives on the level-select screen, which
 * is a separate view rather than a list bolted under Play -- a title screen
 * that scrolls buries the one button most people want.
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

  /* Title and level select are two views of one page, told apart by the
   * hash. Going between them is not a page load -- the key art is already
   * decoded and re-fetching it to show a menu would be silly -- but it does
   * go through history, so the browser's Back button works and the phone's
   * back gesture lands where a thumb expects. */
  function route() {
    if (location.hash === "#levels") showLevels(); else showTitle();
  }

  function goto(hash) {
    if (window.Sound) window.Sound.play("ui");
    if (location.hash === hash) { route(); return; }
    // pushState so Back returns to the title; hashchange does the render.
    if (history.pushState) {
      history.pushState(null, "", hash || location.pathname + location.search);
      route();
    } else {
      location.hash = hash;
    }
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

  /**
   * One level's card: the number, the name, how it went, and a swatch of
   * the level's own sky and ground.
   *
   * The swatch is the point. Five identical rows of text is a list you read;
   * five different skies is a set of places you recognise -- and at fifteen
   * levels the difference is what stops the screen becoming a wall.
   */
  function levelCard(slug, i, unlocked, prevName) {
    var lv = LEVELS[slug] || {};
    var stats = P ? P.statsFor(slug) : null;
    var beat = !!stats;

    var card = el("button", "card" + (unlocked ? "" : " locked")
                            + (beat ? " beat" : ""));
    card.disabled = !unlocked;

    var art = el("div", "card-art");
    if (window.Theme) {
      var t = window.Theme.get(lv.theme);
      art.style.background =
        "linear-gradient(180deg, " + t.sky[0] + ", " + t.sky[1] + ")";
      var cap = el("div", "cap");
      cap.style.background = t.ground.cap;
      var lip = el("div", "lip");
      lip.style.background = t.ground.lip;
      art.appendChild(lip);
      art.appendChild(cap);
    }
    art.appendChild(el("span", "num", String(i + 1)));
    if (!unlocked) art.appendChild(el("span", "shut", "\uD83D\uDD12"));
    card.appendChild(art);

    var body = el("div", "card-body");
    body.appendChild(el("b", null, lv.name || slug));
    body.appendChild(el("small", null,
      beat ? stars(stats, (lv.pickups || []).length)
           : (unlocked ? "not finished yet" : "finish " + prevName + " to open")));
    if (beat) body.appendChild(el("span", "tick", "\u2713"));
    card.appendChild(body);

    card.addEventListener("click", function () {
      if (!unlocked) return;
      if (window.Sound) window.Sound.play("ui");
      go(slug);
    });
    return card;
  }

  /** The level-select screen: a header that stays put over a list that grows. */
  function showLevels() {
    document.body.classList.add("shell-on");
    var host = document.getElementById("shell");
    host.hidden = false;
    host.innerHTML = "";
    host.className = "picker";

    var open = P ? P.unlocked(ORDER) : null;
    var done = 0;
    ORDER.forEach(function (slug) { if (P && P.isDone(slug)) done++; });

    var bar = el("div", "picker-bar");
    // The word is in a span so a phone layout can drop it and keep the
    // arrow, without losing the accessible name.
    var back = el("button", "back");
    back.appendChild(el("span", null, "Title"));
    back.setAttribute("aria-label", "Back to title");
    back.addEventListener("click", function () {
      if (history.pushState && location.hash) history.back(); else goto("");
    });
    bar.appendChild(back);
    bar.appendChild(el("h2", null, "Levels"));
    bar.appendChild(el("span", "count", done + " of " + ORDER.length + " finished"));
    host.appendChild(bar);

    // Sections come from each level's own theme, so a new level files itself
    // and a new setting adds a section. Order follows play order: a section
    // appears where its first level does.
    var list = el("div", "picker-list");
    var order = [];
    var byWhere = {};
    ORDER.forEach(function (slug, i) {
      var w = window.Theme ? window.Theme.where((LEVELS[slug] || {}).theme)
                           : "Levels";
      if (!byWhere[w]) { byWhere[w] = []; order.push(w); }
      byWhere[w].push({ slug: slug, i: i });
    });

    order.forEach(function (label) {
      var sec = el("section", "group");
      var head = el("div", "group-head");
      head.appendChild(el("h3", null, label));
      head.appendChild(el("span", "rule"));
      sec.appendChild(head);

      var grid = el("div", "grid");
      byWhere[label].forEach(function (item) {
        var prev = LEVELS[ORDER[item.i - 1]] || {};
        grid.appendChild(levelCard(item.slug, item.i,
                                   !open || open[item.slug],
                                   prev.name || "the level before"));
      });
      sec.appendChild(grid);
      list.appendChild(sec);
    });
    host.appendChild(list);
  }

  /* The wordmark is split so "Mr." can sit small above the big name, which
   * is what stops a two-word title from reading as one long line of text. */
  function wordmark() {
    var h = el("h1");
    // The two halves are separate elements, so a screen reader would run
    // them together as one word without this.
    h.setAttribute("aria-label", "Mr. Cluckers");
    h.appendChild(el("span", "wm-small", "Mr."));
    h.appendChild(el("span", "wm-big", "Cluckers"));
    return h;
  }

  function showTitle() {
    document.body.classList.add("shell-on");
    var host = document.getElementById("shell");
    host.hidden = false;
    host.innerHTML = "";
    host.className = "";

    // Two panels: the pair on one side, the menu on the other. On a narrow
    // screen the grid collapses and the art becomes a band across the top,
    // so the buttons are always the thing your thumb lands on first.
    var art = el("div", "title-art");
    var img = document.createElement("img");
    img.src = "../assets/art/keyart.png";
    img.alt = "Ginger the dog standing beside Mr. Cluckers, her plush rooster";
    // Intrinsic size, so the layout reserves the right box before the render
    // arrives and the menu does not jump down the page when it does.
    img.width = 1600;
    img.height = 1000;
    img.decoding = "async";
    // The render arrives with its own transparency; fading it in on load
    // avoids the half-drawn flash on a slow connection.
    img.addEventListener("load", function () { art.classList.add("in"); });
    if (img.complete) art.classList.add("in");
    art.appendChild(el("div", "glow"));
    art.appendChild(img);
    art.appendChild(el("div", "shadow"));

    var wrap = el("div", "shell-inner");
    wrap.appendChild(wordmark());
    wrap.appendChild(el("p", "tag",
      "Ginger's favourite toy has a long way to go. Get him home."));

    var open = P ? P.unlocked(ORDER) : null;
    var furthest = ORDER[0];
    if (open) {
      for (var i = 0; i < ORDER.length; i++) if (open[ORDER[i]]) furthest = ORDER[i];
    }
    var started = !!(P && P.isDone(ORDER[0]));
    var play = el("button", "big", started ? "Continue" : "Play");
    if (started) {
      play.appendChild(el("small", null, (LEVELS[furthest] || {}).name || ""));
    }
    play.addEventListener("click", function () {
      if (window.Sound) window.Sound.play("ui");
      go(furthest);
    });
    wrap.appendChild(play);

    // The second action, not a second list. The count keeps the title
    // screen able to say where you are without enumerating anything.
    var pick = el("button", "second");
    pick.appendChild(el("span", null, "Levels"));
    var beaten = 0;
    ORDER.forEach(function (slug) { if (P && P.isDone(slug)) beaten++; });
    pick.appendChild(el("small", null, beaten + "/" + ORDER.length));
    pick.addEventListener("click", function () { goto("#levels"); });
    wrap.appendChild(pick);

    if (P && P.load().done && Object.keys(P.load().done).length) {
      var wipe = el("button", "quiet", "Start over");
      wipe.addEventListener("click", function () {
        if (confirm("Forget which levels you have finished?")) { P.reset(); route(); }
      });
      wrap.appendChild(wipe);
    }

    var page = el("div", "title-page");
    page.appendChild(art);
    page.appendChild(wrap);
    host.appendChild(page);
  }

  window.MrCluckersShell = {
    slugInURL: slugInURL,
    leaveTo: leaveTo,
    showTitle: showTitle,
    showLevels: showLevels,
    route: route,
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
      back.addEventListener("click", function () {
        leaveTo("?#levels", "Mr. Cluckers");
      });
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

  // Back and forward between title and level select are hash changes, and
  // arriving with #levels in the URL should land there too.
  if (!slugInURL()) {
    window.addEventListener("hashchange", route);
    window.addEventListener("popstate", route);
    route();
  }
})();
