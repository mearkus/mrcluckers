/* Mr. Cluckers -- a minimal 2D platformer driving the baked sprite sheet.
 *
 * The interesting parts for reuse are Sprites (sheet + metadata lookup),
 * Anim (frame timing and one-shot clips) and pickState (the animation state
 * machine). The physics is deliberately plain.
 */
(function () {
  "use strict";

  // No level in the URL means the title screen is up; nothing to play yet.
  if (window.MrCluckersShell && !window.MrCluckersShell.slugInURL()) return;

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
    var e = window.Bonus.extent();
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
  var paused = false;
  var picked = pickLevel();
  // Authored in world units with Y up; the canvas works in pixels with Y down.
  var LEVEL = window.Level.toPixels(picked.data, PX);
  // The same level in its authored units, which is what the shared rules --
  // patrols, checkpoints -- speak. The demo converts their answers.
  var WORLD = window.Level.normalize(picked.data);
  var checkpoint = window.Checkpoint ? window.Checkpoint.create(WORLD) : null;
  var respawnFlash = 0;
  var bits = [];              // dust and splashes; purely cosmetic

  /** A puff of `n` bits at a point, in world pixels. */
  function puff(x, y, n, color, up, spread) {
    for (var i = 0; i < n; i++) {
      var a = Math.PI * (0.15 + 0.7 * Math.random());
      var sp = (0.4 + Math.random()) * (spread || 60);
      bits.push({ x: x + (Math.random() - 0.5) * 14, y: y,
                  vx: Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1),
                  vy: -Math.abs(Math.sin(a)) * sp * (up || 1),
                  life: 0, max: 0.34 + Math.random() * 0.3,
                  r: 2 + Math.random() * 3, color: color });
    }
  }
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
    if (e.code === "Escape" || e.code === "KeyP") { togglePause(); e.preventDefault(); return; }
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
  // The other dog at the park. Same rig as Ginger, tinted so nobody confuses
  // the two, and it uses her new `trot` clip to actually cover ground.
  var thieves = (window.Thief && WORLD.thieves) ? WORLD.thieves.map(function (t) {
    return { anim: new Anim("stand", GDATA), state: window.Thief.create(WORLD, t) };
  }) : [];
  var thiefSheet = null;

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
      if (e === "throw") {
        window.Sound && window.Sound.play("throwUp");
      } else if (e === "catch") {
        window.Sound && window.Sound.play("catch");
        window.Sound && window.Sound.play("bark");
        pops.push({ x: bx2px(bonus.dog.x), y: by2py(bonus.dog.y), t: 0,
                    text: bonus.streak > 1 ? "+2" : "+1" });
        if (ginger) ginger.anim.set("greet", true);
      } else if (e === "miss") {
        window.Sound && window.Sound.play("miss");
        player.anim.set("land", true);
      }
    }

    // He is the toy, and she is the one you are steering.
    player.x = bx2px(bonus.toy.x);
    player.y = by2py(bonus.toy.y);
    player.facing = bonus.toy.vx < 0 ? -1 : 1;
    var flying = bonus.phase === "flight";
    if (flying && player.anim.name !== "tumble") player.anim.set("tumble", true);
    if (!flying && player.anim.name === "tumble") player.anim.set("idle", true);
    player.anim.update(dt);

    if (ginger) {
      // Running when she is running, pleased with herself when she catches.
      var running = Math.abs(bonus.dog.vx) > 0.4;
      if (ginger.anim.name === "greet" && !ginger.anim.done) {
        /* let the catch play out */
      } else if (running) {
        ginger.anim.set("trot");
      } else {
        ginger.anim.set(bonus.phase === "wind" ? "stand" : "wag");
      }
      ginger.anim.update(dt);
    }

    // The bonus round ending is the end of the level.
    if (bonus.phase === "done" && !bonus.recorded) {
      bonus.recorded = true;
      window.Sound && window.Sound.play("win");
      if (window.MrCluckersShell) {
        window.MrCluckersShell.finished(picked.slug, {
          kibble: Object.keys(collected).length,
          pickups: LEVEL.pickups.length,
          bonus: bonus.score
        });
      }
    }

    for (var pi = pops.length - 1; pi >= 0; pi--) {
      pops[pi].t += dt;
      if (pops[pi].t > 0.9) pops.splice(pi, 1);
    }
    pressed = {};
  }

  // --- pause ---------------------------------------------------------
  // There was no way out of a level but finishing it, which on a phone meant
  // no way out at all: the play view has no address bar to edit.
  function togglePause(force) {
    var want = force === undefined ? !paused : !!force;
    if (want === paused) return;
    paused = want;
    // Let go of everything, or a key held at the moment you paused stays held.
    keys = {}; pressed = {};
    var panel = document.getElementById("paused");
    if (!panel) return;
    panel.hidden = !paused;
    if (!paused) { panel.innerHTML = ""; return; }
    if (window.Sound) window.Sound.play("ui");

    panel.innerHTML = "";
    var box = document.createElement("div");
    box.className = "done-inner";
    var h = document.createElement("h2");
    h.textContent = "Paused";
    box.appendChild(h);
    var mk = function (cls, text, fn) {
      var b = document.createElement("button");
      b.className = cls; b.textContent = text;
      b.addEventListener("click", function () {
        if (window.Sound) window.Sound.play("ui");
        fn();
      });
      box.appendChild(b);
    };
    mk("big", "Resume", function () { togglePause(false); });
    mk("quiet", "Restart level", function () { location.reload(); });
    mk("quiet", "Level select", function () {
      // Level select is its own screen now, so this lands there rather than
      // on the title with a list under it.
      if (window.MrCluckersShell)
        window.MrCluckersShell.leaveTo("?#levels", "Mr. Cluckers");
      else location.href = "?#levels";
    });
    panel.appendChild(box);
  }

  function update(dt) {
    levelClock += dt;
    player.stun = Math.max(0, player.stun - dt);
    player.hitCool = Math.max(0, player.hitCool - dt);
    respawnFlash = Math.max(0, respawnFlash - dt);
    for (var bi = bits.length - 1; bi >= 0; bi--) {
      var q = bits[bi];
      q.life += dt;
      q.vy += 420 * dt;                 // they fall back down
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.life >= q.max) bits.splice(bi, 1);
    }
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
        if (player.action === "squeak") window.Sound && window.Sound.play("squeak");
        if (player.action === "crow") window.Sound && window.Sound.play("bark");
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
      window.Sound && window.Sound.play("jump");
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
        window.Sound && window.Sound.play("kibble");
        if (!player.action) { player.action = "squeak"; player.actionTime = 0;
                              player.anim.set("squeak", true); }
      }
    }
    for (var ti = 0; ti < thieves.length; ti++) {
      var th = thieves[ti];
      th.state.update(dt, { x: player.x / PX,
                            y: (LEVEL.ground - player.y) / PX,
                            onGround: player.onGround,
                            safe: player.hitCool > 0 });
      th.anim.set(th.state.clip());
      th.anim.update(dt);
      if (th.state.carrying && !th.grabbed) { th.grabbed = true; window.Sound && window.Sound.play("grab"); }
      if (!th.state.carrying) th.grabbed = false;
      if (th.state.carrying) {
        // He is in its mouth: no steering, and he plays along.
        var hold = th.state.carryPoint();
        player.x = hold.x * PX;
        player.y = LEVEL.ground - hold.y * PX;
        player.vx = player.vy = 0;
        player.onGround = false;
        player.stun = Math.max(player.stun, 0.1);
        player.hitCool = Math.max(player.hitCool, 0.6);
        if (player.anim.name !== "tumble") player.anim.set("tumble", true);
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
      window.Sound && window.Sound.play("bark");
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
          if (wasAir) {
            player.landTimer = 0.28;
            window.Sound && window.Sound.play("land");
            puff(player.x, player.y, 6,
                 (THEME && THEME.dust) || "rgba(150,130,100,.7)", 0.5, 55);
          }
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
      window.Sound && window.Sound.play(inHazard ? "splash" : "land");
      if (inHazard) puff(player.x, player.y, 12, "rgba(186, 224, 245, .9)", 1.5, 95);
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
        window.Sound && window.Sound.play("bump");
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

  var THEME = (window.Theme ? window.Theme.get(WORLD.theme) : null);

  /* Four kinds of parallax layer, described in shared/theme.js. Everything is
   * drawn in screen space so a layer can take whatever fraction of the
   * camera's motion it likes -- 0 is painted on the far wall, 1 moves with
   * the floor. */
  function drawLayer(L, w, h) {
    var horizon = (LEVEL.ground - camY) * SCALE;
    var step = (L.step || 200) * SCALE / 2;
    var shift = (camX * SCALE * (L.speed || 0.4)) % step;
    var y = horizon + (L.y || 0) * SCALE;
    ctx.save();
    if (L.alpha !== undefined) ctx.globalAlpha = L.alpha;
    ctx.fillStyle = L.color;

    if (L.kind === "band") {
      ctx.fillRect(0, y, w, Math.max(1, (L.h || 8) * SCALE));
    } else if (L.kind === "blobs") {
      for (var i = -1; i < Math.ceil(w / step) + 2; i++) {
        ctx.beginPath();
        ctx.ellipse(i * step - shift, y, (L.rx || 120) * SCALE,
                    (L.ry || 70) * SCALE, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (L.kind === "posts") {
      for (var j = -1; j < Math.ceil(w / step) + 2; j++) {
        ctx.fillRect(j * step - shift, y, (L.w || 10) * SCALE,
                     (L.h || 60) * SCALE);
      }
    } else if (L.kind === "panes") {
      for (var k = -1; k < Math.ceil(w / step) + 2; k++) {
        var px = k * step - shift;
        ctx.fillStyle = L.frame || "#b39a79";
        ctx.fillRect(px - 6 * SCALE, y - 6 * SCALE,
                     (L.w || 140) * SCALE + 12 * SCALE,
                     (L.h || 180) * SCALE + 12 * SCALE);
        ctx.fillStyle = L.color;
        ctx.fillRect(px, y, (L.w || 140) * SCALE, (L.h || 180) * SCALE);
      }
    }
    ctx.restore();
  }

  function drawBackdrop(w, h) {
    var t = THEME || { sky: ["#8ec5e8", "#dfeff7"], layers: [] };
    var sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, t.sky[0]);
    sky.addColorStop(1, t.sky[1]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < t.layers.length; i++) drawLayer(t.layers[i], w, h);
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

      var mower = m.kind === "mower";
      ctx.fillStyle = mower ? "#2f4a2b" : "#2b3038";
      ctx.beginPath();
      ctx.ellipse(cx, floor - H * 0.5, R, H * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = mower ? "#456b3d" : "#3d444e";
      ctx.beginPath();
      ctx.ellipse(cx, floor - H * 0.72, R * 0.92, H * 0.44, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = mower ? "#57814c" : "#4d5560";
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
  function drawThief(th) {
    if (!thiefSheet || !GDATA) return;
    var st = th.state, b = th.anim.box(), ga = GDATA.meta.anchor;
    var x = st.x * PX, y = LEVEL.ground - st.y * PX;
    ctx.fillStyle = "rgba(20, 30, 20, .24)";
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 48, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(st.dir > 0 ? 1 : -1, 1);      // baked facing right
    ctx.drawImage(thiefSheet, b.x, b.y, b.w, b.h, -ga.x, -ga.y, b.w, b.h);
    ctx.restore();
  }

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

  // The one thing you are aiming at: where he will come down. She has to be
  // standing on it. There is nothing else on screen to track.
  function drawTarget() {
    if (bonus.phase !== "flight") return;
    var lx = bx2px(window.Bonus.landing(bonus));
    var gy = by2py(bonus.dog.y);
    var under = Math.abs(window.Bonus.landing(bonus) - bonus.dog.x) <=
                bonus.cfg.catchRadius;
    var col = under ? "rgba(150, 240, 140, .95)" : "rgba(255, 250, 210, .8)";

    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.ellipse(lx, gy + 3, bonus.cfg.catchRadius * PX, 11, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // A line down from him, so the ring reads as *his* landing spot.
    ctx.strokeStyle = "rgba(255,255,255,.22)";
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.moveTo(lx, gy - 6);
    ctx.lineTo(player.x, player.y - 12);
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
    ctx.fillText("Fetch! \u25C0 \u25B6 run Ginger", w / 2, h * 0.19);
    ctx.font = Math.round(h / 30) + "px system-ui, sans-serif";
    ctx.fillStyle = "rgba(210, 230, 245, " + a.toFixed(2) + ")";
    ctx.fillText("catch him in the ring before he lands", w / 2, h * 0.245);
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
      var G = (THEME || {}).ground ||
              { dirt: "#6b4a33", edge: "#7d5940", cap: "#5c9e46", lip: "#7cc55e" };
      ctx.fillStyle = G.dirt;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // A lit edge down each side stops a platform reading as a flat slab.
      ctx.fillStyle = G.edge;
      ctx.fillRect(p.x, p.y, 3, p.h);
      ctx.fillRect(p.x + p.w - 3, p.y, 3, p.h);
      ctx.fillStyle = G.cap;
      ctx.fillRect(p.x, p.y, p.w, 5);
      ctx.fillStyle = G.lip;
      ctx.fillRect(p.x, p.y, p.w, 2);
    }

    for (var hi2 = 0; hi2 < LEVEL.hazards.length; hi2++) {
      var hz2 = LEVEL.hazards[hi2];
      var HZ = (THEME || {}).hazard ||
               { body: "rgba(70, 140, 190, .55)", top: "rgba(150, 205, 235, .75)" };
      ctx.fillStyle = HZ.body;
      ctx.fillRect(hz2.x, hz2.y, hz2.w, hz2.h);
      ctx.fillStyle = HZ.top;
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
      drawTarget();
    }

    for (var thi = 0; thi < thieves.length; thi++) drawThief(thieves[thi]);

    if (distraction && distraction.critter) drawCritter(distraction.critter);

    if (LEVEL.goal && ginger && gingerSheet) {
      // In the fetch round she is the one moving, so she is drawn wherever
      // you have run her to rather than parked at the goal.
      var g = bonus ? { x: bx2px(bonus.dog.x), y: by2py(bonus.dog.y) }
                    : LEVEL.goal;
      var gb = ginger.anim.box();
      var ga = GDATA.meta.anchor;
      // Her shadow, then the dog herself, mirrored so she faces him coming.
      ctx.fillStyle = "rgba(20, 30, 20, .26)";
      ctx.beginPath();
      ctx.ellipse(g.x, g.y + 2, 52, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      // Baked facing right, drawn mirrored to look back down the level -- but
      // when a squirrel has her, she turns round to watch it instead.
      var look = bonus ? (bonus.dog.dir > 0 ? 1 : -1)
                       : ((distraction && distraction.watching) ? 1 : -1);
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

    for (var bq = 0; bq < bits.length; bq++) {
      var q2 = bits[bq];
      ctx.globalAlpha = Math.max(0, 1 - q2.life / q2.max);
      ctx.fillStyle = q2.color;
      ctx.beginPath();
      ctx.arc(q2.x, q2.y, q2.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

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
        title.textContent = head + "  " + bonus.caught + "/" + bonus.cfg.throws +
          " caught" + (bonus.streak > 1 ? "  \u2014 " + bonus.streak + " in a row!" : "");
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
    get thieves() { return thieves.map(function (t) { return t.state; }); },
    get camera() { return { camX: camX, camY: camY, scale: SCALE,
                            w: canvas.width, h: canvas.height,
                            cell: CELL, anchor: ANCHOR }; },
    // Used by the automated tests, and handy for looking at act two without
    // replaying the level first.
    skipToBonus: function () {
      player.reached = true;
      window.Sound && window.Sound.play("bark");
      if (distraction) distraction.finish();   // she has her toy back
      player.x = LEVEL.goal.x;
      player.y = LEVEL.goal.y;
      return startBonus();
    }
  };

  var last = 0;
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    if (!paused) update(dt);      // still drawn, so the frozen frame shows
    draw();
    requestAnimationFrame(frame);
  }

  function makeThiefSheet(src) {
    // A second dog from one sprite sheet: draw hers, then wash a colour over
    // the pixels that are actually her, so the silhouette survives.
    var off = document.createElement("canvas");
    off.width = src.width; off.height = src.height;
    var c = off.getContext("2d");
    c.drawImage(src, 0, 0);
    c.globalCompositeOperation = "source-atop";
    c.fillStyle = "rgba(40, 44, 54, .55)";
    c.fillRect(0, 0, off.width, off.height);
    c.globalCompositeOperation = "source-over";
    return off;
  }

  if (GDATA) {
    gingerSheet = new Image();
    gingerSheet.onload = function () { thiefSheet = makeThiefSheet(gingerSheet); };
    gingerSheet.src = window.GINGER_IMAGE ||
      "../assets/sprites/" + GDATA.image;
  }

  sheet.onload = function () {
    resize();
    var pb = document.getElementById("pauseBtn");
    if (pb) {
      pb.hidden = false;
      pb.addEventListener("click", function () { togglePause(); });
    }
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
