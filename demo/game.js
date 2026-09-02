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

  // --- world tuning ------------------------------------------------------
  // Derived from shared/jump.js so the two demos and the level editor all
  // agree about what a jump can clear.
  var J = window.Jump.C;
  var PX = J.PX_PER_HEIGHT;            // world pixels per character height
  var GRAVITY = J.GRAVITY * PX;
  var RUN_SPEED = J.RUN * PX;
  var WALK_SPEED = J.WALK * PX;
  var ACCEL = J.ACCEL * PX;
  var FRICTION = J.FRICTION * PX;
  var JUMP_VELOCITY = J.JUMP_VELOCITY * PX;
  var COYOTE_TIME = J.COYOTE;          // grace period after leaving a ledge
  var JUMP_BUFFER = J.JUMP_BUFFER;     // remembers an early jump press
  var HALF_W = J.HALF_WIDTH * PX;

  // Actions normally end when their clip does, but `tumble` loops, so it needs
  // an explicit limit or he spins forever. Roughly two turns of the clip.
  var ACTION_TIME = { tumble: 1.2 };
  var ACTION_KEYS = ["peck", "crow", "squeak", "tumble"];

  // --- bonus round -------------------------------------------------------
  // Once they are reunited she throws him and you steer. The rules live in
  // shared/bonus.js so this demo and the three.js one play the same game;
  // everything here is presentation.
  var BONUS_DELAY = 1.4;               // beat between the greeting and act two
  var bonus = null;                    // the shared rules object, once started
  var bonusWait = 0;
  var pops = [];                       // floating "+1" marks
  // How tall the throw is, straight from the physics rather than a number
  // typed here -- the two drifted apart once already and the toy flew off the
  // top of the screen on a phone.
  // The box the whole round has to fit inside, in world pixels, worked out
  // once from the physics rather than from numbers typed here.
  //
  // It includes the sprite, not just the arc: arcHeight() is where his
  // *origin* peaks, and he is drawn a cell upward from there while spinning.
  // Framing to the arc alone cropped his head off the top of the screen, and
  // every scoring test still passed while it did.
  var bonusBox = null;
  function measureBonus() {
    var pad = Math.hypot(CELL, CELL) / 2;       // worst case while tumbling
    var e = window.Bonus.extent(bonus.dog.dir);
    var g = LEVEL.goal;
    bonusBox = {
      left: g.x + e.min * PX - pad,
      right: g.x + e.max * PX + pad,
      top: g.y - window.Bonus.arcHeight() * PX - Math.max(ANCHOR.y, pad),
      bottom: g.y + 26
    };
  }

  // --- level -------------------------------------------------------------
  function pickLevel() {
    var order = window.MRCLUCKERS_LEVEL_ORDER || [];
    var want = (location.search.match(/[?&]level=([\w-]+)/) || [])[1];
    var slug = (want && window.MRCLUCKERS_LEVELS[want]) ? want : order[0];
    return { slug: slug, data: window.MRCLUCKERS_LEVELS[slug] };
  }

  // Ginger waits at the goal. Her sheet is baked at the same pixels-per-unit
  // as his, so she draws 1:1 in the same world space.
  var GDATA = window.GINGER && window.GINGER.side;
  var gingerSheet = null;
  var ginger = null;

  var levelClock = 0;                  // drives the patrols, in seconds
  var picked = pickLevel();
  // Authored in world units with Y up; the canvas works in pixels with Y down.
  var LEVEL = window.Level.toPixels(picked.data, PX);
  // The same level in its authored units, which is what the shared rules --
  // patrols, checkpoints -- speak. The demo converts their answers.
  var WORLD = window.Level.normalize(picked.data);
  var checkpoint = window.Checkpoint ? window.Checkpoint.create(WORLD) : null;
  var respawnFlash = 0;
  var collected = {};

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
  function Anim(name, data) {
    this.data = data || DATA;
    this.set(name, true);
  }
  Anim.prototype.set = function (name, force) {
    if (this.name === name && !force) return;
    this.name = name;
    this.clip = this.data.animations[name];
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
  if (GDATA) ginger = { anim: new Anim("sit_idle", GDATA), greeted: false };
  // Something more interesting than a toy chicken keeps turning up behind her.
  var distraction = (window.Distraction && LEVEL.goal)
    ? window.Distraction.create(LEVEL.goal.x / PX,
                               (LEVEL.ground - LEVEL.goal.y) / PX, 1)
    : null;

  var player = {
    x: LEVEL.spawn.x, y: LEVEL.spawn.y, vx: 0, vy: 0,
    facing: 1, onGround: true, coyote: 0, buffer: 0,
    landTimer: 0, action: null, actionTime: 0, stun: 0, hitCool: 0,
    anim: new Anim("idle")
  };

  // Ginger stands at the goal, so the bonus round's origin is her feet.
  // Its own units are the level's, just with Y the right way up.
  function bx2px(x) { return LEVEL.goal.x + x * PX; }
  function by2py(y) { return LEVEL.goal.y - y * PX; }

  function startBonus() {
    if (!window.Bonus || !LEVEL.goal) return null;
    bonus = window.Bonus.create();
    // She faces back down the level, which is the way she throws.
    bonus.start(0, 0, -1);
    measureBonus();
    pops = [];
    return bonus;
  }

  function updateBonus(dt) {
    bonus.update(dt, { left: keys.left, right: keys.right });

    var evs = bonus.drain();
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e === "squeak") {
        pops.push({ x: player.x, y: player.y, t: 0, text: "+1" });
      } else if (e === "catch") {
        pops.push({ x: player.x, y: player.y, t: 0,
                    text: "+" + bonus.cfg.catchScore });
        if (ginger) ginger.anim.set("greet", true);
      } else if (e === "land") {
        player.anim.set("land", true);
      }
    }

    // He *is* the toy now, so drive the sprite straight off the physics.
    player.x = bx2px(bonus.toy.x);
    player.y = by2py(bonus.toy.y);
    if (bonus.phase === "flight") {
      player.facing = bonus.toy.vx < 0 ? -1 : 1;
      if (player.anim.name !== "tumble") player.anim.set("tumble", true);
    } else if (player.anim.name === "tumble") {
      player.anim.set("idle", true);
    }
    player.anim.update(dt);

    if (ginger) {
      if (bonus.phase === "wind" && ginger.anim.name !== "greet") {
        ginger.anim.set("greet", true);
      } else if (ginger.anim.name === "greet" && ginger.anim.done) {
        ginger.anim.set("wag", true);
      }
      ginger.anim.update(dt);
    }

    for (var pi = pops.length - 1; pi >= 0; pi--) {
      pops[pi].t += dt;
      if (pops[pi].t > 0.9) pops.splice(pi, 1);
    }
    pressed = {};
  }

  function update(dt) {
    levelClock += dt;
    player.stun = Math.max(0, player.stun - dt);
    player.hitCool = Math.max(0, player.hitCool - dt);
    respawnFlash = Math.max(0, respawnFlash - dt);
    if (bonus) return updateBonus(dt);

    // The greeting plays out, then a beat, then she picks him up to throw.
    if (player.reached && !bonus) {
      bonusWait += dt;
      if (bonusWait >= BONUS_DELAY && startBonus()) return;
    }

    var wantLeft = keys.left, wantRight = keys.right;
    var crouching = keys.down && player.onGround;

    // Resolve any action already running first, so a cancelling press takes
    // effect on the same frame rather than the next one.
    if (player.action) {
      player.actionTime += dt;
      var limit = ACTION_TIME[player.action];
      var repeat = pressed[player.action];
      // Jumping outranks a flourish. A direction only shrugs off `tumble`,
      // which is a stun -- otherwise you could never peck on the run.
      var shrugged = repeat || pressed.jump ||
                     (player.action === "tumble" &&
                      (pressed.left || pressed.right || pressed.down));
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
    // Actions are cosmetic: they never stop the character. Movement follows
    // the keys that are *held*, so an action fired mid-run keeps the run.
    var target = 0;
    // A shove from the vacuum takes the controls away for a moment, so the
    // hit reads as being knocked about rather than the character sticking.
    if (!crouching && player.stun <= 0) {
      if (wantLeft) target -= 1;
      if (wantRight) target += 1;
    }
    var speed = keys.down ? WALK_SPEED : RUN_SPEED;
    if (target !== 0) {
      player.vx += target * ACCEL * dt;
      if (Math.abs(player.vx) > speed) player.vx = target * speed;
      player.facing = target;
    } else if (player.stun <= 0) {
      var drop = FRICTION * dt;
      player.vx = Math.abs(player.vx) <= drop ? 0
        : player.vx - Math.sign(player.vx) * drop;
    }
    // While stunned he keeps whatever the vacuum gave him. Friction here
    // scrubbed the shove off in about a tenth of a second, so being hit
    // moved him a third of a unit and read as nothing happening.

    player.coyote = player.onGround ? COYOTE_TIME : Math.max(0, player.coyote - dt);
    player.buffer = pressed.jump ? JUMP_BUFFER : Math.max(0, player.buffer - dt);
    if (player.buffer > 0 && player.coyote > 0) {
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

    // Pickups are collected on touch; the goal ends the level.
    for (var pi = 0; pi < LEVEL.pickups.length; pi++) {
      if (collected[pi]) continue;
      var pk = LEVEL.pickups[pi];
      if (Math.abs(pk.x - player.x) < 26 &&
          Math.abs(pk.y - (player.y - 34)) < 40) {
        collected[pi] = true;
        if (!player.action) { player.action = "squeak"; player.actionTime = 0;
                              player.anim.set("squeak", true); }
      }
    }
    if (distraction) {
      distraction.update(dt);
      // A squeak fetches her back, if he is close enough to be heard over it.
      if (pressed.squeak || (player.action === "squeak" && player.actionTime < dt * 1.5)) {
        if (distraction.squeak(player.x / PX) && ginger) {
          ginger.anim.set("greet", true);
        }
      }
    }
    if (LEVEL.goal && !player.reached &&
        Math.abs(LEVEL.goal.x - player.x) < 34 &&
        Math.abs(LEVEL.goal.y - player.y) < 60 &&
        (!distraction || distraction.onYou())) {
      player.reached = true;
      if (distraction) distraction.finish();
      player.action = "crow";
      player.actionTime = 0;
      player.anim.set("crow", true);
      if (ginger) { ginger.anim.set("greet", true); ginger.greeted = true; }
    }
    if (ginger) {
      // Once the greeting has played out she settles into wagging.
      if (ginger.greeted && ginger.anim.name === "greet" && ginger.anim.done) {
        ginger.anim.set("wag", true);
      }
      ginger.anim.update(dt);
    }

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

    // Hazards are judged *after* the platform collision has run, not before.
    // A landing frame dips just below the ledge plane before the collision
    // snaps him up, so checking first drowned him on the very frame he
    // landed -- which made every water gap flush with its bank uncrossable.
    var fell = player.y > LEVEL.ground + 400;
    var inHazard = false;
    for (var hi = 0; hi < LEVEL.hazards.length; hi++) {
      var hz = LEVEL.hazards[hi];
      // He drowns when he is *in* the water, not when he is level with it.
      // The band used to start 4px above the surface, and a hazard's edge
      // plus his half-width overlaps the ledge beside it -- so the first
      // fifth of a unit of every bank was lethal and any water gap flush
      // with its ledges could not be crossed at all.
      if (player.x + HALF_W > hz.x && player.x - HALF_W < hz.x + hz.w &&
          player.y > hz.y + 6 && player.y < hz.y + hz.h + 20) inHazard = true;
    }
    if (checkpoint) {
      checkpoint.consider(player.x / PX, (LEVEL.ground - player.y) / PX,
                          player.onGround && player.stun <= 0, dt);
    }
    if (fell || inHazard) {
      // Back to the last place he stood safely, not the start of the level.
      var back = checkpoint ? checkpoint.respawn()
                            : { x: LEVEL.spawn.x / PX,
                                y: (LEVEL.ground - LEVEL.spawn.y) / PX, grace: 0 };
      player.x = back.x * PX;
      player.y = LEVEL.ground - back.y * PX;
      player.vx = player.vy = 0;
      player.action = null;
      player.stun = 0;
      player.hitCool = back.grace;      // don't get hit the moment you arrive
      respawnFlash = 0.45;
    }


    // The vacuum. Not lethal -- it bats him back down the room, and being
    // above it is safe, so the counterplay is to time the gap or jump it.
    if (window.Patrol && player.hitCool <= 0) {
      for (var mi = 0; mi < LEVEL.patrols.length; mi++) {
        var m = LEVEL.patrols[mi];
        var feet = (LEVEL.ground - player.y) / PX;
        var hit = window.Patrol.hits(m, levelClock, player.x / PX, feet,
                                     J.HALF_WIDTH);
        if (!hit) continue;
        var k = window.Patrol.knockFrom(hit, player.x / PX);
        player.vx = k.vx * PX;
        player.vy = -k.vy * PX;
        player.onGround = false;
        player.stun = k.stun;
        player.hitCool = window.Patrol.CFG.immune;
        player.action = "tumble";
        player.actionTime = 0;
        player.anim.set("tumble", true);
        break;
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
    if (bonus && bonusBox) {
      // Fit the round's own box. Whole-pixel scales keep the art crisp, so
      // prefer one, but a short screen gets a fractional scale rather than a
      // cropped round -- seeing what you are steering beats crisp edges.
      var fit = Math.min(w / (bonusBox.right - bonusBox.left),
                         h / (bonusBox.bottom - bonusBox.top));
      SCALE = fit >= 1 ? Math.max(1, Math.min(12, Math.floor(fit)))
                       : Math.max(0.3, Math.floor(fit * 8) / 8);
      return;
    }
    SCALE = Math.max(1, Math.min(12, Math.round(h / VIEW_WORLD_H)));
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function updateCamera() {
    var viewW = canvas.width / SCALE;
    var viewH = canvas.height / SCALE;

    if (bonus && bonusBox) {
      // Hold the whole box still. The round is short and the arc is the thing
      // you are reading, so a fixed, fully framed shot beats a camera that
      // chases the toy around while you are trying to aim it.
      camX = (bonusBox.left + bonusBox.right) / 2 - viewW / 2;
      camY = (bonusBox.top + bonusBox.bottom) / 2 - viewH / 2;
      camX = Math.round(camX * SCALE) / SCALE;
      camY = Math.round(camY * SCALE) / SCALE;
      return;
    }

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

  // The robot vacuum: a dark disc with a bumper on its leading edge, a light
  // that blinks while it turns, and a shadow so it sits on the floor.
  function drawPatrols() {
    var R = window.Patrol.CFG.radius * PX, H = window.Patrol.CFG.height * PX;
    for (var i = 0; i < LEVEL.patrols.length; i++) {
      var m = LEVEL.patrols[i];
      var here = window.Patrol.at(m, levelClock);
      var cx = here.x * PX;
      var floor = LEVEL.ground - m.y * PX;

      ctx.fillStyle = "rgba(20, 26, 20, .28)";
      ctx.beginPath();
      ctx.ellipse(cx, floor + 1, R * 1.05, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#2b3038";
      ctx.beginPath();
      ctx.ellipse(cx, floor - H * 0.5, R, H * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3d444e";
      ctx.beginPath();
      ctx.ellipse(cx, floor - H * 0.72, R * 0.92, H * 0.44, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#4d5560";
      ctx.beginPath();
      ctx.ellipse(cx + here.dir * R * 0.62, floor - H * 0.42,
                  R * 0.30, H * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = here.turning
        ? (Math.floor(Date.now() / 180) % 2 ? "#ffd34d" : "#6b5a20")
        : "#7fd46b";
      ctx.beginPath();
      ctx.arc(cx, floor - H * 0.95, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // A squirrel: body, head, ears, and the tail that makes it a squirrel.
  // Small and procedural -- it is scenery with one job, not a character.
  function drawCritter(c) {
    var x = c.x * PX, y = LEVEL.ground - c.y * PX, f = c.dir;
    var U = PX * 0.5;                       // it stands about half his height
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(f, 1);
    ctx.fillStyle = "rgba(20, 26, 20, .25)";
    ctx.beginPath();
    ctx.ellipse(0, 1, U * 0.5, U * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tail first, so the body sits in front of it.
    ctx.fillStyle = "#7a5334";
    ctx.beginPath();
    ctx.ellipse(-U * 0.46, -U * 0.62, U * 0.22, U * 0.52, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8d6440";
    ctx.beginPath();
    ctx.ellipse(-U * 0.06, -U * 0.34, U * 0.30, U * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(U * 0.20, -U * 0.72, U * 0.21, U * 0.21, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(U * 0.10, -U * 0.88);
    ctx.lineTo(U * 0.14, -U * 1.06);
    ctx.lineTo(U * 0.26, -U * 0.90);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#2b2117";
    ctx.beginPath();
    ctx.arc(U * 0.29, -U * 0.75, U * 0.045, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawTreats() {
    if (bonus.phase === "done") return;   // nothing left to collect
    for (var i = 0; i < bonus.treats.length; i++) {
      var tr = bonus.treats[i];
      if (tr.taken) continue;
      var tx = bx2px(tr.x), ty = by2py(tr.y);
      var bob = Math.sin(Date.now() / 240 + i) * 2.5;
      ctx.fillStyle = "rgba(255, 235, 160, .35)";
      ctx.beginPath();
      ctx.arc(tx, ty + bob, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c8892f";
      ctx.beginPath();
      ctx.ellipse(tx, ty + bob, 8, 6, 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e8ab52";
      ctx.beginPath();
      ctx.ellipse(tx - 2, ty - 2 + bob, 3, 2, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Where he will come down if you stop steering now, and the patch of ground
  // that counts as a catch. Between them the round stops being guesswork: you
  // can see the marker slide as you hold a direction, and you can see the
  // target it has to end up inside.
  function drawCatchZone() {
    var g = LEVEL.goal, r = bonus.cfg.catchRadius * PX;
    var live = bonus.phase === "flight";
    var land = live ? bx2px(window.Bonus.predictLanding(bonus)) : null;
    var homing = live && Math.abs(land - g.x) < r;

    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = homing ? "rgba(150, 240, 140, .95)" : "rgba(255, 250, 210, .6)";
    ctx.beginPath();
    ctx.ellipse(g.x, g.y + 3, r, r * 0.30, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (!live) return;
    // The marker itself: a caret on the ground under the predicted landing.
    ctx.save();
    ctx.fillStyle = homing ? "rgba(150, 240, 140, .95)" : "rgba(255, 255, 255, .8)";
    ctx.beginPath();
    ctx.moveTo(land, g.y + 1);
    ctx.lineTo(land - 9, g.y - 13);
    ctx.lineTo(land + 9, g.y - 13);
    ctx.closePath();
    ctx.fill();
    // A dotted line up to him, so the marker reads as *his* landing spot.
    ctx.strokeStyle = "rgba(255, 255, 255, .28)";
    ctx.setLineDash([3, 7]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(land, g.y - 14);
    ctx.lineTo(player.x, player.y - 10);
    ctx.stroke();
    ctx.restore();
  }

  // Said once, at the start, because nothing else explains the round.
  function drawPrompt(w, h) {
    if (bonus.throwIndex > 0 || bonus.phase !== "wind") return;
    var a = Math.min(1, bonus.t / 0.25);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = "center";
    ctx.font = "bold " + Math.round(h / 22) + "px system-ui, sans-serif";
    ctx.fillStyle = "rgba(20, 26, 32, " + (0.55 * a).toFixed(2) + ")";
    ctx.fillRect(0, h * 0.13, w, h * 0.155);
    ctx.fillStyle = "rgba(255, 250, 225, " + a.toFixed(2) + ")";
    ctx.fillText("She's going to throw him \u2014 steer with \u25C0 \u25B6",
                 w / 2, h * 0.19);
    ctx.font = Math.round(h / 30) + "px system-ui, sans-serif";
    ctx.fillStyle = "rgba(210, 230, 245, " + a.toFixed(2) + ")";
    ctx.fillText("sweep up the treats, or land on the ring to be caught",
                 w / 2, h * 0.245);
    ctx.restore();
  }

  function drawPops() {
    ctx.textAlign = "center";
    ctx.font = "bold 20px system-ui, sans-serif";
    for (var i = 0; i < pops.length; i++) {
      var q = pops[i];
      var a = Math.max(0, 1 - q.t / 0.9);
      ctx.fillStyle = "rgba(255, 246, 214, " + a.toFixed(3) + ")";
      ctx.fillText(q.text, q.x, q.y - 40 - q.t * 46);
    }
    ctx.textAlign = "start";
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

    for (var hi2 = 0; hi2 < LEVEL.hazards.length; hi2++) {
      var hz2 = LEVEL.hazards[hi2];
      ctx.fillStyle = "rgba(70, 140, 190, .55)";
      ctx.fillRect(hz2.x, hz2.y, hz2.w, hz2.h);
      ctx.fillStyle = "rgba(150, 205, 235, .75)";
      ctx.fillRect(hz2.x, hz2.y, hz2.w, 3);
    }

    if (!bonus && window.Patrol) drawPatrols();

    if (!bonus) {
      for (var pi2 = 0; pi2 < LEVEL.pickups.length; pi2++) {
        if (collected[pi2]) continue;
        var pk2 = LEVEL.pickups[pi2];
        var bob = Math.sin(Date.now() / 260 + pi2) * 3;
        ctx.fillStyle = "#c8892f";
        ctx.beginPath();
        ctx.ellipse(pk2.x, pk2.y - 12 + bob, 7, 5, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      drawCatchZone();
      drawTreats();
    }

    if (distraction && distraction.critter) drawCritter(distraction.critter);

    if (LEVEL.goal && ginger && gingerSheet) {
      var g = LEVEL.goal;
      var gb = ginger.anim.box();
      var ga = GDATA.meta.anchor;
      // Her shadow, then the dog herself, mirrored so she faces him coming.
      ctx.fillStyle = "rgba(20, 30, 20, .26)";
      ctx.beginPath();
      ctx.ellipse(g.x, g.y + 2, 52, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      // Baked facing right, drawn mirrored to look back down the level -- but
      // when a squirrel has her, she turns round to watch it instead.
      var look = (distraction && distraction.watching) ? 1 : -1;
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.scale(look, 1);
      ctx.drawImage(gingerSheet, gb.x, gb.y, gb.w, gb.h,
                    -ga.x, -ga.y, gb.w, gb.h);
      ctx.restore();
    } else if (LEVEL.goal) {
      var f = LEVEL.goal;
      ctx.fillStyle = player.reached ? "#e0b52c" : "#cf2027";
      ctx.fillRect(f.x - 2, f.y - 62, 4, 62);
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

    // A ring where he reappears, so a respawn reads rather than teleporting.
    if (respawnFlash > 0) {
      var f = 1 - respawnFlash / 0.45;
      ctx.strokeStyle = "rgba(255, 246, 214, " + (0.75 * (1 - f)).toFixed(3) + ")";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(player.x, player.y - 24, 10 + 42 * f, 0, Math.PI * 2);
      ctx.stroke();
    }

    var box = player.anim.box();
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.scale(player.facing, 1);
    if (bonus && bonus.phase === "flight") {
      // A thrown plush turns end over end. Spin about his middle, not his
      // feet, or he swings around like a hammer.
      ctx.translate(0, -ANCHOR.y * 0.5);
      ctx.rotate(bonus.toy.spin * player.facing);
      ctx.translate(0, ANCHOR.y * 0.5);
    }
    ctx.drawImage(sheet, box.x, box.y, box.w, box.h,
                  -ANCHOR.x, -ANCHOR.y, CELL, CELL);
    ctx.restore();
    if (bonus) drawPops();
    if (bonus) { ctx.setTransform(1, 0, 0, 1, 0, 0); drawPrompt(w, h); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    var label = document.getElementById("state");
    if (label) label.textContent = player.anim.name;
    var title = document.getElementById("levelName");
    if (title) {
      if (bonus) {
        var head = bonus.phase === "done"
          ? "fetch! \u2014 final"
          : "fetch! throw " + Math.min(bonus.throwIndex + 1, bonus.cfg.throws) +
            "/" + bonus.cfg.throws;
        title.textContent = head + "  score " + bonus.score +
          "  \u2014 " + bonus.treatsTaken + " treats, " +
          bonus.caught + " caught";
      } else {
        var got = Object.keys(collected).length;
        var note = "";
        if (player.reached) note = "  \u2014 reunited!";
        else if (distraction && distraction.watching &&
                 Math.abs(LEVEL.goal.x - player.x) / PX < 6) {
          note = "  \u2014 she's watching a squirrel. Squeak!";
        }
        title.textContent = LEVEL.name + "  " + got + "/" +
          LEVEL.pickups.length + note;
      }
    }
  }

  // Exposed for debugging and for the automated input tests.
  window.mrCluckers = {
    player: player, level: LEVEL, slug: picked.slug,
    get bonus() { return bonus; },
    // The draw transform, so a test can check the character is actually on
    // screen. Scoring tests all passed while he was flying off the top.
    // The patrol clock, so a test can time a jump against the machine.
    clock: function () { return levelClock; },
    get checkpoint() { return checkpoint ? checkpoint.at : null; },
    get distraction() { return distraction; },
    get camera() { return { camX: camX, camY: camY, scale: SCALE,
                            w: canvas.width, h: canvas.height,
                            cell: CELL, anchor: ANCHOR }; },
    // Used by the automated tests, and handy for looking at act two without
    // replaying the level first.
    skipToBonus: function () {
      player.reached = true;
      player.x = LEVEL.goal.x;
      player.y = LEVEL.goal.y;
      return startBonus();
    }
  };

  var last = 0;
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  if (GDATA) {
    gingerSheet = new Image();
    gingerSheet.src = window.GINGER_IMAGE ||
      "../assets/sprites/" + GDATA.image;
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
