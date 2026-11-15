/* town.js - the "living town": a cartoon top-down Navapuram drawn in SVG.
 *
 * Every moving thing is driven by the simulated data for the shown week:
 *   floating icons over a ward (mosquitoes, patients, crashes...) = that ward's outcome
 *   strip icons (carts, clinics, speed breakers...)                 = the candidate measures
 *   rain streaks and sky = rainfall; heat haze = temperature (when the level has them)
 * Each icon's scale is printed in the legend ("1 icon ~ N cases"). Houses, trees and the canal
 * are decoration, placed with their own random stream, never touching the simulation. */
(function (M) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var COLS = 5, BW = 160, BH = 105, G = 14, X0 = 20, Y0 = 20, RIVER = 46;
  var W = X0 * 2 + COLS * BW + (COLS - 1) * G;          // 896
  var H = Y0 * 2 + 4 * BH + 3 * G + RIVER;              // 548
  var CAP = 3, OUT_CAP = 8;

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) { if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]); }
    if (parent) parent.appendChild(n);
    return n;
  }
  function blockPos(i) {
    var c = i % COLS, r = Math.floor(i / COLS);
    return { x: X0 + c * (BW + G), y: Y0 + r * (BH + G) + (r >= 2 ? RIVER : 0) };
  }

  // ---------------------------------------------------------------- strip icons: drawn with bottom-left at (x, y), ~15 wide
  var ICON = {
    house: function (g, x, y, rng) {
      var roofs = ['#c85a3a', '#b5653f', '#8a5a44', '#d08a3a', '#a04848'];
      var w = 22 + rng.int(0, 6), h = 14 + rng.int(0, 5);
      el('rect', { x: x, y: y - h, width: w, height: h, class: 'house-wall' }, g);
      el('polygon', { points: (x - 3) + ',' + (y - h) + ' ' + (x + w / 2) + ',' + (y - h - 10) + ' ' + (x + w + 3) + ',' + (y - h), fill: rng.pick(roofs) }, g);
      el('rect', { x: x + w / 2 - 3, y: y - 7, width: 6, height: 7, class: 'house-door' }, g);
      if (w > 24) el('rect', { x: x + 3, y: y - h + 4, width: 5, height: 4, class: 'house-win' }, g);
    },
    tree: function (g, x, y, rng) {
      el('rect', { x: x - 1.5, y: y - 8, width: 3, height: 8, class: 'tree-trunk' }, g);
      el('circle', { cx: x, cy: y - 13, r: 7 + rng.int(0, 3), class: 'tree-top' }, g);
    },
    cart: function (g, x, y) {
      el('path', { d: 'M' + (x - 1) + ',' + (y - 9) + ' a8,6 0 0,1 16,0 z', fill: '#e87ba4' }, g);
      el('line', { x1: x + 7, y1: y - 9, x2: x + 7, y2: y - 4, stroke: '#555', 'stroke-width': 1 }, g);
      el('rect', { x: x, y: y - 5, width: 14, height: 6, rx: 1, fill: '#fdf6e3', stroke: '#8a6d5a', 'stroke-width': 0.8 }, g);
      el('circle', { cx: x + 3, cy: y + 2, r: 1.8, fill: '#333' }, g);
      el('circle', { cx: x + 11, cy: y + 2, r: 1.8, fill: '#333' }, g);
    },
    bottle: function (g, x, y) {
      el('rect', { x: x + 4, y: y - 12, width: 6, height: 13, rx: 2, fill: '#8a3a24' }, g);
      el('rect', { x: x + 5.5, y: y - 15, width: 3, height: 4, fill: '#8a3a24' }, g);
      el('rect', { x: x + 4, y: y - 8, width: 6, height: 4, fill: '#eb6834' }, g);
    },
    puddle: function (g, x, y) {
      el('ellipse', { cx: x + 7, cy: y - 1, rx: 8, ry: 3.6, fill: '#5598e7', opacity: 0.85 }, g);
      el('ellipse', { cx: x + 4, cy: y - 2, rx: 2.5, ry: 0.9, fill: '#cde2fb', opacity: 0.9 }, g);
    },
    tank: function (g, x, y) {
      el('rect', { x: x + 1, y: y - 10, width: 12, height: 11, rx: 1, fill: '#7f93a8' }, g);
      el('ellipse', { cx: x + 7, cy: y - 10, rx: 6, ry: 2.2, fill: '#3987e5', stroke: '#5c6e80', 'stroke-width': 0.8 }, g);
    },
    tyre: function (g, x, y) {
      el('circle', { cx: x + 7, cy: y - 4, r: 5.5, fill: 'none', stroke: '#2b2b2b', 'stroke-width': 3 }, g);
      el('circle', { cx: x + 7, cy: y - 4, r: 2.2, fill: '#5598e7' }, g);
    },
    clinic: function (g, x, y) {
      el('rect', { x: x, y: y - 12, width: 15, height: 13, rx: 1.5, fill: '#ffffff', stroke: '#b9c3cc', 'stroke-width': 0.8 }, g);
      el('rect', { x: x + 6, y: y - 10, width: 3, height: 9, fill: '#d03b3b' }, g);
      el('rect', { x: x + 3, y: y - 7, width: 9, height: 3, fill: '#d03b3b' }, g);
    },
    police: function (g, x, y) {
      el('rect', { x: x, y: y - 10, width: 15, height: 11, fill: '#2a5aa8' }, g);
      el('polygon', { points: (x - 1) + ',' + (y - 10) + ' ' + (x + 7.5) + ',' + (y - 15) + ' ' + (x + 16) + ',' + (y - 10), fill: '#1c3f78' }, g);
      el('circle', { cx: x + 7.5, cy: y - 5, r: 2.6, fill: '#eda100' }, g);
    },
    pill: function (g, x, y) {
      el('rect', { x: x + 3, y: y - 11, width: 9, height: 12, rx: 2, fill: '#ffffff', stroke: '#9aa5b0', 'stroke-width': 0.8 }, g);
      el('rect', { x: x + 3, y: y - 13, width: 9, height: 3, rx: 1, fill: '#1baf7a' }, g);
      el('rect', { x: x + 4.5, y: y - 7, width: 6, height: 3, fill: '#e87ba4' }, g);
    },
    lock: function (g, x, y) {
      el('path', { d: 'M' + (x + 4) + ',' + (y - 7) + ' v-3 a3.5,3.5 0 0,1 7,0 v3', fill: 'none', stroke: '#6b6a66', 'stroke-width': 1.8 }, g);
      el('rect', { x: x + 2, y: y - 7, width: 11, height: 8, rx: 1.5, fill: '#eda100' }, g);
    },
    bump: function (g, x, y) {
      el('path', { d: 'M' + x + ',' + y + ' q7.5,-9 15,0 z', fill: '#eda100', stroke: '#2b2b2b', 'stroke-width': 0.8 }, g);
      el('line', { x1: x + 5, y1: y - 0.5, x2: x + 6.5, y2: y - 5, stroke: '#2b2b2b', 'stroke-width': 1.6 }, g);
      el('line', { x1: x + 9, y1: y - 0.5, x2: x + 10.5, y2: y - 5, stroke: '#2b2b2b', 'stroke-width': 1.6 }, g);
    },
    lamp: function (g, x, y) {
      el('rect', { x: x + 6, y: y - 14, width: 2, height: 15, fill: '#6b6a66' }, g);
      el('path', { d: 'M' + (x + 7) + ',' + (y - 14) + ' h5', stroke: '#6b6a66', 'stroke-width': 2 }, g);
      el('circle', { cx: x + 12, cy: y - 12.5, r: 2.6, fill: '#fab219' }, g);
    },
    bus: function (g, x, y) {
      el('rect', { x: x - 1, y: y - 10, width: 17, height: 10, rx: 2, fill: '#eda100' }, g);
      el('rect', { x: x + 1, y: y - 8, width: 4, height: 3, fill: '#cde2fb' }, g);
      el('rect', { x: x + 6.5, y: y - 8, width: 4, height: 3, fill: '#cde2fb' }, g);
      el('circle', { cx: x + 3, cy: y + 0.5, r: 1.8, fill: '#222' }, g);
      el('circle', { cx: x + 12, cy: y + 0.5, r: 1.8, fill: '#222' }, g);
    },
    meal: function (g, x, y) {
      el('ellipse', { cx: x + 7.5, cy: y - 2, rx: 8, ry: 3, fill: '#ffffff', stroke: '#9aa5b0', 'stroke-width': 0.8 }, g);
      el('circle', { cx: x + 5, cy: y - 4, r: 2.4, fill: '#eda100' }, g);
      el('circle', { cx: x + 10, cy: y - 4, r: 2.2, fill: '#1baf7a' }, g);
    },
    shirt: function (g, x, y) {
      el('path', { d: 'M' + (x + 4) + ',' + (y - 12) + ' l-4,3 l2,3 l2,-1 v8 h8 v-8 l2,1 l2,-3 l-4,-3 q-3.5,3 -8,0 z', fill: '#3987e5', stroke: '#1c5cab', 'stroke-width': 0.6 }, g);
    },
    truck: function (g) {
      el('rect', { x: -14, y: -6, width: 18, height: 10, rx: 1.5, fill: '#eda100' }, g);
      el('rect', { x: 4, y: -3, width: 8, height: 7, rx: 1.5, fill: '#c98500' }, g);
      el('rect', { x: 6, y: -1.5, width: 4, height: 3, fill: '#cde2fb' }, g);
      el('circle', { cx: -9, cy: 5, r: 2.5, fill: '#222' }, g);
      el('circle', { cx: 7, cy: 5, r: 2.5, fill: '#222' }, g);
    }
  };
  // ---------------------------------------------------------------- floating outcome icons: centred on (0, 0)
  var OUT = {
    mosquito: function (g) {
      el('ellipse', { cx: -2.5, cy: -2, rx: 3, ry: 1.6, class: 'mosq-wing', transform: 'rotate(-25 -2.5 -2)' }, g);
      el('ellipse', { cx: 2.5, cy: -2, rx: 3, ry: 1.6, class: 'mosq-wing', transform: 'rotate(25 2.5 -2)' }, g);
      el('ellipse', { cx: 0, cy: 0, rx: 1.4, ry: 3.4, class: 'mosq-body' }, g);
      el('line', { x1: 0, y1: -3.4, x2: 0, y2: -6, class: 'mosq-leg' }, g);
    },
    patient: function (g) {
      el('rect', { x: -2.6, y: 0, width: 5.2, height: 5, rx: 1.5, fill: '#e66767' }, g);
      el('circle', { cx: 0, cy: -2.6, r: 2.8, fill: '#c68b59', stroke: '#ffffff', 'stroke-width': 0.6 }, g);
      el('circle', { cx: -1.2, cy: -2, r: 0.8, fill: '#ff6b6b' }, g);
      el('rect', { x: 2.4, y: -5.6, width: 0.9, height: 4, fill: '#d03b3b' }, g);
    },
    alarm: function (g) {
      el('path', { d: 'M-3.5,1.5 v-2.5 a3.5,3.5 0 0,1 7,0 v2.5 z', fill: '#d03b3b', stroke: '#ffffff', 'stroke-width': 0.6 }, g);
      el('rect', { x: -4.5, y: 1.5, width: 9, height: 1.8, fill: '#3a3935' }, g);
      el('line', { x1: -5.5, y1: -4.5, x2: -4, y2: -3, stroke: '#fab219', 'stroke-width': 0.9 }, g);
      el('line', { x1: 5.5, y1: -4.5, x2: 4, y2: -3, stroke: '#fab219', 'stroke-width': 0.9 }, g);
    },
    crash: function (g) {
      el('polygon', { points: '0,-6 1.6,-2 6,-3 2.8,0.4 5,4.6 0.8,2.6 -2.6,5.6 -2.2,1.4 -6,-0.6 -2,-2.2', fill: '#eb6834', stroke: '#fab219', 'stroke-width': 0.8 }, g);
    },
    child: function (g) {
      el('rect', { x: -2.2, y: -0.5, width: 4.4, height: 4.5, rx: 1.2, fill: '#3987e5' }, g);
      el('rect', { x: 1.8, y: -0.2, width: 2.4, height: 3.6, rx: 0.8, fill: '#eb6834' }, g);
      el('circle', { cx: 0, cy: -3, r: 2.4, fill: '#c68b59', stroke: '#ffffff', 'stroke-width': 0.6 }, g);
    }
  };
  var OUT_EMOJI = { mosquito: '🦟', patient: '🤒', alarm: '🚨', crash: '💥', child: '🎒' };
  var ANIM_CLASS = { buzz: 'mosq', bob: 'bob', flash: 'flash' };

  // Small standalone SVG of an icon, for legends.
  function iconSVG(kind) {
    var svg = document.createElementNS(NS, 'svg');
    var isOut = !!OUT[kind];
    svg.setAttribute('viewBox', isOut ? '-6.5 -7 13 13' : '-2 -15 20 20');
    svg.setAttribute('class', 'legend-icon');
    var g = el('g', {}, svg);
    if (isOut) OUT[kind](g); else ICON[kind](g, 0, 0);
    return svg.outerHTML;
  }

  /* Build a town.
   * spec: { wards, history, outcome: {key,label,legendUnit,icon,anim}, layers: [{key,icon,label,legendUnit,dp,cap,exact}],
   *         rain, temp (keys or null), compact, budget }
   * Returns { update(frame), setPolicy(kind), setMask(mask) }. */
  function create(container, spec) {
    var S = M.stats, C = M.scm.common, CH = M.charts;
    var art = new M.rng.Rng('town-art'); // decoration only
    var outIcon = spec.outcome.icon || 'mosquito', outAnim = ANIM_CLASS[spec.outcome.anim || 'buzz'];
    container.innerHTML = '';
    var hud = document.createElement('div');
    hud.className = 'town-hud';
    container.appendChild(hud);
    var wrap = document.createElement('div');
    wrap.className = 'town-wrap';
    container.appendChild(wrap);
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'town' + (spec.compact ? ' compact' : ''), role: 'img',
      'aria-label': 'Cartoon map of Navapuram. Floating icons show ' + spec.outcome.label.toLowerCase() + '; small icons show the other measures.' }, wrap);

    // Scales: how many units one icon stands for, fixed from last year's data.
    var hist = spec.history;
    var per = {};
    spec.layers.forEach(function (L) { per[L.key] = L.exact ? 1 : Math.max(1e-9, S.max(C.flatten(hist[L.key])) / (L.cap || CAP)); });
    var outPer = Math.max(1, Math.round(S.max(C.flatten(hist[spec.outcome.key])) / OUT_CAP));
    var maxTotal = S.max(C.weekTotals(hist[spec.outcome.key]));
    var rainMax = spec.rain ? (S.max(C.weekMeans(hist[spec.rain])) || 1) : 1;
    var tW = spec.temp ? C.weekMeans(hist[spec.temp]) : [0, 1], tMin = S.min(tW), tMax = S.max(tW);

    // ground, roads, canal, bridges
    el('rect', { x: 0, y: 0, width: W, height: H, class: 'road', rx: 14 }, svg);
    var riverY = Y0 + 2 * BH + G + 7;
    el('rect', { x: 0, y: riverY, width: W, height: RIVER, class: 'river' }, svg);
    var wave = '';
    for (var wx = 0; wx <= W; wx += 40) wave += (wx ? ' ' : 'M') + wx + ',' + (riverY + 23) + ' q10,-6 20,0 t20,0';
    el('path', { d: wave, class: 'river-wave' }, svg);
    for (var c = 0; c < COLS - 1; c++) {
      var bx = X0 + (c + 1) * (BW + G) - G - 2;
      el('rect', { x: bx, y: riverY - 3, width: G + 4, height: RIVER + 6, class: 'bridge' }, svg);
    }
    el('text', { x: W - 30, y: riverY + 30, 'text-anchor': 'end', class: 'river-label', text: 'Navapuram canal' }, svg);
    [Y0 + BH + G / 2, Y0 + 3 * BH + 2 * G + RIVER + G / 2].forEach(function (ry) {
      el('line', { x1: 0, y1: ry, x2: W, y2: ry, class: 'lane' }, svg);
    });

    var blocks = spec.wards.map(function (wd, i) {
      var p = blockPos(i), g = el('g', { class: 'block' }, svg);
      var ground = el('rect', { x: p.x, y: p.y, width: BW, height: BH, rx: 10, class: 'ground' }, g);
      var deco = el('g', {}, g);
      for (var s = 0; s < 5; s++) {
        var sx = p.x + 8 + s * 30, sy = p.y + 62;
        if (art.uniform() < 0.72) ICON.house(deco, sx, sy, art); else ICON.tree(deco, sx + 12, sy, art);
      }
      el('rect', { x: p.x + 4, y: p.y + 4, width: Math.min(BW - 8, 18 + wd.name.length * 5.6), height: 14, rx: 4, class: 'sign' }, g);
      el('text', { x: p.x + 9, y: p.y + 14.5, class: 'sign-text', text: (i + 1) + ' ' + wd.name }, g);
      var icons = el('g', {}, g);
      var badge = el('g', { class: 'policy-badge', style: 'display:none' }, g);
      var tag = el('g', { class: 'pilot-tag', style: 'display:none' }, g);
      var tagRect = el('rect', { x: p.x + BW - 26, y: p.y + 3, width: 22, height: 16, rx: 5 }, tag);
      var tagText = el('text', { x: p.x + BW - 15, y: p.y + 15, 'text-anchor': 'middle', text: '' }, tag);
      var outs = el('g', {}, g);
      var hit = el('rect', { x: p.x, y: p.y, width: BW, height: BH, rx: 10, fill: 'transparent' }, g);
      hit.addEventListener('mousemove', function (evt) { tip(i, evt); });
      hit.addEventListener('click', function (evt) { tip(i, evt); });
      hit.addEventListener('mouseleave', CH.hideTip);
      var spots = [];
      for (var m = 0; m < OUT_CAP; m++) spots.push({ x: p.x + 14 + art.uniform() * (BW - 28), y: p.y + 32 + art.uniform() * 42,
        d: (art.uniform() * -2).toFixed(2), s: (1.2 + art.uniform() * 1.2).toFixed(2) });
      return { p: p, g: g, ground: ground, icons: icons, outs: outs, badge: badge, tag: tag, tagRect: tagRect, tagText: tagText, spots: spots, n: -1 };
    });

    var sky = el('rect', { x: 0, y: 0, width: W, height: H, rx: 14, class: 'sky-tint', style: 'opacity:0' }, svg);
    var heat = el('rect', { x: 0, y: 0, width: W, height: H, rx: 14, class: 'heat-tint', style: 'opacity:0' }, svg);
    var rain = el('g', { class: 'rain', style: 'opacity:0' }, svg);
    for (var d = 0; d < 90; d++) {
      var dx = art.uniform() * (W + 60), dy = -art.uniform() * H;
      el('line', { x1: dx, y1: dy, x2: dx - 5, y2: dy + 13, class: 'drop', style: 'animation-delay:' + (-art.uniform() * 1.1).toFixed(2) + 's' }, rain);
    }
    var trucks = el('g', { class: 'trucks', style: 'display:none' }, svg);
    [[Y0 + BH + G / 2, 0], [Y0 + 3 * BH + 2 * G + RIVER + G / 2, 3]].forEach(function (rt, j) {
      for (var k = 0; k < 2; k++) {
        var tg = el('g', {}, trucks); ICON.truck(tg);
        el('animateMotion', { path: 'M-30,' + rt[0] + ' L' + (W + 30) + ',' + rt[0], dur: (9 + j * 2) + 's', begin: (-(k * 4.5 + rt[1])) + 's', repeatCount: 'indefinite' }, tg);
      }
    });

    var legend = document.createElement('div');
    legend.className = 'town-legend small';
    legend.innerHTML = '<span>' + iconSVG(outIcon) + ' 1 ≈ ' + outPer + ' ' + esc(spec.outcome.legendUnit) + '</span>' +
      spec.layers.map(function (L) {
        return '<span>' + iconSVG(L.icon) + ' 1 ' + (L.exact ? '=' : '≈') + ' ' + M.charts.fmt(per[L.key], L.dp) + ' ' + esc(L.legendUnit) + '</span>';
      }).join('') + (spec.rain ? '<span><span class="rain-key"></span> rain streaks = ' + esc(spec.rainLabel || 'rainfall') + '</span>' : '');
    if (!spec.compact) container.appendChild(legend);

    var current = null;
    function tip(i, evt) {
      if (!current) return;
      var html = '<b>Ward ' + (i + 1) + ': ' + esc(spec.wards[i].name) + '</b><div>' + esc(current.label) + '</div>' +
        '<div>' + esc(spec.outcome.label) + ': <b>' + M.charts.fmt(current.vars[spec.outcome.key][i], 0) + '</b></div>' +
        spec.layers.map(function (L) { return '<div>' + esc(L.label) + ': <b>' + M.charts.fmt(current.vars[L.key][i], L.dp) + '</b></div>'; }).join('');
      CH.showTip(html, evt.clientX, evt.clientY);
    }

    function update(frame) {
      current = frame;
      blocks.forEach(function (b, i) {
        while (b.icons.firstChild) b.icons.removeChild(b.icons.firstChild);
        var x = b.p.x + 8, y = b.p.y + BH - 10;
        spec.layers.forEach(function (L) {
          var n = Math.min(L.cap || CAP, Math.round(frame.vars[L.key][i] / per[L.key]));
          for (var k = 0; k < n; k++) { ICON[L.icon](b.icons, x, y); x += 17; }
        });
        var n = Math.min(OUT_CAP, Math.round(frame.vars[spec.outcome.key][i] / outPer));
        if (n !== b.n) {
          while (b.outs.firstChild) b.outs.removeChild(b.outs.firstChild);
          for (var m = 0; m < n; m++) {
            var sp = b.spots[m];
            var outer = el('g', { transform: 'translate(' + sp.x.toFixed(1) + ',' + sp.y.toFixed(1) + ') scale(1.9)' }, b.outs);
            var inner = el('g', { class: outAnim, style: 'animation-delay:' + sp.d + 's;animation-duration:' + sp.s + 's' }, outer);
            OUT[outIcon](inner);
          }
          b.n = n;
        }
      });
      var rn = spec.rain ? Math.max(0, Math.min(1, frame.rain / rainMax)) : 0;
      rain.style.opacity = (rn * 0.9).toFixed(2);
      sky.style.opacity = (rn * 0.22).toFixed(2);
      var tn = spec.temp && tMax > tMin ? Math.max(0, Math.min(1, (frame.temp - tMin) / (tMax - tMin))) : 0;
      heat.style.opacity = (tn * 0.13).toFixed(2);
      var total = S.sum(frame.vars[spec.outcome.key]);
      var level = maxTotal ? total / maxTotal : 0;
      var mood = level < 0.2 ? ['😀', 'Happy'] : level < 0.4 ? ['🙂', 'Calm'] : level < 0.6 ? ['😐', 'Uneasy'] : level < 0.8 ? ['😟', 'Worried'] : ['😫', 'Alarmed'];
      hud.innerHTML = '<span class="hud-item"><span class="hud-ico">📅</span><b>' + esc(frame.label) + '</b></span>' +
        (!spec.compact && spec.rain ? '<span class="hud-item"><span class="hud-ico">' + (rn > 0.35 ? '🌧️' : rn > 0.12 ? '🌦️' : '☀️') + '</span><b>' + M.charts.fmt(frame.rain, 0) + '</b>&nbsp;' + esc(spec.rainUnit || 'mm') + '</span>' : '') +
        (!spec.compact && spec.temp ? '<span class="hud-item"><span class="hud-ico">🌡️</span><b>' + M.charts.fmt(frame.temp, 1) + '</b>&nbsp;°C</span>' : '') +
        '<span class="hud-item"><span class="hud-ico">' + OUT_EMOJI[outIcon] + '</span><b>' + M.charts.fmt(total, 0) + '</b>&nbsp;' + esc(spec.outcome.hudUnit || 'this week') + '</span>' +
        '<span class="hud-item mood" title="Town mood"><span class="hud-ico">' + mood[0] + '</span>' + mood[1] + '</span>' +
        (spec.budget !== undefined ? '<span class="hud-item coin"><span class="coin-ico">₹</span><b>' + spec.budget + '</b>&nbsp;lakh</span>' : '');
    }

    // How a policy shows in the town: 'trucks' (crews at work), 'ban' or 'closed' signs in every ward.
    function setPolicy(kind, mask) {
      trucks.style.display = kind === 'trucks' ? '' : 'none';
      blocks.forEach(function (b, i) {
        while (b.badge.firstChild) b.badge.removeChild(b.badge.firstChild);
        var on = (kind === 'ban' || kind === 'closed') && (!mask || mask[i]);
        b.badge.style.display = on ? '' : 'none';
        if (!on) return;
        var bx = b.p.x + BW - 40, by = b.p.y + 4;
        if (kind === 'ban') {
          el('circle', { cx: bx + 28, cy: by + 7, r: 7, fill: '#fff', stroke: '#d03b3b', 'stroke-width': 2 }, b.badge);
          el('line', { x1: bx + 23, y1: by + 2, x2: bx + 33, y2: by + 12, stroke: '#d03b3b', 'stroke-width': 2 }, b.badge);
        } else {
          el('rect', { x: bx - 2, y: by, width: 38, height: 13, rx: 3, fill: '#d03b3b' }, b.badge);
          el('text', { x: bx + 17, y: by + 9.5, 'text-anchor': 'middle', class: 'closed-text', text: 'CLOSED' }, b.badge);
        }
      });
    }
    // Pilot: mark each ward T (treated) or C (control).
    function setMask(mask) {
      blocks.forEach(function (b, i) {
        var v = mask ? mask[i] : null, known = v === true || v === false;
        b.tag.style.display = known ? '' : 'none';
        b.g.classList.toggle('treated', v === true);
        b.g.classList.toggle('control', v === false);
        if (known) b.tagText.textContent = v ? 'T' : 'C';
      });
    }

    return { update: update, setPolicy: setPolicy, setMask: setMask };
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // One week of a simulated run as a town frame.
  function frameAt(vars, k, label, spec) {
    var f = { label: label, vars: {} };
    [spec.outcome.key].concat(spec.layers.map(function (L) { return L.key; })).forEach(function (key) {
      f.vars[key] = vars[key].map(function (row) { return row[k]; });
    });
    if (spec.rain) f.rain = M.stats.mean(vars[spec.rain].map(function (row) { return row[k]; }));
    if (spec.temp) f.temp = M.stats.mean(vars[spec.temp].map(function (row) { return row[k]; }));
    return f;
  }

  /* The advisor: Dr. Asha, the town's health officer, drawn in SVG.  mood: 'happy' | 'neutral' | 'worried' */
  function advisorHTML(html, mood, name) {
    var mouth = mood === 'happy' ? 'M24,38 q6,6 12,0' : mood === 'worried' ? 'M24,40 q6,-5 12,0' : 'M24,39 L36,39';
    var brows = mood === 'worried' ? '<path d="M20,24.5 l6,-1.8 M40,24.5 l-6,-1.8" stroke="#2b1d14" stroke-width="1.6" stroke-linecap="round"/>' : '';
    return '<div class="advisor"><svg class="avatar" viewBox="0 0 60 60" aria-hidden="true">' +
      '<circle cx="30" cy="30" r="29" class="avatar-bg"/>' +
      '<path d="M8,60 q2,-16 22,-17 q20,1 22,17 z" fill="#ffffff" stroke="#cfd6de"/>' +
      '<path d="M22,46 q8,8 16,0" fill="none" stroke="#3987e5" stroke-width="2"/>' +
      '<circle cx="38" cy="48" r="2.2" fill="#3987e5"/>' +
      '<rect x="26" y="38" width="8" height="7" fill="#b9784a"/>' +
      '<circle cx="30" cy="29" r="13" fill="#c68b59"/>' +
      '<path d="M16,29 q0,-17 14,-17 q14,0 14,17 q-3,-9 -14,-10 q-10,1 -14,10 z" fill="#2b1d14"/>' +
      '<circle cx="30" cy="11" r="5" fill="#2b1d14"/>' +
      '<circle cx="25" cy="29" r="1.6" fill="#2b1d14"/><circle cx="35" cy="29" r="1.6" fill="#2b1d14"/>' + brows +
      '<path d="' + mouth + '" transform="translate(0,-3)" fill="none" stroke="#5a2e1a" stroke-width="1.8" stroke-linecap="round"/>' +
      '</svg><div class="bubble"><div class="who">' + (name || 'Dr. Asha, town advisor') + '</div>' + html + '</div></div>';
  }

  M.town = { create: create, frameAt: frameAt, advisorHTML: advisorHTML, iconSVG: iconSVG };
})(globalThis.Mayor = globalThis.Mayor || {});
