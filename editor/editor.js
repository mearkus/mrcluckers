/* Level editor.
 *
 * The point of it is the jump arc: platformer levels live or die on whether
 * the player can actually get there, so the real arc from shared/jump.js is
 * drawn under the cursor while you place geometry. Everything else is a
 * rectangle you can drag.
 *
 * World units throughout (1 = Mr. Cluckers' height), Y up, ground top at 0 —
 * the same coordinates the level files use.
 */
(function () {
  'use strict';

  var GRID = 0.5;
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');

  var cam = { x: -2, y: -1.2, zoom: 46 };   // world unit at bottom-left, px/unit
  var level = null;
  var tool = 'select';
  var sel = null;                            // {kind, index}
  var drag = null;
  var hover = { x: 0, y: 0 };
  var unreachable = [];

  // ------------------------------------------------------------ coordinates
  function sx(wx) { return (wx - cam.x) * cam.zoom; }
  function sy(wy) { return canvas.height / dpr() - (wy - cam.y) * cam.zoom; }
  function wx(px) { return px / cam.zoom + cam.x; }
  function wy(py) { return (canvas.height / dpr() - py) / cam.zoom + cam.y; }
  function snap(v) { return Math.round(v / GRID) * GRID; }
  function dpr() { return Math.min(window.devicePixelRatio || 1, 2); }

  // ----------------------------------------------------------------- model
  function blank() {
    return {
      name: 'New Level', theme: 'indoors', width: 34,
      spawn: { x: 1.5, y: 0 }, goal: { x: 30, y: 0 },
      platforms: [{ x: 0, y: 0, w: 34, h: 1, ground: true }],
      pickups: [], hazards: []
    };
  }

  function setLevel(data) {
    level = window.Level.normalize(JSON.parse(JSON.stringify(data)));
    sel = null;
    revalidate();
    syncJSON();
  }

  function revalidate() {
    unreachable = window.Level.unreachable(level);
    var el = document.getElementById('checks');
    var msgs = [];
    if (unreachable.length) {
      msgs.push('<span class="warn">' + unreachable.length +
        ' platform(s) nothing can reach</span>');
    }
    var gaps = level.platforms.slice().sort(function (a, b) { return a.x - b.x; });
    var tight = 0;
    for (var i = 0; i < gaps.length - 1; i++) {
      var a = gaps[i], b = gaps[i + 1];
      var r = window.Jump.canReach({ x: a.x + a.w, y: a.y }, { x: b.x, y: b.y });
      if (r.ok && r.limit !== Infinity && r.run > r.limit * 0.85) tight++;
    }
    if (tight) msgs.push(tight + ' gap(s) within 15% of the limit');

    // The question that actually matters: can the level be finished, and how
    // hard is the hardest jump you are forced to make? `unreachable` only ever
    // asked whether *something* could get to each platform, which both shipped
    // levels passed while one could be walked end to end and the other could
    // not be completed at all.
    var r = window.Level.route(level);
    if (r) {
      if (!r.goalReachable) {
        msgs.unshift('<span class="warn">the goal cannot be reached</span>');
      } else {
        var pct = Math.round(r.required * 100);
        // Nothing to ask, or nothing left in reserve: both are worth saying.
        var poor = pct === 0 || pct > 95;
        msgs.push('<span ' + (poor ? 'class="warn"' : 'style="color:var(--ok)"') +
          '>hardest forced jump ' + pct + '% of budget' +
          (pct === 0 ? ' \u2014 no jump required' : '') + '</span>');
      }
      if (r.coyoteOnly.length) {
        msgs.push('<span class="warn">' + r.coyoteOnly.length +
          ' gap(s) only clearable with coyote time</span>');
      }
      if (r.lostPickups.length) {
        msgs.push('<span class="warn">' + r.lostPickups.length +
          ' pickup(s) cannot be collected</span>');
      }
    }
    if (!msgs.length) msgs.push('<span style="color:var(--ok)">all reachable</span>');
    el.innerHTML = msgs.join('<br>');
  }

  function syncJSON() {
    var out = {
      name: level.name, theme: level.theme, width: level.width,
      spawn: level.spawn, goal: level.goal,
      platforms: level.platforms.map(function (p) {
        var o = { x: p.x, y: p.y, w: p.w, h: p.h };
        if (p.ground) o.ground = true;
        return o;
      }),
      pickups: level.pickups.map(function (p) { return { x: p.x, y: p.y }; }),
      hazards: level.hazards.map(function (h) {
        return { x: h.x, y: h.y, w: h.w, h: h.h, kind: h.kind };
      })
    };
    document.getElementById('json').value = JSON.stringify(out, null, 2);
  }

  // ----------------------------------------------------------------- input
  function hit(x, y) {
    for (var i = level.platforms.length - 1; i >= 0; i--) {
      var p = level.platforms[i];
      if (x >= p.x && x <= p.x + p.w && y <= p.y && y >= p.y - p.h)
        return { kind: 'platforms', index: i };
    }
    for (var j = level.hazards.length - 1; j >= 0; j--) {
      var h = level.hazards[j];
      if (x >= h.x && x <= h.x + h.w && y <= h.y && y >= h.y - h.h)
        return { kind: 'hazards', index: j };
    }
    for (var k = level.pickups.length - 1; k >= 0; k--) {
      var q = level.pickups[k];
      if (Math.abs(q.x - x) < 0.3 && Math.abs(q.y - y) < 0.3)
        return { kind: 'pickups', index: k };
    }
    return null;
  }

  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    var x = wx(e.offsetX), y = wy(e.offsetY);
    if (tool === 'platform' || tool === 'hazard') {
      drag = { mode: 'draw', kind: tool, x0: snap(x), y0: snap(y) };
      return;
    }
    if (tool === 'pickup') {
      level.pickups.push({ x: snap(x), y: snap(y), kind: 'kibble' });
      sel = { kind: 'pickups', index: level.pickups.length - 1 };
      syncJSON();
      return;
    }
    if (tool === 'spawn') { level.spawn = { x: snap(x), y: snap(y) }; syncJSON(); return; }
    if (tool === 'goal') { level.goal = { x: snap(x), y: snap(y) }; syncJSON(); return; }

    var found = hit(x, y);
    sel = found;
    if (found) {
      var obj = level[found.kind][found.index];
      drag = { mode: 'move', ox: x - obj.x, oy: y - obj.y };
    } else {
      drag = { mode: 'pan', px: e.offsetX, py: e.offsetY, cx: cam.x, cy: cam.y };
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    hover = { x: wx(e.offsetX), y: wy(e.offsetY) };
    if (!drag) return;
    if (drag.mode === 'pan') {
      cam.x = drag.cx - (e.offsetX - drag.px) / cam.zoom;
      cam.y = drag.cy + (e.offsetY - drag.py) / cam.zoom;
    } else if (drag.mode === 'move' && sel) {
      var obj = level[sel.kind][sel.index];
      obj.x = snap(wx(e.offsetX) - drag.ox);
      obj.y = snap(wy(e.offsetY) - drag.oy);
    }
  });

  canvas.addEventListener('pointerup', function (e) {
    if (drag && drag.mode === 'draw') {
      var x1 = snap(wx(e.offsetX)), y1 = snap(wy(e.offsetY));
      var x = Math.min(drag.x0, x1), w = Math.abs(x1 - drag.x0);
      var top = Math.max(drag.y0, y1), h = Math.abs(y1 - drag.y0);
      if (w >= GRID && h >= GRID) {
        if (drag.kind === 'platform') {
          level.platforms.push({ x: x, y: top, w: w, h: h, ground: false });
          sel = { kind: 'platforms', index: level.platforms.length - 1 };
        } else {
          level.hazards.push({ x: x, y: top, w: w, h: h, kind: 'water' });
          sel = { kind: 'hazards', index: level.hazards.length - 1 };
        }
      }
    }
    drag = null;
    revalidate();
    syncJSON();
  });

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var before = { x: wx(e.offsetX), y: wy(e.offsetY) };
    cam.zoom = Math.max(12, Math.min(160, cam.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
    cam.x += before.x - wx(e.offsetX);
    cam.y += before.y - wy(e.offsetY);
  }, { passive: false });

  window.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
      level[sel.kind].splice(sel.index, 1);
      sel = null;
      revalidate(); syncJSON(); e.preventDefault();
      return;
    }
    var step = e.shiftKey ? GRID * 2 : GRID;
    var d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0],
              ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (d && sel) {
      var obj = level[sel.kind][sel.index];
      obj.x = +(obj.x + d[0]).toFixed(2);
      obj.y = +(obj.y + d[1]).toFixed(2);
      revalidate(); syncJSON(); e.preventDefault();
    }
  });

  // ------------------------------------------------------------------ draw
  function drawGrid() {
    var w = canvas.width / dpr(), h = canvas.height / dpr();
    var step = GRID * cam.zoom;
    if (step < 6) step *= 2;
    ctx.lineWidth = 1;
    for (var gx = Math.floor(cam.x / GRID) * GRID; sx(gx) < w; gx += GRID) {
      var major = Math.abs(gx % 1) < 1e-6;
      ctx.strokeStyle = major ? 'rgba(227,228,225,.10)' : 'rgba(227,228,225,.045)';
      ctx.beginPath(); ctx.moveTo(sx(gx) + .5, 0); ctx.lineTo(sx(gx) + .5, h); ctx.stroke();
    }
    for (var gy = Math.floor(cam.y / GRID) * GRID; sy(gy) > 0; gy += GRID) {
      var maj = Math.abs(gy % 1) < 1e-6;
      ctx.strokeStyle = maj ? 'rgba(227,228,225,.10)' : 'rgba(227,228,225,.045)';
      ctx.beginPath(); ctx.moveTo(0, sy(gy) + .5); ctx.lineTo(w, sy(gy) + .5); ctx.stroke();
    }
    // y = 0 is the ground line, worth calling out
    ctx.strokeStyle = 'rgba(229,181,58,.45)';
    ctx.beginPath(); ctx.moveTo(0, sy(0) + .5); ctx.lineTo(w, sy(0) + .5); ctx.stroke();
  }

  function drawArc() {
    var origin = { x: snap(hover.x), y: snap(hover.y) };
    [[1, 'rgba(239,74,79,.85)'], [-1, 'rgba(239,74,79,.35)']].forEach(function (d) {
      [[Infinity, 2], [0.001, 1]].forEach(function (mode) {
        var pts = window.Jump.arc({ hold: mode[0], floor: -4 });
        ctx.strokeStyle = d[1];
        ctx.lineWidth = mode[1];
        ctx.setLineDash(mode[1] === 1 ? [4, 4] : []);
        ctx.beginPath();
        pts.forEach(function (p, i) {
          var px = sx(origin.x + p.x * d[0]), py = sy(origin.y + p.y);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.stroke();
      });
    });
    ctx.setLineDash([]);
    // Peak height marker
    var peak = window.Jump.maxHeight();
    ctx.strokeStyle = 'rgba(229,181,58,.5)';
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(sx(origin.x - 2.6), sy(origin.y + peak));
    ctx.lineTo(sx(origin.x + 2.6), sy(origin.y + peak));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(227,228,225,.55)';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText('peak ' + peak.toFixed(2), sx(origin.x + 2.7), sy(origin.y + peak) + 4);
  }

  function rect(o, fill, stroke) {
    ctx.fillStyle = fill;
    ctx.fillRect(sx(o.x), sy(o.y), o.w * cam.zoom, o.h * cam.zoom);
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.strokeRect(sx(o.x), sy(o.y), o.w * cam.zoom, o.h * cam.zoom);
    }
  }

  function draw() {
    var d = dpr();
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * d || canvas.height !== h * d) {
      canvas.width = w * d; canvas.height = h * d;
    }
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = '#1a1c21';
    ctx.fillRect(0, 0, w, h);
    drawGrid();

    level.hazards.forEach(function (o, i) {
      rect(o, 'rgba(74,143,190,.5)',
           sel && sel.kind === 'hazards' && sel.index === i ? '#e5b53a' : null);
    });

    level.platforms.forEach(function (p, i) {
      var bad = unreachable.some(function (u) {
        return u.x === p.x && u.y === p.y;
      });
      rect(p, p.ground ? 'rgba(107,75,52,.9)' : 'rgba(122,86,60,.95)',
           sel && sel.kind === 'platforms' && sel.index === i ? '#e5b53a'
             : (bad ? '#ef4a4f' : null));
      ctx.fillStyle = '#5da041';
      ctx.fillRect(sx(p.x), sy(p.y), p.w * cam.zoom, Math.max(2, 0.12 * cam.zoom));
    });

    level.pickups.forEach(function (q, i) {
      ctx.fillStyle = '#c8892f';
      ctx.beginPath();
      ctx.arc(sx(q.x), sy(q.y), Math.max(3, 0.12 * cam.zoom), 0, Math.PI * 2);
      ctx.fill();
      if (sel && sel.kind === 'pickups' && sel.index === i) {
        ctx.strokeStyle = '#e5b53a'; ctx.lineWidth = 2; ctx.stroke();
      }
    });

    // Spawn and goal, with him drawn to scale so the whole thing has a sense
    // of size: one unit tall is the only measure that matters here.
    ctx.strokeStyle = 'rgba(93,160,65,.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx(level.spawn.x - 0.22), sy(level.spawn.y + 1),
                   0.44 * cam.zoom, 1 * cam.zoom);
    ctx.fillStyle = 'rgba(93,160,65,.75)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('spawn', sx(level.spawn.x - 0.22), sy(level.spawn.y + 1) - 5);

    if (level.goal) {
      ctx.strokeStyle = '#ef4a4f';
      ctx.beginPath();
      ctx.moveTo(sx(level.goal.x), sy(level.goal.y));
      ctx.lineTo(sx(level.goal.x), sy(level.goal.y + 1.4));
      ctx.stroke();
      ctx.fillStyle = '#ef4a4f';
      ctx.beginPath();
      ctx.moveTo(sx(level.goal.x), sy(level.goal.y + 1.4));
      ctx.lineTo(sx(level.goal.x + 0.5), sy(level.goal.y + 1.2));
      ctx.lineTo(sx(level.goal.x), sy(level.goal.y + 1.0));
      ctx.fill();
      ctx.fillText('ginger', sx(level.goal.x + 0.1), sy(level.goal.y) - 4);
    }

    if (tool !== 'select') drawArc();

    ctx.fillStyle = 'rgba(227,228,225,.4)';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(snap(hover.x).toFixed(1) + ', ' + snap(hover.y).toFixed(1), 10, h - 10);

    requestAnimationFrame(draw);
  }

  // ------------------------------------------------------------------ ui
  function fit() {
    // Fit the level's own extent, with headroom above the tallest platform
    // for the jump arc -- the level is much wider than it is tall.
    var maxX = level.width || 34;
    var top = level.platforms.reduce(function (m, p) {
      return Math.max(m, p.y);
    }, 0) + window.Jump.maxHeight() + 1;
    var zx = (canvas.clientWidth - 48) / (maxX + 2);
    var zy = (canvas.clientHeight - 48) / (top + 2);
    cam.zoom = Math.max(12, Math.min(90, Math.min(zx, zy)));
    cam.x = -1;
    cam.y = -1.2;
  }

  var pick = document.getElementById('levelPick');
  (window.MRCLUCKERS_LEVEL_ORDER || []).forEach(function (slug) {
    var o = document.createElement('option');
    o.value = slug;
    o.textContent = window.MRCLUCKERS_LEVELS[slug].name + '  (' + slug + ')';
    pick.appendChild(o);
  });
  pick.addEventListener('change', function () {
    setLevel(window.MRCLUCKERS_LEVELS[pick.value]);
    fit();
  });

  document.querySelectorAll('[data-tool]').forEach(function (b) {
    b.addEventListener('click', function () {
      tool = b.dataset.tool;
      document.querySelectorAll('[data-tool]').forEach(function (o) {
        o.setAttribute('aria-pressed', String(o === b));
      });
    });
  });

  document.getElementById('newLevel').addEventListener('click', function () {
    setLevel(blank()); fit();
  });
  document.getElementById('fit').addEventListener('click', fit);
  document.getElementById('copy').addEventListener('click', function () {
    navigator.clipboard.writeText(document.getElementById('json').value);
    this.textContent = 'Copied';
    setTimeout(function () { document.getElementById('copy').textContent = 'Copy'; }, 900);
  });
  document.getElementById('download').addEventListener('click', function () {
    var blob = new Blob([document.getElementById('json').value],
                        { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (level.name || 'level').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  document.getElementById('load').addEventListener('click', function () {
    try {
      setLevel(JSON.parse(document.getElementById('json').value));
    } catch (err) {
      document.getElementById('checks').innerHTML =
        '<span class="warn">' + err.message + '</span>';
    }
  });

  // Budget readout, straight from the shared physics.
  var B = document.getElementById('budget');
  [['max jump', window.Jump.maxHeight().toFixed(2)],
   ['gap @ run', window.Jump.reach(0).toFixed(2)],
   ['gap @ +0.5', window.Jump.reach(0.5).toFixed(2)],
   ['gap @ +1.0', window.Jump.reach(1.0).toFixed(2)],
   ['gap @ +1.5', window.Jump.reach(1.5).toFixed(2)]
  ].forEach(function (r) {
    B.insertAdjacentHTML('beforeend', '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>');
  });

  var first = (window.MRCLUCKERS_LEVEL_ORDER || [])[0];
  setLevel(first ? window.MRCLUCKERS_LEVELS[first] : blank());
  pick.value = first || '';
  requestAnimationFrame(function () { fit(); draw(); });
  window.__editor = { get level() { return level; }, setLevel: setLevel };
})();
