/* fx.js - game feel: count-up numbers, stars, confetti, newspaper headlines.
 * Everything here is decoration on top of numbers computed elsewhere.
 * Respects the "reduce motion" setting of the player's device. */
(function (M) {
  'use strict';
  var reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Animate a number from 0 up to `to` inside element `el`.
  function countUp(el, to, ms, format) {
    format = format || function (v) { return M.charts.fmt(Math.round(v)); };
    if (reduced || !el) { if (el) el.textContent = format(to); return; }
    var t0 = performance.now();
    function frame(now) {
      var k = Math.min(1, (now - t0) / ms), ease = 1 - Math.pow(1 - k, 3);
      el.textContent = format(to * ease);
      if (k < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // 0-3 stars from a level score out of 100.
  function starsFor(score) { return score >= 75 ? 3 : score >= 50 ? 2 : score >= 25 ? 1 : 0; }
  function starsHTML(n) {
    var s = '<span class="stars" role="img" aria-label="' + n + ' of 3 stars">';
    for (var i = 0; i < 3; i++) s += '<span class="star' + (i < n ? ' on' : '') + '" style="animation-delay:' + (0.25 + i * 0.25) + 's">★</span>';
    return s + '</span>';
  }

  // A small burst of confetti for finding the real cause.
  function confetti() {
    if (reduced || typeof document === 'undefined') return;
    var cv = document.createElement('canvas');
    cv.className = 'confetti';
    var dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    document.body.appendChild(cv);
    var ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    var css = getComputedStyle(document.documentElement);
    var cols = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s7'].map(function (v) { return css.getPropertyValue(v).trim() || '#2a78d6'; });
    var parts = [];
    for (var i = 0; i < 140; i++) {
      parts.push({ x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.35,
        vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 11 - 3, r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3, w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, c: cols[i % cols.length] });
    }
    var t0 = performance.now();
    function frame(now) {
      var age = now - t0;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 1800) / 700);
      parts.forEach(function (p) {
        p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (age < 2500) requestAnimationFrame(frame); else cv.remove();
    }
    requestAnimationFrame(frame);
  }

  // Newspaper front page (headline text is generated from the simulation).
  function newspaper(headline, sub, edition) {
    return '<figure class="paper"><div class="paper-mast">The Navapuram Times</div>' +
      '<div class="paper-edition">' + (edition || '') + '</div>' +
      '<div class="paper-head">' + headline + '</div>' +
      (sub ? '<div class="paper-sub">' + sub + '</div>' : '') + '</figure>';
  }

  M.fx = { reduced: reduced, countUp: countUp, starsFor: starsFor, starsHTML: starsHTML, confetti: confetti, newspaper: newspaper };
})(globalThis.Mayor = globalThis.Mayor || {});
