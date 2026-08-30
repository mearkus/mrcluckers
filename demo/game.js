/* Mr. Cluckers -- a minimal 2D platformer driving the baked sprite sheet.
 *
 * The interesting parts for reuse are Sprites (sheet + metadata lookup),
 * Anim (frame timing and one-shot clips) and pickState (the animation state
 * machine). The physics is deliberately plain.
 */
(function () {
  "use strict";

  var DATA = window.MRCLUCKERS.side;
  var CELL = DATA.meta.cell.w;
  var ANCHOR = DATA.meta.anchor;

  // Sprite pixels -> backing-store pixels. Picked from the canvas size so the
  // same amount of world stays visible on a phone as on a desktop.
  var SCALE = 2;
  var VIEW_WORLD_H = 280;              // world units we aim to show vertically

  // --- world tuning, in sprite pixels per second -------------------------
  var GRAVITY = 1750;
  var RUN_SPEED = 250;
  var WALK_SPEED = 105;
  var ACCEL = 1500;
  var FRICTION = 1900;
  var JUMP_VELOCITY = 640;
  var COYOTE_TIME = 0.09;              // grace period after leaving a ledge
  var JUMP_BUFFER = 0.11;              // remembers an early jump press

  // Actions normally end when their clip does, but `tumble` loops, so it needs
  // an explicit limit or he spins forever. Roughly two turns of the clip.
  var ACTION_TIME = { tumble: 1.2 };
  var ACTION_KEYS = ["peck", "crow", "squeak", "tumble"];

  var LEVEL = {
    width: 2400,
    ground: 430,
    platforms: [
      { x: 0, y: 430, w: 2400, h: 200 },
      { x: 300, y: 350, w: 190, h: 24 },
      { x: 560, y: 282, w: 150, h: 24 },
      { x: 820, y: 350, w: 220, h: 24 },
      { x: 1130, y: 300, w: 120, h: 24 },
      { x: 1330, y: 234, w: 200, h: 24 },
      { x: 1640, y: 320, w: 260, h: 24 },
      { x: 2000, y: 250, w: 180, h: 24 }
    ]
  };

  // ---------------------------------------------------------------- input
  var keys = {};
  var pressed = {};
  var KEYMAP = {
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    ArrowDown: "down", KeyS: "down",
    ArrowUp: "jump", KeyW: "jump", Space: "jump",
    KeyX: "peck", KeyC: "crow", KeyZ: "squeak", KeyV: "tumble"
  };
  window.addEventListener("keydown", function (e) {
    var k = KEYMAP[e.code];
    if (!k) return;
    if (!keys[k]) pressed[k] = true;
    keys[k] = true;
    e.preventDefault();
  });
  window.addEventListener("keyup", function (e) {
    var k = KEYMAP[e.code];
    if (!k) return;
    keys[k] = false;
    e.preventDefault();
  });

  // -------------------------------------------------------------- sprites
  function Anim(name) {
    this.set(name, true);
  }
  Anim.prototype.set = function (name, force) {
    if (this.name === name && !force) return;
    this.name = name;
    this.clip = DATA.animations[name];
    this.frame = 0;
    this.time = 0;
    this.done = false;
  };
  Anim.prototype.update = function (dt) {
    var frames = this.clip.frames;
    this.time += dt * 1000;
    var step = 1000 / this.clip.fps;
    while (this.time >= step) {
      this.time -= step;
      if (this.frame + 1 < frames.length) {
        this.frame++;
      } else if (this.clip.loop) {
        this.frame = 0;
      } else {
        this.done = true;
      }
    }
  };
  Anim.prototype.box = function () {
    return this.clip.frames[this.frame];
  };

  // --------------------------------------------------------------- player
  var player = {
    x: 120, y: LEVEL.ground, vx: 0, vy: 0,
    facing: 1, onGround: true, coyote: 0, buffer: 0,
    landTimer: 0, action: null, actionTime: 0,
    anim: new Anim("idle")
  };

  function update(dt) {
    var wantLeft = keys.left, wantRight = keys.right;
    var crouching = keys.down && player.onGround;

    // Resolve any action already running first, so a cancelling press takes
    // effect on the same frame rather than the next one.
    if (player.action) {
      player.actionTime += dt;
      var limit = ACTION_TIME[player.action];
      var repeat = pressed[player.action];
      var shrugged = repeat || pressed.left || pressed.right ||
                     pressed.down || pressed.jump;
      var expired = limit !== undefined && player.actionTime >= limit;
      if (shrugged || expired || player.anim.done) {
        // Don't let the same press immediately restart what it cancelled.
        if (repeat) pressed[player.action] = false;
        player.action = null;
      }
    }

    // Actions take over until their clip finishes, they time out, or the
    // player shrugs them off with any deliberate input.
    if (!player.action) {
      for (var ai = 0; ai < ACTION_KEYS.length; ai++) {
        if (pressed[ACTION_KEYS[ai]]) {
          player.action = ACTION_KEYS[ai];
          break;
        }
      }
      if (player.action) {
        player.actionTime = 0;
        player.anim.set(player.action, true);
      }
    }
    var busy = !!player.action;

    var target = 0;
    if (!busy && !crouching) {
      if (wantLeft) target -= 1;
      if (wantRight) target += 1;
    }
    var speed = keys.down ? WALK_SPEED : RUN_SPEED;
    if (target !== 0) {
      player.vx += target * ACCEL * dt;
      if (Math.abs(player.vx) > speed) player.vx = target * speed;
      player.facing = target;
    } else {
      var drop = FRICTION * dt;
      player.vx = Math.abs(player.vx) <= drop ? 0
        : player.vx - Math.sign(player.vx) * drop;
    }

    player.coyote = player.onGround ? COYOTE_TIME : Math.max(0, player.coyote - dt);
    player.buffer = pressed.jump ? JUMP_BUFFER : Math.max(0, player.buffer - dt);
    if (player.buffer > 0 && player.coyote > 0 && !busy) {
      player.vy = -JUMP_VELOCITY;
      player.onGround = false;
      player.coyote = 0;
      player.buffer = 0;
      player.anim.set("jump", true);
    }
    // Variable jump height: releasing early cuts the rise short.
    if (player.vy < 0 && !keys.jump) player.vy += GRAVITY * 1.6 * dt;

    player.vy += GRAVITY * dt;
    player.x += player.vx * dt;
    var prevY = player.y;
    player.y += player.vy * dt;
    player.x = Math.max(20, Math.min(LEVEL.width - 20, player.x));

    var wasAir = !player.onGround;
    player.onGround = false;
    if (player.vy >= 0) {
      for (var i = 0; i < LEVEL.platforms.length; i++) {
        var p = LEVEL.platforms[i];
        if (player.x + 16 > p.x && player.x - 16 < p.x + p.w &&
            prevY <= p.y + 1 && player.y >= p.y) {
          player.y = p.y;
          player.vy = 0;
          player.onGround = true;
          if (wasAir) player.landTimer = 0.28;
          break;
        }
      }
    }

    player.landTimer = Math.max(0, player.landTimer - dt);
    player.anim.set(pickState(crouching));
    player.anim.update(dt);

    pressed = {};
  }

  function pickState(crouching) {
    if (player.action) return player.action;
    if (!player.onGround) return player.vy < -40 ? "jump" : "fall";
    if (player.landTimer > 0.14) return "land";
    if (crouching) return "crouch";
    var s = Math.abs(player.vx);
    if (s > WALK_SPEED + 30) return "run";
    if (s > 12) return "walk";
    return "idle";
  }

  // --------------------------------------------------------------- render
  var canvas = document.getElementById("stage");
  var ctx = canvas.getContext("2d");
  var sheet = new Image();
  var camX = 0, camY = 0;

  var ASPECT = 16 / 9;

  function resize() {
    // Letterbox to a landscape play area: a full-height portrait canvas would
    // be mostly empty sky, since the level runs sideways.
    var wrap = canvas.parentNode;
    var availW = wrap.clientWidth, availH = wrap.clientHeight;
    var cssW = Math.min(availW, availH * ASPECT);
    var cssH = cssW / ASPECT;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";

    // Backing store follows the real size, so it stays sharp on dense screens.
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(cssW * dpr));
    var h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    SCALE = Math.max(1, Math.min(12, Math.round(h / VIEW_WORLD_H)));
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function updateCamera() {
    var viewW = canvas.width / SCALE;
    var viewH = canvas.height / SCALE;
    camX = clamp(player.x - viewW * 0.42, 0,
                 Math.max(0, LEVEL.width - viewW));
    // Keep him around two thirds down the view, but never show far below the
    // ground -- on a tall portrait screen that clamp is what keeps him framed.
    var lowest = LEVEL.ground + 60 - viewH;
    camY = clamp(player.y - viewH * 0.64, Math.min(-150, lowest),
                 Math.max(-150, lowest));
    // Snap to whole screen pixels so the pixel art doesn't shimmer.
    camX = Math.round(camX * SCALE) / SCALE;
    camY = Math.round(camY * SCALE) / SCALE;
  }

  function drawBackdrop(w, h) {
    var sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#8ec5e8");
    sky.addColorStop(1, "#dfeff7");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Hills are drawn in screen space so they can parallax against the camera.
    var horizon = (LEVEL.ground - camY) * SCALE;
    ctx.fillStyle = "#a9cf9a";
    var stepA = 320 * SCALE / 2;
    for (var i = -1; i < Math.ceil(w / stepA) + 2; i++) {
      ctx.beginPath();
      ctx.ellipse(i * stepA - (camX * SCALE * 0.35) % stepA, horizon + 30 * SCALE,
                  130 * SCALE, 75 * SCALE, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#8fbd80";
    var stepB = 220 * SCALE / 2;
    for (var j = -1; j < Math.ceil(w / stepB) + 2; j++) {
      ctx.beginPath();
      ctx.ellipse(j * stepB - (camX * SCALE * 0.6) % stepB, horizon + 55 * SCALE,
                  100 * SCALE, 60 * SCALE, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw() {
    resize();
    updateCamera();
    var w = canvas.width, h = canvas.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    drawBackdrop(w, h);

    // From here on everything is drawn in world units.
    ctx.setTransform(SCALE, 0, 0, SCALE, -camX * SCALE, -camY * SCALE);

    for (var i = 0; i < LEVEL.platforms.length; i++) {
      var p = LEVEL.platforms[i];
      ctx.fillStyle = "#6b4a33";
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = "#5c9e46";
      ctx.fillRect(p.x, p.y, p.w, 5);
      ctx.fillStyle = "#7cc55e";
      ctx.fillRect(p.x, p.y, p.w, 2);
    }

    // Soft contact shadow, sized by how far above the floor the bird is.
    var floor = LEVEL.ground;
    for (var k = 0; k < LEVEL.platforms.length; k++) {
      var q = LEVEL.platforms[k];
      if (player.x + 16 > q.x && player.x - 16 < q.x + q.w &&
          q.y >= player.y - 1 && q.y < floor) floor = q.y;
    }
    var gap = Math.max(0, floor - player.y);
    var t = Math.max(0, 1 - gap / 220);
    ctx.fillStyle = "rgba(20, 30, 20, " + (0.30 * t).toFixed(3) + ")";
    ctx.beginPath();
    ctx.ellipse(player.x, floor + 2, 30 * (0.5 + 0.5 * t), 7 * (0.4 + 0.6 * t),
                0, 0, Math.PI * 2);
    ctx.fill();

    var box = player.anim.box();
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.scale(player.facing, 1);
    ctx.drawImage(sheet, box.x, box.y, box.w, box.h,
                  -ANCHOR.x, -ANCHOR.y, CELL, CELL);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    var label = document.getElementById("state");
    if (label) label.textContent = player.anim.name;
  }

  var last = 0;
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  sheet.onload = function () {
    resize();
    if (global_TouchControls()) {
      global_TouchControls().mount({
        actions: [
          { code: "KeyX", label: "peck" },
          { code: "KeyC", label: "crow" },
          { code: "KeyZ", label: "squeak" },
          { code: "KeyV", label: "tumble" }
        ]
      });
      document.body.classList.add("touch");
    }
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    requestAnimationFrame(frame);
  };

  function global_TouchControls() {
    return window.TouchControls && window.TouchControls.isTouch
      ? window.TouchControls : null;
  }
  sheet.src = window.MRCLUCKERS_IMAGE ||
    "../assets/sprites/" + DATA.image;
})();
