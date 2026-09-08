/**
 * /catalog — the disturbance effect.
 *
 * Progressive enhancement, and strictly that: the bed is complete, readable and
 * navigable from the server-rendered markup alone. This file only makes the
 * grains move away from the pointer and settle back.
 *
 * Three reasons it may deliberately do nothing: the reader asked for reduced
 * motion, the device has no fine pointer (there is no hover to respond to, and
 * pretending otherwise on touch is worse than stillness), or the bed is absent
 * because the data was briefly unavailable.
 *
 * WHY THE PHYSICS LOOK LIKE THIS
 *
 * Wet sediment is overdamped — it does not oscillate, so there is no spring and
 * no overshoot; a bounce reads as rubber. It also yields faster than it
 * recovers, hence two time constants rather than one: a short attack so a grain
 * is out of the way the moment the pointer arrives, and a longer release so the
 * wake stays legible behind it.
 *
 * Both are TIMES, not per-frame fractions. An earlier draft decayed a fixed
 * percentage each frame, which settled twice as fast on a 120 Hz display as on
 * a 60 Hz one — the same setting felt different on different machines.
 *
 * Displacement scales inversely with type size, so the handful of options that
 * reach thousands of games barely stir while the single-game tail ripples. That
 * is both what sediment does and what stops the coarse layer looking like
 * animated clip-art.
 */
(function () {
  'use strict';

  var bed = document.getElementById('cat-bed');
  if (!bed) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (reduced.matches || !fine.matches) return;

  var RADIUS = 105;        // px — how far the disturbance reaches
  var PUSH = 10;           // px — displacement at the centre, before size scaling
  var TAU_ATTACK = 0.055;  // s  — yield
  var TAU_RELEASE = 0.30;  // s  — settle; half-life ~0.21s
  var CELL = 120;          // px — spatial bucket, so only nearby grains are touched

  var grains = [];
  var cells = new Map();
  var px = -9999, py = -9999, running = false, last = 0;

  var seeds = bed.querySelectorAll('.cat-seed');
  if (!seeds.length) return;

  for (var i = 0; i < seeds.length; i++) {
    var el = seeds[i];
    var size = parseFloat(window.getComputedStyle(el).fontSize) || 12;
    // 13px is the middle tier, so it moves at 1x; capped at 1.25 to keep the
    // finest sand near the calibrated push rather than well past it.
    grains.push({ el: el, amp: Math.min(1.25, 13 / size), dx: 0, dy: 0, hx: 0, hy: 0 });
  }

  function measure() {
    cells = new Map();
    var box = bed.getBoundingClientRect();
    for (var i = 0; i < grains.length; i++) {
      var g = grains[i];
      var r = g.el.getBoundingClientRect();
      g.hx = r.left - box.left + r.width / 2;
      g.hy = r.top - box.top + r.height / 2;
      var key = ((g.hx / CELL) | 0) + ':' + ((g.hy / CELL) | 0);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(g);
    }
  }

  function tick(now) {
    if (!last) last = now;
    // Clamped so a backgrounded tab does not teleport every grain home.
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    var kIn = 1 - Math.exp(-dt / TAU_ATTACK);
    var kOut = 1 - Math.exp(-dt / TAU_RELEASE);

    var near = [];
    if (px > -9000) {
      var reach = Math.ceil(RADIUS / CELL);
      var cx = (px / CELL) | 0, cy = (py / CELL) | 0;
      for (var i = -reach; i <= reach; i++) {
        for (var j = -reach; j <= reach; j++) {
          var bucket = cells.get((cx + i) + ':' + (cy + j));
          if (bucket) near = near.concat(bucket);
        }
      }
    }

    for (var n = 0; n < near.length; n++) {
      var g = near[n];
      var vx = g.hx - px, vy = g.hy - py;
      var d = Math.sqrt(vx * vx + vy * vy) || 0.001;
      if (d < RADIUS) {
        // Squared falloff: no hard edge where grains snap at the boundary.
        var f = 1 - d / RADIUS; f = f * f;
        g.dx += ((vx / d) * f * PUSH * g.amp - g.dx) * kIn;
        g.dy += ((vy / d) * f * PUSH * g.amp - g.dy) * kIn;
        g.settling = false;
      } else {
        g.settling = true;
      }
    }

    var moving = false;
    for (var k = 0; k < grains.length; k++) {
      var gr = grains[k];
      if (gr.settling !== false) {
        gr.dx -= gr.dx * kOut;
        gr.dy -= gr.dy * kOut;
      }
      gr.settling = true;
      if (gr.dx > 0.06 || gr.dx < -0.06 || gr.dy > 0.06 || gr.dy < -0.06) {
        gr.el.style.transform = 'translate(' + gr.dx.toFixed(2) + 'px,' + gr.dy.toFixed(2) + 'px)';
        moving = true;
      } else if (gr.dx || gr.dy) {
        gr.dx = 0; gr.dy = 0;
        gr.el.style.transform = '';
      }
    }

    if (moving || px > -9000) requestAnimationFrame(tick);
    else { running = false; last = 0; }
  }

  function wake() {
    if (running) return;
    running = true; last = 0;
    requestAnimationFrame(tick);
  }

  bed.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    var box = bed.getBoundingClientRect();
    px = e.clientX - box.left;
    py = e.clientY - box.top;
    wake();
  }, { passive: true });

  bed.addEventListener('pointerleave', function () {
    px = -9999; py = -9999; wake();
  }, { passive: true });

  // Positions are read from layout, so anything that reflows invalidates them:
  // a resize, a font swapping in, or the theme toggle changing metrics.
  measure();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  if (window.ResizeObserver) new ResizeObserver(measure).observe(bed);
  else window.addEventListener('resize', measure);

  // Honour a change of heart without a reload.
  var onReduced = function () { if (reduced.matches) { px = -9999; for (var i = 0; i < grains.length; i++) { grains[i].dx = grains[i].dy = 0; grains[i].el.style.transform = ''; } } };
  if (reduced.addEventListener) reduced.addEventListener('change', onReduced);
})();
