/* On-screen controls for touch devices.
 *
 * Rather than giving each demo a second input path, the buttons dispatch
 * synthetic keyboard events, so the existing `keydown` / `keyup` handlers
 * pick them up unchanged. Each button owns its own pointer, so holding
 * "right" and tapping "jump" at the same time works the way it should.
 *
 *   TouchControls.mount({ actions: [{ code: 'KeyX', label: 'peck' }] });
 *
 * It mounts nothing on a device with a fine pointer unless you force it
 * with ?touch=1, which is also how the layout gets tested on a desktop.
 */
(function (global) {
  'use strict';

  // `pointer: coarse` means the *primary* pointer is a finger, which is true
  // on phones and tablets but false on a laptop that merely has a touchscreen
  // -- those keep their keyboard and don't need buttons taking up the screen.
  var hasMM = !!global.matchMedia;
  var COARSE = hasMM && global.matchMedia('(pointer: coarse)').matches;
  var FORCED = /[?&]touch=1\b/.test(global.location.search);
  var isTouch = FORCED || COARSE || (!hasMM && 'ontouchstart' in global);

  var CSS = [
    '.tc { position: fixed; inset: auto 0 0 0; z-index: 40;',
    '      display: flex; flex-direction: column; gap: 10px;',
    '      padding: 0 12px calc(12px + env(safe-area-inset-bottom, 0px));',
    '      pointer-events: none;',
    '      -webkit-user-select: none; user-select: none;',
    '      -webkit-tap-highlight-color: transparent; }',
    /* Inline mode flows the pad under the canvas instead of floating it over
       the viewport -- right when the game is one section of a longer page. */
    '.tc.tc-inline { position: static; inset: auto; padding: 0; }',
    /* Actions sit on their own row so they never crowd the d-pad on a
       narrow screen; the pad and jump take the thumb corners below. */
    '.tc-actions { display: flex; gap: 8px; justify-content: flex-end;',
    '              flex-wrap: wrap; pointer-events: none; }',
    '.tc-main { display: flex; justify-content: space-between;',
    '           align-items: flex-end; gap: 12px; pointer-events: none; }',
    '.tc-row { display: flex; gap: 10px; pointer-events: none; }',
    '.tc b { pointer-events: auto; touch-action: none; display: grid;',
    '        place-items: center; border-radius: 999px; font-weight: 600;',
    '        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;',
    '        color: #f4f6f8; background: rgba(24,28,34,.42);',
    '        border: 1px solid rgba(244,246,248,.28);',
    '        backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);',
    '        transition: background .06s linear, transform .06s linear; }',
    '.tc b.on { background: rgba(207,32,39,.78); transform: scale(.94); }',
    '.tc .dir { width: 62px; height: 62px; font-size: 22px; }',
    '.tc .jump { width: 84px; height: 84px; font-size: 13px; letter-spacing: .1em; }',
    '.tc .act { width: 52px; height: 52px; font-size: 10px; letter-spacing: .02em; }',
    '@media (max-width: 420px) {',
    '  .tc .dir { width: 54px; height: 54px; font-size: 19px; }',
    '  .tc .jump { width: 72px; height: 72px; font-size: 12px; }',
    '  .tc .act { width: 46px; height: 46px; font-size: 9px; }',
    '}',
    '@media (max-height: 420px) {',
    '  .tc .dir { width: 52px; height: 52px; font-size: 18px; }',
    '  .tc .jump { width: 66px; height: 66px; font-size: 11px; }',
    '  .tc .act { width: 44px; height: 44px; font-size: 9px; }',
    '}',
    '.tc-hide { display: none !important; }'
  ].join('\n');

  function key(type, code) {
    global.dispatchEvent(new KeyboardEvent(type, {
      code: code, key: code, bubbles: true, cancelable: true
    }));
  }

  function button(cls, label, code, held) {
    var el = document.createElement('b');
    el.className = cls;
    el.textContent = label;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', label);

    // Which finger is on this button, so a different finger lifting somewhere
    // else cannot release it. Without this the window-level fallback below
    // released *every* button on any pointerup: holding a direction and
    // tapping jump dropped the direction, which is the whole point of having
    // two thumbs.
    var pid = null;

    function press(e) {
      if (held[code]) return;
      held[code] = true;
      pid = e.pointerId;
      el.classList.add('on');
      key('keydown', code);
      e.preventDefault();
    }
    function release(e) {
      if (!held[code]) return;
      // Only the finger that pressed this button may release it. Events with
      // no pointer at all (blur) are a real loss of input and always do.
      if (e && e.pointerId !== undefined && pid !== null && e.pointerId !== pid) return;
      held[code] = false;
      pid = null;
      el.classList.remove('on');
      key('keyup', code);
      if (e && e.cancelable) e.preventDefault();
    }

    el.addEventListener('pointerdown', function (e) {
      // Capture so a thumb that slides off the button still releases it.
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* older Safari */ }
      press(e);
    });
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
    // Belt and braces: this button's own pointer ending anywhere clears it.
    global.addEventListener('pointerup', release);
    global.addEventListener('pointercancel', release);
    global.addEventListener('blur', function () { release(null); });
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    return el;
  }

  function mount(opts) {
    opts = opts || {};
    if (!isTouch) return null;
    if (document.querySelector('.tc')) return document.querySelector('.tc');
    var host = opts.container || document.body;

    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var held = {};
    var root = document.createElement('div');
    root.className = 'tc' + (opts.inline ? ' tc-inline' : '');

    var actions = opts.actions || [];
    if (actions.length) {
      var actRow = document.createElement('div');
      actRow.className = 'tc-actions';
      actions.forEach(function (a) {
        actRow.appendChild(button('act', a.label, a.code, held));
      });
      root.appendChild(actRow);
    }

    var main = document.createElement('div');
    main.className = 'tc-main';
    var dirRow = document.createElement('div');
    dirRow.className = 'tc-row';
    dirRow.appendChild(button('dir', '◀', opts.left || 'ArrowLeft', held));
    dirRow.appendChild(button('dir', '▼', opts.down || 'ArrowDown', held));
    dirRow.appendChild(button('dir', '▶', opts.right || 'ArrowRight', held));
    main.appendChild(dirRow);
    main.appendChild(button('jump', opts.jumpLabel || 'JUMP',
                            opts.jump || 'Space', held));
    root.appendChild(main);
    host.appendChild(root);

    // Double-tap zoom would otherwise fire between rapid button presses.
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    if (!opts.inline) document.documentElement.style.overscrollBehavior = 'none';

    return root;
  }

  global.TouchControls = { isTouch: isTouch, mount: mount };
})(window);
