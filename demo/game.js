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
    // The round's own patch, which is slid inside the level rather than
    // centred on her, so this is asked of the round and not of the config.
    var e = window.Bonus.span(bonus);
    var g = LEVEL.goal;
    bonusBox = {
      left: bx2px(e.min) - pad,
      right: bx2px(e.max) + pad,
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
  // The room's own tone. It waits for the first keypress on its own -- there
  // is no audio context before one, and that is a browser rule.
  if (window.Music) window.Music.start(WORLD.theme);

  /* Coming back from a fall.
   *
   * The camera is worked out straight from where he is, with no easing, so
   * moving him moved the whole view in one frame: you went in the water and
   * arrived somewhere else, mid-stride, with no beat in between. It read as
   * being teleported rather than as being fished out.
   *
   * So the swap happens behind a dip. He goes under first, the screen closes,
   * he is set down while nothing is visible, and it opens on him back on
   * solid ground. Same rules, same destination -- it just has a shape now. */
  var RECOVER = { under: 0.34, dark: 0.16, open: 0.42 };
  var recover = null;      // { t, from: {x, y}, to: {x, y}, grace, wet }
  // Same bargain the page's cover strikes: reduced motion still wants the
  // dip, because it is what stops the swap being a cut -- it just does not
  // want him dragged down the screen on the way into it.
  var CALM = typeof matchMedia === "function" &&
             matchMedia("(prefers-reduced-motion: reduce)").matches;

  function startRecovery(back, wet) {
    recover = {
      t: 0, wet: !!wet, grace: back.grace,
      from: { x: player.x, y: player.y },
      to: { x: back.x * PX, y: LEVEL.ground - back.y * PX }
    };
    player.vx = player.vy = 0;
    player.action = null;
    player.stun = 0;
  }

  /** 0 while you can still see, 1 at the bottom of the dip. */
  function recoverDim(r) {
    if (r.t < RECOVER.under) return r.t / RECOVER.under;
    if (r.t < RECOVER.under + RECOVER.dark) return 1;
    return Math.max(0, 1 - (r.t - RECOVER.under - RECOVER.dark) / RECOVER.open);
  }

  function updateRecovery(dt) {
    var r = recover;
    var was = r.t;
    r.t += dt;
    // Under he goes, while the screen is closing.
    if (r.t < RECOVER.under) {
      if (!CALM) player.y = r.from.y + (r.wet ? 46 : 90) * (r.t / RECOVER.under);
      return;
    }
    // Set down the moment nothing can be seen, so the camera's jump is not.
    if (was < RECOVER.under) {
      player.x = r.to.x;
      player.y = r.to.y;
      player.hitCool = Math.max(player.hitCool, r.grace);
      respawnFlash = 0.45;
      window.Sound && window.Sound.play("land");
    }
    player.x = r.to.x;
    player.y = r.to.y;
    player.vx = player.vy = 0;
    if (r.t >= RECOVER.under + RECOVER.dark + RECOVER.open) recover = null;
  }
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

  // The wildlife. Perches are authored into the level, so what a critter
  // does to you depends on where it is sitting: one near her takes her
  // attention, one near a kibble takes the kibble.
  var distraction = window.Distraction
    ? window.Distraction.flock({
        critters: WORLD.critters,
        dog: WORLD.goal ? { x: WORLD.goal.x, y: WORLD.goal.y } : null,
        pickups: WORLD.pickups })
    : null;
  function playerWorld() {
    return { x: player.x / PX, y: (LEVEL.ground - player.y) / PX + 0.45,
             taken: function (i) { return !!collected[i]; } };
  }

  // Every knock leaves a mark; three marks cost a seam. shared/wear.js keeps
  // the count so both demos scuff him at the same rate.
  var wear = window.Wear ? window.Wear.create() : null;

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

  var rivalAnim = null;                // the other dog, in the fetch round

  function startBonus() {
    if (!window.Bonus || !LEVEL.goal) return null;
    bonus = window.Bonus.create();
    rivalAnim = GDATA ? new Anim("stand", GDATA) : null;
    // The floor she is standing on, not the level's full width: three of the
    // five levels have a water gap before their last ledge, and the round
    // would lay its patch straight across it. Its origin is her feet, so the
    // ends come back relative to the goal.
    var floor = window.Level.footing(WORLD, WORLD.goal);
    // And what he arrived with: kibble buys throws, so the level's whole
    // point -- please her -- pays out in more fetch rather than a number.
    bonus.start(0, 0, { min: floor.min - WORLD.goal.x,
                        max: floor.max - WORLD.goal.x },
                Object.keys(collected).length);
    measureBonus();
    pops = [];
    return bonus;
  }

  /**
   * Book a knock and pay for it. A shove is its own punishment most of the
   * time; when it takes the last mark he comes apart, and that costs a seam
   * and the ground back to the last place he stood safely.
   */
  function tookAHit() {
    if (!wear) return;
    var cost = wear.hit();
    if (!cost.life) return;
    window.Sound && window.Sound.play("miss");
    // If the other dog was what did it, it does not get to keep him: the
    // recovery moves him, and a carry that outlives it drags him back.
    for (var ti = 0; ti < thieves.length; ti++) thieves[ti].state.letGo();
    // A burst of stuffing where the seam went.
    puff(player.x, player.y - ANCHOR.y * 0.55, 14,
         "rgba(246, 244, 236, .95)", 1.1, 80);
    // A seam costs the ground back to the last safe spot; the last seam
    // costs the level, and the checkpoint goes with it.
    var fallback = { x: LEVEL.spawn.x / PX,
                     y: (LEVEL.ground - LEVEL.spawn.y) / PX, grace: 0 };
    startRecovery(checkpoint
      ? (cost.out ? checkpoint.reset() : checkpoint.respawn())
      : fallback, false);
  }

  /**
   * A kibble going into the split. Said out loud, because a seam coming back
   * is the only thing in the level that undoes a knock -- silently mending
   * him would look like the knock had never counted.
   */
  function mendedByKibble(fixed) {
    if (!fixed || !fixed.mended) return;
    window.Sound && window.Sound.play(fixed.seam ? "win" : "ui");
    puff(player.x, player.y - ANCHOR.y * 0.55, fixed.seam ? 10 : 5,
         "rgba(226, 108, 96, .9)", 0.7, 55);
  }

  function updateBonus(dt) {
    // The toy is a rooster, and the other dog does not care for it: one crow
    // a throw stops it dead. Same button, same meaning as in the level.
    if (pressed.crow) bonus.crow();
    var before = bonus.score;
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
                    text: "+" + (bonus.score - before) });
        if (ginger) ginger.anim.set("greet", true);
      } else if (e === "miss") {
        window.Sound && window.Sound.play("miss");
        player.anim.set("land", true);
      } else if (e === "steal") {
        // Worse than dropping it: the other dog has him.
        window.Sound && window.Sound.play("miss");
        window.Sound && window.Sound.play("bark");
        player.anim.set("land", true);
        pops.push({ x: bx2px(bonus.rival.x), y: by2py(bonus.dog.y), t: 0,
                   text: "!" });
      } else if (e === "flinch") {
        window.Sound && window.Sound.play("bump");
        puff(bx2px(bonus.rival.x), by2py(bonus.dog.y) - 26,
             7, "rgba(228, 236, 244, .85)", 0.7, 60);
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

    if (rivalAnim && bonus.rival.active) {
      rivalAnim.set(Math.abs(bonus.rival.vx) > 0.4 ? "trot" : "stand");
      rivalAnim.update(dt);
    }

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
      if (window.Music) window.Music.stop();   // the room is over
      window.Sound && window.Sound.play("win");
      if (window.MrCluckersShell) {
        window.MrCluckersShell.finished(picked.slug, {
          kibble: Object.keys(collected).length,
          pickups: LEVEL.pickups.length,
          bonus: bonus.score,
          // How much of him came through it. Seams *kept*, not seams in hand:
          // running out patches him back up to three, so the number showing
          // in the HUD cannot tell a clean run from a disaster.
          seams: wear ? Math.max(0, wear.cfg.lives - wear.spent) : 0
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
    // The room stops with the game. A bed playing under a pause panel is the
    // one place it stops reading as the room and starts reading as a track.
    if (window.Music) {
      if (paused) window.Music.stop(); else window.Music.start(WORLD.theme);
    }
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
    if (wear) wear.update(dt);
    for (var bi = bits.length - 1; bi >= 0; bi--) {
      var q = bits[bi];
      q.life += dt;
      q.vy += 420 * dt;                 // they fall back down
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (q.life >= q.max) bits.splice(bi, 1);
    }
    if (bonus) return updateBonus(dt);
    if (recover) {
      // He is not steerable and nothing can reach him: this beat belongs to
      // the recovery, and the level carries on around it. Read the phase
      // before the update -- the last frame of it clears `recover`.
      var going = recover.wet && recover.t < RECOVER.under;
      updateRecovery(dt);
      player.anim.set(going ? "tumble" : "idle");
      player.anim.update(dt);
      pressed = {};
      return;
    }

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
      if (distraction && distraction.lost(pi)) continue;
      var pk = LEVEL.pickups[pi];
      if (Math.abs(pk.x - player.x) < 26 &&
          Math.abs(pk.y - (player.y - 34)) < 40) {
        collected[pi] = true;
        window.Sound && window.Sound.play("kibble");
        if (!player.action) { player.action = "squeak"; player.actionTime = 0;
                              player.anim.set("squeak", true); }
        mendedByKibble(wear && wear.feed());
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
      // One knock per pick-up, on the frame it gets him, using the edge that
      // was already here for the sound rather than a second flag beside it.
      if (th.state.carrying && !th.grabbed) {
        th.grabbed = true;
        window.Sound && window.Sound.play("grab");
        tookAHit();
      }
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
      var stolenBefore = distraction.stolen.length;
      var pw = playerWorld();
      distraction.update(dt, pw);
      // Something just left with a kibble you will not be getting back.
      if (distraction.stolen.length > stolenBefore) {
        window.Sound && window.Sound.play("bump");
        for (var sIdx = stolenBefore; sIdx < distraction.stolen.length; sIdx++) {
          var lost = LEVEL.pickups[distraction.stolen[sIdx]];
          if (lost) puff(lost.x, lost.y - 12, 6, "rgba(200, 137, 47, .8)", 0.5, 50);
        }
      }
      // A bird going up in his face, or something a squirrel knocked off its
      // branch. Same shape as the vacuum's shove -- not lethal, but it can
      // put him somewhere that is.
      var blows = distraction.knocks();
      for (var bi = 0; bi < blows.length; bi++) {
        if (player.hitCool > 0) break;
        var bw = blows[bi];
        player.vx = bw.vx * PX;
        player.vy = -bw.vy * PX;
        player.onGround = false;
        player.stun = bw.stun;
        player.hitCool = window.Distraction.CFG.immune;
        window.Sound && window.Sound.play("bump");
        tookAHit();
        player.action = "tumble";
        player.actionTime = 0;
        player.anim.set("tumble", true);
        puff(bw.x * PX, LEVEL.ground - bw.y * PX, 6,
             bw.kind === "acorn" ? "rgba(150, 110, 60, .9)"
                                 : "rgba(228, 236, 244, .85)", 0.6, 55);
      }

      // A squeak fetches her back, if he is close enough to be heard over it.
      if (pressed.squeak || (player.action === "squeak" && player.actionTime < dt * 1.5)) {
        if (distraction.squeak(player.x / PX) && ginger) {
          ginger.anim.set("greet", true);
        }
      }
      // And a crow puts every bird within earshot up, which ends the visit
      // outright -- and any theft that bird was halfway through. The other
      // half of the deal: two flourishes, two things they are actually for.
      if (pressed.crow || (player.action === "crow" && player.actionTime < dt * 1.5)) {
        var flushed = distraction.scare(pw.x, pw.y);
        if (flushed.length) window.Sound && window.Sound.play("bump");
        for (var fi = 0; fi < flushed.length; fi++) {
          puff(flushed[fi].x * PX, LEVEL.ground - flushed[fi].y * PX,
               7, "rgba(228, 236, 244, .85)", 0.7, 60);
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
    var wasRiding = player.riding;
    player.onGround = false;
    player.riding = null;
    if (player.vy >= 0) {
      for (var i = 0; i < LEVEL.platforms.length; i++) {
        var p = LEVEL.platforms[i];
        if (player.x + 16 > p.x && player.x - 16 < p.x + p.w &&
            prevY <= p.y + 1 && player.y >= p.y) {
          player.y = p.y;
          player.vy = 0;
          player.onGround = true;
          break;
        }
      }
      // The top of a vacuum is a surface too. `Patrol.hits` has always
      // treated being above one as safe; this makes that space stand on,
      // which turns the thing you were dodging into the thing that carries
      // you over the gap it patrols.
      if (!player.onGround && window.Patrol) {
        for (var ri = 0; ri < LEVEL.patrols.length; ri++) {
          var d = window.Patrol.deck(LEVEL.patrols[ri], levelClock);
          var deckY = LEVEL.ground - d.y * PX;
          if (Math.abs(player.x - d.x * PX) < d.halfW * PX + 10 &&
              prevY <= deckY + 6 && player.y >= deckY) {
            player.y = deckY;
            player.vy = 0;
            player.onGround = true;
            player.riding = LEVEL.patrols[ri];
            break;
          }
        }
      }
      if (player.onGround && wasAir) {
        player.landTimer = 0.28;
        window.Sound && window.Sound.play("land");
        puff(player.x, player.y, 6,
             (THEME && THEME.dust) || "rgba(150,130,100,.7)", 0.5, 55);
      }
    }
    // Carried by whatever he is standing on. Taken as the deck's own
    // movement over this frame, so he keeps station on it exactly -- through
    // the turnaround pause included -- instead of drifting off the back.
    if (player.riding) {
      player.x += window.Patrol.drift(player.riding, levelClock - dt,
                                      levelClock) * PX;
    }
    if (wasRiding && !player.riding && player.vy < 0) {
      // Stepping off keeps a little of the machine's motion, which is what
      // makes riding worth doing: it throws you further than a standing jump.
      player.vx += window.Patrol.drift(wasRiding, levelClock - dt, levelClock)
                   * PX / Math.max(dt, 0.001) * 0.5;
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
      // Back to the last place he stood safely, not the start of the level --
      // and behind a dip, so it reads as being fished out rather than moved.
      startRecovery(checkpoint ? checkpoint.respawn()
                               : { x: LEVEL.spawn.x / PX,
                                   y: (LEVEL.ground - LEVEL.spawn.y) / PX,
                                   grace: 0 }, inHazard);
    }


    // The vacuum. Not lethal -- it bats him back down the room. Being above
    // one is safe, and now standing on one is a ride, so the counterplay is
    // to time the gap, jump it, or get on top of it.
    if (window.Patrol && player.hitCool <= 0) {
      for (var mi = 0; mi < LEVEL.patrols.length; mi++) {
        var m = LEVEL.patrols[mi];
        if (player.riding === m) continue;
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
        tookAHit();
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
    for (var i = 0; i < t.layers.length; i++) {
      if (!t.layers[i].front) drawLayer(t.layers[i], w, h);
    }
  }

  /** The layers that pass in front of him, drawn after everything else. */
  function drawFront(w, h) {
    var t = THEME;
    if (!t || !t.layers) return;
    for (var i = 0; i < t.layers.length; i++) {
      if (t.layers[i].front) drawLayer(t.layers[i], w, h);
    }
  }

  /* ------------------------------------------------------ platforms */
  /* Five shapes, drawn from the theme's own palette. The level says what
   * shape a thing is; `shared/theme.js` says what it is made of here -- so
   * one `soft` platform is a sofa in the living room, a hedge in the lane
   * and a bush in the park, from the same field in the same file. */

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPlatform(p) {
    var G = (THEME || {}).ground ||
            { dirt: "#6b4a33", edge: "#7d5940", cap: "#5c9e46", lip: "#7cc55e" };
    var C = window.Theme ? window.Theme.part(LEVEL.theme, p.kind) : null;

    if (p.kind === "slab" && C) {
      // A worktop or a bench: a top with legs under it, and daylight between
      // them. The gap is the whole point -- it is what stops a row of these
      // reading as one long wall.
      var legW = Math.max(5, p.w * 0.09), inset = Math.max(4, p.w * 0.07);
      ctx.fillStyle = C.leg;
      ctx.fillRect(p.x + inset, p.y + 7, legW, p.h - 7);
      ctx.fillRect(p.x + p.w - inset - legW, p.y + 7, legW, p.h - 7);
      ctx.fillStyle = C.body;
      ctx.fillRect(p.x, p.y + 4, p.w, 9);
      ctx.fillStyle = C.top;
      ctx.fillRect(p.x - 2, p.y, p.w + 4, 5);
    } else if (p.kind === "soft" && C) {
      // Upholstery, or foliage: rounded, with a scatter of highlights along
      // the top so the silhouette is not a straight line.
      ctx.fillStyle = C.body;
      roundRect(p.x, p.y, p.w, Math.max(p.h, 14), 9);
      ctx.fill();
      ctx.fillStyle = C.top;
      roundRect(p.x, p.y, p.w, 11, 6);
      ctx.fill();
      ctx.fillStyle = C.tuft;
      for (var t = p.x + 8; t < p.x + p.w - 6; t += 17) {
        ctx.beginPath();
        ctx.ellipse(t, p.y + 3, 6, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (p.kind === "crate" && C) {
      ctx.fillStyle = C.body;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);
      // Planks, and a diagonal brace: a crate you can read at a glance.
      ctx.beginPath();
      for (var b = p.y + 12; b < p.y + p.h - 4; b += 12) {
        ctx.moveTo(p.x + 1, b); ctx.lineTo(p.x + p.w - 1, b);
      }
      ctx.moveTo(p.x + 2, p.y + p.h - 2); ctx.lineTo(p.x + p.w - 2, p.y + 2);
      ctx.stroke();
      ctx.fillStyle = C.top;
      ctx.fillRect(p.x, p.y, p.w, 4);
    } else if (p.kind === "pipe" && C) {
      var ph = Math.max(p.h, 13);
      ctx.fillStyle = C.body;
      roundRect(p.x, p.y, p.w, ph, Math.min(7, ph * 0.5));
      ctx.fill();
      ctx.fillStyle = C.top;
      roundRect(p.x + 2, p.y + 1, p.w - 4, 5, 2.5);
      ctx.fill();
    } else {
      // `ledge` -- ground, walls, everything structural. Unchanged.
      ctx.fillStyle = G.dirt;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = G.edge;
      ctx.fillRect(p.x, p.y, 3, p.h);
      ctx.fillRect(p.x + p.w - 3, p.y, 3, p.h);
      ctx.fillStyle = G.cap;
      ctx.fillRect(p.x, p.y, p.w, 5);
      ctx.fillStyle = G.lip;
      ctx.fillRect(p.x, p.y, p.w, 2);
    }
  }

  /* ---------------------------------------------------------- props */
  /* Scenery. Nothing here is collided with or scored -- it exists so the
   * level reads as a room or a lane instead of a row of ledges. Props carry
   * their own colours: a pot plant is a pot plant wherever it stands. */
  function drawProp(d) {
    var s = d.scale || 1;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.scale(d.flip ? -s : s, s);

    if (d.kind === "plant") {
      ctx.fillStyle = "#a9603c";
      ctx.beginPath();
      ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.lineTo(10, -22); ctx.lineTo(-10, -22);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#c07047";
      ctx.fillRect(-14, -26, 28, 5);
      ctx.fillStyle = "#4e8a45";
      [[-11, -40, 9, 17], [0, -50, 10, 20], [11, -41, 9, 16]].forEach(function (l) {
        ctx.beginPath();
        ctx.ellipse(l[0], l[1], l[2], l[3], 0, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (d.kind === "lamp") {
      ctx.fillStyle = "#5c5148";
      ctx.fillRect(-2.5, -74, 5, 74);
      ctx.fillRect(-11, -3, 22, 4);
      ctx.fillStyle = "#e8cf9a";
      ctx.beginPath();
      ctx.moveTo(-19, -74); ctx.lineTo(19, -74); ctx.lineTo(13, -100);
      ctx.lineTo(-13, -100); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255, 232, 170, .28)";
      ctx.beginPath();
      ctx.ellipse(0, -68, 30, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.kind === "bowl") {
      // Ginger's. Which is why there is kibble all over this game.
      ctx.fillStyle = "#3f6f96";
      ctx.beginPath();
      ctx.moveTo(-17, -14); ctx.lineTo(17, -14); ctx.lineTo(12, 0); ctx.lineTo(-12, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#5b93bd";
      ctx.beginPath();
      ctx.ellipse(0, -14, 17, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c9913f";
      ctx.beginPath();
      ctx.ellipse(0, -14, 11, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (d.kind === "ball") {
      ctx.fillStyle = "#d34a3f";
      ctx.beginPath(); ctx.arc(0, -11, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#f0f2f4";
      ctx.beginPath(); ctx.arc(0, -11, 11, 2.5, 3.9); ctx.fill();
    } else if (d.kind === "tree") {
      ctx.fillStyle = "#6b4a2f";
      ctx.fillRect(-7, -74, 14, 74);
      ctx.fillStyle = "#4f8a3f";
      [[0, -96, 34, 27], [-22, -80, 22, 18], [22, -82, 21, 17]].forEach(function (c) {
        ctx.beginPath();
        ctx.ellipse(c[0], c[1], c[2], c[3], 0, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = "#63a44f";
      ctx.beginPath(); ctx.ellipse(-8, -101, 19, 13, 0, 0, Math.PI * 2); ctx.fill();
    } else if (d.kind === "flowers") {
      ctx.strokeStyle = "#4e8a45";
      ctx.lineWidth = 2;
      ctx.beginPath();
      [-12, -3, 7, 15].forEach(function (x, i) {
        ctx.moveTo(x, 0); ctx.lineTo(x + (i % 2 ? 2 : -2), -17 - (i % 3) * 5);
      });
      ctx.stroke();
      var cols = ["#e8d24a", "#e07ba8", "#f2f2f2", "#e8d24a"];
      [-12, -3, 7, 15].forEach(function (x, i) {
        ctx.fillStyle = cols[i];
        ctx.beginPath();
        ctx.arc(x + (i % 2 ? 2 : -2), -18 - (i % 3) * 5, 4.5, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (d.kind === "bin") {
      ctx.fillStyle = "#4a5560";
      ctx.beginPath();
      ctx.moveTo(-15, 0); ctx.lineTo(15, 0); ctx.lineTo(12, -38); ctx.lineTo(-12, -38);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#5d6b78";
      ctx.fillRect(-16, -44, 32, 6);
      ctx.fillStyle = "#3b444d";
      ctx.fillRect(-13, -30, 26, 3);
    } else if (d.kind === "post") {
      ctx.fillStyle = "#6d5945";
      ctx.fillRect(-4, -56, 8, 56);
      ctx.fillStyle = "#856f56";
      ctx.fillRect(-4, -56, 3, 56);
      ctx.fillStyle = "#8a7359";
      ctx.fillRect(-10, -60, 20, 5);
    }
    ctx.restore();
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

  /* A bird: rounder than the squirrel, no tail to speak of, and wings that
   * are out when it is in the air and folded when it is perched -- which is
   * the only reliable way to read "this one will leave on its own". */
  function drawBird(c) {
    var x = c.x * PX, y = LEVEL.ground - c.y * PX, f = c.dir;
    var U = PX * 0.34;                      // smaller than the squirrel
    var flap = c.flying ? Math.sin(levelClock * 22) * 0.55 : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(f, 1);
    // No contact shadow: a bird perches above the floor, so an ellipse under
    // its feet lands in mid-air rather than on anything.
    ctx.fillStyle = "#4a6274";
    ctx.beginPath();                        // the far wing, behind the body
    ctx.ellipse(-U * 0.12, -U * 0.62, U * 0.34, U * 0.15, -0.5 + flap, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5b788d";
    ctx.beginPath();
    ctx.ellipse(-U * 0.34, -U * 0.5, U * 0.2, U * 0.1, 0.7, 0, Math.PI * 2);
    ctx.fill();                             // tail
    ctx.beginPath();
    ctx.ellipse(0, -U * 0.55, U * 0.36, U * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();                             // body
    ctx.beginPath();
    ctx.ellipse(U * 0.3, -U * 0.9, U * 0.2, U * 0.19, 0, 0, Math.PI * 2);
    ctx.fill();                             // head
    ctx.fillStyle = "#6d8ba1";
    ctx.beginPath();                        // the near wing
    ctx.ellipse(-U * 0.02, -U * 0.56, U * 0.32, U * 0.13, -0.35 - flap, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e0a33c";
    ctx.beginPath();
    ctx.moveTo(U * 0.46, -U * 0.92);
    ctx.lineTo(U * 0.66, -U * 0.86);
    ctx.lineTo(U * 0.46, -U * 0.8);
    ctx.closePath();
    ctx.fill();                             // beak
    ctx.fillStyle = "#20262c";
    ctx.beginPath();
    ctx.arc(U * 0.36, -U * 0.95, U * 0.05, 0, Math.PI * 2);
    ctx.fill();
    drawCarry(c, U, [U * 0.62, -U * 0.78]);
    ctx.restore();
  }

  /* What the knocks have done to him: stuffing out of a seam and a smudge to
   * go with it, drawn inside his own transform so they ride the sprite. A
   * plush toy dragged through five levels should look like it, and it is the
   * only way to know how close the next seam is without reading a number. */
  // Against *his* height, not the sprite cell: the cell is 96px for a
  // character 72.73 tall, so cell units put the marks a third too big and
  // outside his outline, where they read as bubbles rather than as stuffing.
  var WEAR_MARKS = [
    { x: -0.05, y: -0.66, a: -0.35, len: 0.085 },  // a seam over the shoulder
    { x: 0.15, y: -0.46, a: 0.8, len: 0.075 }      // and one at the flank
  ];
  function drawWear() {
    if (!wear || (!wear.wear && wear.mending <= 0)) return;
    var U = PX;
    // Freshly mended: a bright stitch that fades, so a lost seam is legible
    // as a repair rather than as nothing having happened.
    if (wear.mending > 0) {
      var m = wear.mending / (wear.cfg.patched || 1);
      ctx.strokeStyle = "rgba(226, 108, 96, " + (0.85 * m).toFixed(3) + ")";
      ctx.lineWidth = Math.max(1, U * 0.018);
      ctx.beginPath();
      for (var st = 0; st < 4; st++) {
        var sx = -U * 0.14 + st * U * 0.075;
        ctx.moveTo(sx, -U * 0.50);
        ctx.lineTo(sx + U * 0.035, -U * 0.44);
      }
      ctx.stroke();
    }
    for (var i = 0; i < wear.wear && i < WEAR_MARKS.length; i++) {
      var w = WEAR_MARKS[i];
      ctx.save();
      ctx.translate(w.x * U, w.y * U);
      ctx.rotate(w.a);
      var L = w.len * U;                   // how far the seam has given way
      // A smudge around it first, so the split does not sit on clean fabric.
      ctx.fillStyle = "rgba(92, 80, 64, .22)";
      ctx.beginPath();
      ctx.ellipse(0, 0, L * 1.5, L * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      // The split: a dark line the stuffing is coming out of. Thin, because a
      // burst seam is a line, and a fat one would read as a painted stripe.
      ctx.strokeStyle = "rgba(38, 32, 26, .55)";
      ctx.lineWidth = Math.max(1, U * 0.012);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-L, 0);
      ctx.lineTo(L, 0);
      ctx.stroke();
      // Loose thread ends where the stitching gave: two short ticks.
      ctx.lineWidth = Math.max(1, U * 0.008);
      ctx.strokeStyle = "rgba(38, 32, 26, .38)";
      ctx.beginPath();
      ctx.moveTo(-L, 0); ctx.lineTo(-L - L * 0.35, -L * 0.3);
      ctx.moveTo(L, 0); ctx.lineTo(L + L * 0.3, L * 0.3);
      ctx.stroke();
      // The stuffing: a couple of small lobes bulging out of the line, not one
      // oval sitting on top of it -- the lobes are what make it read as filling
      // rather than as a sticker.
      ctx.fillStyle = "rgba(250, 248, 242, .95)";
      var lobes = [[-L * 0.26, -L * 0.15, L * 0.40], [L * 0.16, -L * 0.07, L * 0.28]];
      for (var b = 0; b < lobes.length; b++) {
        ctx.beginPath();
        ctx.ellipse(lobes[b][0], lobes[b][1], lobes[b][2], lobes[b][2] * 0.82,
                    0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      // A little shade under the tufts so they sit in the hole.
      ctx.fillStyle = "rgba(180, 172, 158, .45)";
      ctx.beginPath();
      ctx.ellipse(-L * 0.24, L * 0.10, L * 0.34, L * 0.13, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Whatever a squirrel has knocked off its branch, on its way down. Drawn
  // with a little spin so it reads as falling rather than as placed.
  function drawFalling() {
    for (var i = 0; i < distraction.acorns.length; i++) {
      var n = distraction.acorns[i];
      var x = n.x * PX, y = LEVEL.ground - n.y * PX;
      var U = PX * 0.16;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((n.from - n.y) * 2.2);
      ctx.fillStyle = "#8a6a3c";
      ctx.beginPath();
      ctx.ellipse(0, 0, U, U * 1.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5d4527";                 // the cap
      ctx.beginPath();
      ctx.ellipse(0, -U * 0.95, U * 0.85, U * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // A kibble in the mouth of whatever is making off with it.
  function drawCarry(c, U, at) {
    if (c.carry < 0) return;
    ctx.fillStyle = "#c8892f";
    ctx.beginPath();
    ctx.ellipse(at[0], at[1], U * 0.16, U * 0.12, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCritter(c) {
    if (c.kind === "bird") return drawBird(c);
    var x = c.x * PX, y = LEVEL.ground - c.y * PX, f = c.dir;
    var U = PX * 0.5;                       // it stands about half his height
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(f, 1);
    // No contact shadow mid-hop: a bolting squirrel is off the ground, and
    // an ellipse under its feet would go with it.
    if (!c.flying) {
      ctx.fillStyle = "rgba(20, 26, 20, .25)";
      ctx.beginPath();
      ctx.ellipse(0, 1, U * 0.5, U * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();
    }
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
    drawCarry(c, U, [U * 0.42, -U * 0.66]);
    ctx.restore();
  }

  // The one thing you are aiming at: where he will come down. She has to be
  // standing on it. There is nothing else on screen to track.
  function drawTarget() {
    if (bonus.phase !== "flight") return;
    var lw = window.Bonus.landing(bonus);
    var lx = bx2px(lw);
    var gy = by2py(bonus.dog.y);
    var under = Math.abs(lw - bonus.dog.x) <= bonus.cfg.catchRadius;
    // Green when she has it, red when the other dog is nearer to it than she
    // is: the ring is the one thing you are watching, so it is where the
    // threat has to be said.
    var rv = bonus.rival;
    var theirs = rv.active && rv.flinch <= 0 &&
                 Math.abs(rv.x - lw) < Math.abs(bonus.dog.x - lw);
    var col = under ? "rgba(150, 240, 140, .95)"
                    : (theirs ? "rgba(228, 96, 86, .95)" : "rgba(255, 250, 210, .8)");

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

  // The other dog in the fetch round: her model, tinted, running for the same
  // spot she is. Same sheet the level's thieves use.
  function drawRival() {
    if (!bonus || !bonus.rival.active || !rivalAnim || !thiefSheet || !GDATA) return;
    var r = bonus.rival;
    var x = bx2px(r.x), y = by2py(bonus.dog.y);
    var b = rivalAnim.box(), ga = GDATA.meta.anchor;
    ctx.fillStyle = "rgba(20, 30, 20, .24)";
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 48, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(r.dir > 0 ? 1 : -1, 1);        // baked facing right
    ctx.drawImage(thiefSheet, b.x, b.y, b.w, b.h, -ga.x, -ga.y, b.w, b.h);
    ctx.restore();
  }

  // Said once, at the start, because nothing else explains the round.
  function drawPrompt(w, h) {
    // The first is how the round works; the second is said the moment the
    // other dog first turns up, because that is a new rule mid-round.
    var first = bonus.throwIndex === 0;
    var meeting = bonus.throwIndex === bonus.cfg.rivalFrom;
    if ((!first && !meeting) || bonus.phase !== "wind") return;
    var a = Math.min(1, bonus.t / 0.25);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = "center";
    ctx.font = "bold " + Math.round(h / 22) + "px system-ui, sans-serif";
    ctx.fillStyle = "rgba(20, 26, 32, " + (0.55 * a).toFixed(2) + ")";
    ctx.fillRect(0, h * 0.13, w, h * 0.155);
    ctx.fillStyle = "rgba(255, 250, 225, " + a.toFixed(2) + ")";
    ctx.fillText(first ? "Fetch! \u25C0 \u25B6 run Ginger"
                       : "Here comes the other dog", w / 2, h * 0.19);
    ctx.font = Math.round(h / 30) + "px system-ui, sans-serif";
    ctx.fillStyle = "rgba(210, 230, 245, " + a.toFixed(2) + ")";
    var line = first ? "catch him in the ring before he lands"
                     : "beat it to the ring, or crow to stop it";
    if (first && bonus.fromKibble) {
      line = bonus.brought + " kibble for her \u2014 " + bonus.fromKibble +
             " extra throw" + (bonus.fromKibble > 1 ? "s" : "");
    }
    ctx.fillText(line, w / 2, h * 0.245);
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

    // Scenery behind the platforms, so a lamp stands against the wall and a
    // tree is behind the bench rather than pasted over it.
    for (var d1 = 0; d1 < LEVEL.props.length; d1++) {
      if (!LEVEL.props[d1].front) drawProp(LEVEL.props[d1]);
    }

    for (var i = 0; i < LEVEL.platforms.length; i++) drawPlatform(LEVEL.platforms[i]);

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
        if (distraction && distraction.lost(pi2)) continue;
        var pk2 = LEVEL.pickups[pi2];
        var bob = Math.sin(Date.now() / 260 + pi2) * 3;
        // A kibble something has its eye on shakes, and wears a closing ring,
        // so the race is legible before you lose it rather than after.
        var eyed = distraction ? distraction.eyeing(pi2) : -1;
        if (eyed >= 0) {
          var shake = Math.sin(Date.now() / 45) * eyed * 2.4;
          ctx.strokeStyle = "rgba(224, 51, 58, .8)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pk2.x, pk2.y - 12, 13, -Math.PI / 2,
                  -Math.PI / 2 + Math.PI * 2 * eyed);
          ctx.stroke();
          pk2 = { x: pk2.x + shake, y: pk2.y };
        }
        ctx.fillStyle = "#c8892f";
        ctx.beginPath();
        ctx.ellipse(pk2.x, pk2.y - 12 + bob, 7, 5, 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      drawTarget();
    }

    for (var thi = 0; thi < thieves.length; thi++) drawThief(thieves[thi]);
    drawRival();

    if (distraction) {
      for (var ci = 0; ci < distraction.critters.length; ci++) {
        var cr = distraction.critters[ci];
        if (cr.here) drawCritter(cr);
      }
      drawFalling();
    }

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
                       : ((distraction && distraction.watcher)
                            ? (distraction.watcher.home.x >= WORLD.goal.x ? 1 : -1)
                            : -1);
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
    drawWear();
    ctx.restore();
    // Scenery marked `front`, then any theme layer marked the same: things
    // he passes behind. One flat backdrop cannot give a scene depth; a
    // couple of things nearer than he is can.
    for (var d2 = 0; d2 < LEVEL.props.length; d2++) {
      if (LEVEL.props[d2].front) drawProp(LEVEL.props[d2]);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawFront(canvas.width, canvas.height);
    // The dip that the swap happens behind.
    if (recover) {
      ctx.fillStyle = "rgba(12, 16, 22, " + (0.96 * recoverDim(recover)).toFixed(3) + ")";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.setTransform(SCALE, 0, 0, SCALE, -camX * SCALE, -camY * SCALE);

    if (bonus) drawPops();
    if (bonus) { ctx.setTransform(1, 0, 0, 1, 0, 0); drawPrompt(w, h); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    var label = document.getElementById("state");
    if (label) label.textContent = player.anim.name;
    var title = document.getElementById("levelName");
    if (title) {
      if (bonus) {
        var total = bonus.total();
        var head = bonus.phase === "done"
          ? "fetch! \u2014 final"
          : "fetch! throw " + Math.min(bonus.throwIndex + 1, total) + "/" + total;
        title.textContent = head + "  " + bonus.caught + "/" + total + " caught" +
          (bonus.lost ? "  \u2014 " + bonus.lost + " to the other dog" : "") +
          (bonus.streak > 1 ? "  \u2014 " + bonus.streak + " in a row!" : "");
      } else {
        var got = Object.keys(collected).length;
        var note = "";
        if (player.reached) note = "  \u2014 reunited!";
        else if (distraction && distraction.watching &&
                 Math.abs(LEVEL.goal.x - player.x) / PX < 6) {
          note = distraction.watcher.kind === "bird"
            ? "  \u2014 she's watching a bird. Squeak, or crow to put it up!"
            : "  \u2014 she's watching a squirrel. Squeak!";
        } else if (distraction) {
          var thief = distraction.pressing();
          if (thief) {
            note = thief.kind === "bird"
              ? "  \u2014 a bird is after your kibble. Crow at it!"
              : "  \u2014 a squirrel is after your kibble. Run it off!";
          } else if (distraction.stolen.length) {
            // Otherwise the count simply refuses to reach the total and you
            // are left wondering which kibble you walked past.
            note = "  \u2014 " + distraction.stolen.length +
                   " lost to the wildlife";
          }
        }
        // Nothing said that the kibble patches him up, so the rule could only
        // be learnt by accident. Said once, while he is carrying damage and
        // there is still kibble to find, and never again after the first mend
        // -- by then you have seen it happen.
        if (!note && wear && wear.mended === 0 &&
            (wear.wear > 0 || wear.lives < wear.cfg.lives) &&
            got < LEVEL.pickups.length) {
          note = "  \u2014 he's fraying. Every " + wear.cfg.perMend +
                 "th kibble patches him up";
        }
        // Lives as stitched hearts is a different game's furniture. He is a
        // toy: what he has left is seams.
        var seams = "";
        if (wear) {
          for (var sv = 0; sv < wear.cfg.lives; sv++) {
            seams += sv < wear.lives ? "\u2b1b" : "\u2b1c";
          }
          seams = "  " + seams;
        }
        title.textContent = LEVEL.name + "  " + got + "/" +
          LEVEL.pickups.length + seams + note;
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
    // Whether he is stood on a machine rather than on the floor, so a test
    // can tell a ride from a lucky landing beside one.
    get riding() { return !!player.riding; },
    // Wear and seams, and whether he is mid-recovery: a fall is a beat now,
    // not a frame, and a test that samples during it sees him underwater.
    get wear() { return wear; },
    get recovering() { return !!recover; },
    // World units, for tests -- the player is kept in pixels internally.
    get where() {
      return { x: player.x / PX, y: (LEVEL.ground - player.y) / PX };
    },
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
      "assets/sprites/" + GDATA.image;
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
    "assets/sprites/" + DATA.image;
})();
