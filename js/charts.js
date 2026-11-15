/* charts.js - small SVG chart helpers (no libraries, works offline).
 * Colours come from CSS variables (colour-blind-checked palette slots defined
 * in style.css), and every series is also named in a legend/label so colour is
 * never the only cue. */
(function (M) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var uid = 0;

  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) {
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'style') n.setAttribute('style', attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(n);
    return n;
  }
  function fmt(v, dp) {
    if (v === null || v === undefined || isNaN(v)) return '–';
    return Number(v).toLocaleString('en-IN', { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 });
  }
  // "Nice" axis ticks.
  function ticks(lo, hi, n) {
    if (hi === lo) { hi = lo + 1; }
    var step = Math.pow(10, Math.floor(Math.log10((hi - lo) / n)));
    var err = (hi - lo) / n / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var out = [], start = Math.ceil(lo / step) * step;
    for (var v = start; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }

  // Decimal places a tick list needs (0.5 steps need 1 decimal, 0.05 steps need 2).
  function tickDp(t) { if (t.length < 2) return 0; var st = Math.abs(t[1] - t[0]); return st >= 1 ? 0 : st >= 0.1 ? 1 : 2; }

  // ---- shared tooltip ----
  function tip() { return document.getElementById('tip'); }
  function showTip(html, clientX, clientY) {
    var t = tip(); if (!t) return;
    t.innerHTML = html; t.style.display = 'block';
    var r = t.getBoundingClientRect();
    var x = clientX + 14, y = clientY + 14;
    if (x + r.width > window.innerWidth - 8) x = clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = clientY - r.height - 14;
    t.style.left = Math.max(8, x) + 'px'; t.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { var t = tip(); if (t) t.style.display = 'none'; }
  function svgPoint(svg, evt) {
    var pt = svg.createSVGPoint(); pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  /* Line chart.
   * opts: { x: [..], xLabel, yLabel, series: [{ name, values, color, dash, tipValues, unit, dp }],
   *         yMin, yMax, height }
   * Returns { setProgress(n) } to reveal the first n points (used for the 12-week animation). */
  function lineChart(container, opts) {
    container.innerHTML = '';
    var W = 680, H = opts.height || 320, m = { l: 58, r: 150, t: 14, b: 46 };
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img',
      'aria-label': opts.ariaLabel || (opts.yLabel + ' by ' + opts.xLabel) }, container);
    var xs = opts.x, n = xs.length;
    var all = []; opts.series.forEach(function (s) { all = all.concat(s.values); });
    var yMin = opts.yMin !== undefined ? opts.yMin : Math.min(0, M.stats.min(all));
    var yMax = opts.yMax !== undefined ? opts.yMax : M.stats.max(all) * 1.05;
    if (yMax <= yMin) yMax = yMin + 1;
    var px = function (i) { return m.l + (n === 1 ? 0 : i / (n - 1)) * (W - m.l - m.r); };
    var py = function (v) { return H - m.b - (v - yMin) / (yMax - yMin) * (H - m.t - m.b); };

    var g = el('g', { class: 'axis' }, svg);
    var yt = ticks(yMin, yMax, 5), ydp = tickDp(yt);
    yt.forEach(function (v) {
      el('line', { x1: m.l, x2: W - m.r, y1: py(v), y2: py(v), class: 'grid' }, g);
      el('text', { x: m.l - 8, y: py(v) + 4, 'text-anchor': 'end', text: fmt(v, ydp) }, g);
    });
    var xt = ticks(xs[0], xs[n - 1], 8);
    xt.forEach(function (v) {
      var i = xs.indexOf(v); if (i < 0) return;
      el('text', { x: px(i), y: H - m.b + 18, 'text-anchor': 'middle', text: String(v) }, g);
    });
    el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'baseline' }, g);
    el('text', { x: (m.l + W - m.r) / 2, y: H - 6, 'text-anchor': 'middle', class: 'axis-title', text: opts.xLabel }, g);
    el('text', { x: 14, y: (m.t + H - m.b) / 2, 'text-anchor': 'middle', class: 'axis-title',
      transform: 'rotate(-90 14 ' + ((m.t + H - m.b) / 2) + ')', text: opts.yLabel }, g);

    var paths = opts.series.map(function (s) {
      return el('path', { class: 'line', fill: 'none',
        style: 'stroke:' + s.color + (s.dash ? ';stroke-dasharray:6 4' : '') }, svg);
    });
    var labels = opts.series.map(function (s) {
      return el('text', { class: 'direct-label', text: s.name }, svg);
    });

    var shown = n;
    function draw(k) {
      shown = k;
      var ends = [];
      opts.series.forEach(function (s, si) {
        var d = '';
        for (var i = 0; i < k; i++) d += (i ? 'L' : 'M') + px(i).toFixed(1) + ',' + py(s.values[i]).toFixed(1);
        paths[si].setAttribute('d', d);
        ends.push({ si: si, y: k ? py(s.values[k - 1]) : H - m.b, x: k ? px(k - 1) : m.l });
      });
      // Direct labels at the line ends, nudged apart so they don't overlap.
      ends.sort(function (a, b) { return a.y - b.y; });
      for (var j = 1; j < ends.length; j++) if (ends[j].y - ends[j - 1].y < 15) ends[j].y = ends[j - 1].y + 15;
      ends.forEach(function (e) {
        labels[e.si].setAttribute('x', e.x + 8); labels[e.si].setAttribute('y', e.y + 4);
        labels[e.si].style.display = k ? '' : 'none';
      });
    }
    draw(n);

    // Hover: crosshair + tooltip listing every series at that week.
    var cross = el('line', { class: 'crosshair', y1: m.t, y2: H - m.b, style: 'display:none' }, svg);
    var dots = opts.series.map(function (s) { return el('circle', { r: 4, class: 'hover-dot', style: 'fill:' + s.color + ';display:none' }, svg); });
    var hit = el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' }, svg);
    function move(evt) {
      var p = svgPoint(svg, evt.touches ? evt.touches[0] : evt);
      var i = Math.round((p.x - m.l) / (W - m.l - m.r) * (n - 1));
      i = Math.max(0, Math.min(shown - 1, i));
      if (i < 0) return;
      cross.setAttribute('x1', px(i)); cross.setAttribute('x2', px(i)); cross.style.display = '';
      var html = '<b>' + opts.xLabel + ' ' + xs[i] + '</b>';
      opts.series.forEach(function (s, si) {
        dots[si].setAttribute('cx', px(i)); dots[si].setAttribute('cy', py(s.values[i])); dots[si].style.display = '';
        var v = s.tipValues ? s.tipValues[i] : s.values[i];
        html += '<div><span class="sw" style="background:' + s.color + '"></span>' + s.name + ': <b>' + fmt(v, s.dp) + '</b>' + (s.unit ? ' ' + s.unit : '') + '</div>';
      });
      showTip(html, (evt.touches ? evt.touches[0] : evt).clientX, (evt.touches ? evt.touches[0] : evt).clientY);
    }
    function leave() { cross.style.display = 'none'; dots.forEach(function (d) { d.style.display = 'none'; }); hideTip(); }
    hit.addEventListener('mousemove', move); hit.addEventListener('touchstart', move, { passive: true });
    hit.addEventListener('mouseleave', leave);

    return { setProgress: function (k) { leave(); draw(k); } };
  }

  /* Scatter plot with least-squares line.
   * opts: { points: [{ x, y, label }], xLabel, yLabel, xUnit, yUnit, xdp, ydp, color, small } */
  function scatter(container, opts) {
    container.innerHTML = '';
    var W = 680, H = 360, m = { l: 62, r: 20, t: 14, b: 50 };
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img',
      'aria-label': 'Scatter plot of ' + opts.yLabel + ' against ' + opts.xLabel }, container);
    var X = opts.points.map(function (p) { return p.x; }), Y = opts.points.map(function (p) { return p.y; });
    var x0 = M.stats.min(X), x1 = M.stats.max(X), y0 = M.stats.min(Y), y1 = M.stats.max(Y);
    var padX = (x1 - x0 || 1) * 0.05, padY = (y1 - y0 || 1) * 0.05;
    x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
    var px = function (v) { return m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r); };
    var py = function (v) { return H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b); };
    var g = el('g', { class: 'axis' }, svg);
    var syt = ticks(y0, y1, 5), sydp = tickDp(syt), sxt = ticks(x0, x1, 7), sxdp = tickDp(sxt);
    syt.forEach(function (v) {
      el('line', { x1: m.l, x2: W - m.r, y1: py(v), y2: py(v), class: 'grid' }, g);
      el('text', { x: m.l - 8, y: py(v) + 4, 'text-anchor': 'end', text: fmt(v, sydp) }, g);
    });
    sxt.forEach(function (v) {
      el('text', { x: px(v), y: H - m.b + 18, 'text-anchor': 'middle', text: fmt(v, sxdp) }, g);
    });
    el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'baseline' }, g);
    el('text', { x: (m.l + W - m.r) / 2, y: H - 8, 'text-anchor': 'middle', class: 'axis-title', text: opts.xLabel + (opts.xUnit ? ' (' + opts.xUnit + ')' : '') }, g);
    el('text', { x: 14, y: (m.t + H - m.b) / 2, 'text-anchor': 'middle', class: 'axis-title',
      transform: 'rotate(-90 14 ' + ((m.t + H - m.b) / 2) + ')', text: opts.yLabel + (opts.yUnit ? ' (' + opts.yUnit + ')' : '') }, g);

    var r = opts.small ? 6 : 3.2;
    var dots = el('g', { class: 'dots' }, svg);
    opts.points.forEach(function (p) {
      el('circle', { cx: px(p.x).toFixed(1), cy: py(p.y).toFixed(1), r: r, class: 'dot', style: 'fill:' + opts.color }, dots);
    });
    var fit = M.stats.linreg(X, Y);
    // Trend line, clipped to the plot box.
    var clipId = 'clip' + (++uid);
    var cp = el('clipPath', { id: clipId }, el('defs', {}, svg));
    el('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b }, cp);
    el('line', { x1: px(x0), y1: py(fit.intercept + fit.slope * x0), x2: px(x1), y2: py(fit.intercept + fit.slope * x1),
      class: 'fit-line', 'clip-path': 'url(#' + clipId + ')' }, svg);

    var ring = el('circle', { r: r + 4, class: 'hover-ring', style: 'display:none' }, svg);
    svg.addEventListener('mousemove', function (evt) {
      var p = svgPoint(svg, evt), best = null, bd = 400;
      opts.points.forEach(function (q) {
        var dx = px(q.x) - p.x, dy = py(q.y) - p.y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = q; }
      });
      if (!best) { ring.style.display = 'none'; hideTip(); return; }
      ring.setAttribute('cx', px(best.x)); ring.setAttribute('cy', py(best.y)); ring.style.display = '';
      showTip('<b>' + best.label + '</b><div>' + opts.xLabel + ': ' + fmt(best.x, opts.xdp) + '</div><div>' + opts.yLabel + ': ' + fmt(best.y, opts.ydp) + '</div>', evt.clientX, evt.clientY);
    });
    svg.addEventListener('mouseleave', function () { ring.style.display = 'none'; hideTip(); });
  }

  /* Causal diagram (DAG). Arrows draw themselves one by one.
   * nodes: { id, label, x, y, kind: 'common'|'cause'|'decoy'|'outcome' }
   * edges: { from, to, label, strong, spurious } (spurious = correlation only, dashed, no arrowhead) */
  function dag(container, spec, opts) {
    opts = opts || {};
    container.innerHTML = '';
    var W = 640, H = 350;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart dag', role: 'img', 'aria-label': 'Hidden causal diagram' }, container);
    var mid = 'arrow' + (++uid), midStrong = mid + 's', midRev = mid + 'r';
    var defs = el('defs', {}, svg);
    [[mid, 'arrowhead'], [midStrong, 'arrowhead strong'], [midRev, 'arrowhead reverse']].forEach(function (a) {
      var mk = el('marker', { id: a[0], viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M0,0 L10,5 L0,10 z', class: a[1] }, mk);
    });
    var box = {};
    var gEdges = el('g', {}, svg), gNodes = el('g', {}, svg);
    spec.nodes.forEach(function (nd) {
      var lines = wrap(nd.label, 16);
      var w = Math.max.apply(null, lines.map(function (s) { return s.length; })) * 7.4 + 22, h = lines.length * 16 + 14;
      box[nd.id] = { x: nd.x, y: nd.y, hw: w / 2, hh: h / 2 };
      var g = el('g', { class: 'node ' + (nd.kind || '') }, gNodes);
      el('rect', { x: nd.x - w / 2, y: nd.y - h / 2, width: w, height: h, rx: 8 }, g);
      lines.forEach(function (ln, i) {
        el('text', { x: nd.x, y: nd.y - (lines.length - 1) * 8 + i * 16 + 4, 'text-anchor': 'middle', text: ln }, g);
      });
    });
    spec.edges.forEach(function (e, i) {
      var a = box[e.from], b = box[e.to];
      var p1 = clipTo(a, b), p2 = clipTo(b, a);
      if (e.offset) { // two arrows between the same boxes: shift this one sideways
        var ddx = p2.x - p1.x, ddy = p2.y - p1.y, dl = Math.hypot(ddx, ddy) || 1, nx = -ddy / dl * e.offset, ny = ddx / dl * e.offset;
        p1 = { x: p1.x + nx, y: p1.y + ny }; p2 = { x: p2.x + nx, y: p2.y + ny };
      }
      var cls = 'edge' + (e.strong ? ' strong' : '') + (e.spurious ? ' spurious' : '') + (e.reverse ? ' reverse' : '');
      var line = el('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: cls }, gEdges);
      if (!e.spurious) line.setAttribute('marker-end', 'url(#' + (e.strong ? midStrong : e.reverse ? midRev : mid) + ')');
      var len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      var delay = (opts.animate === false ? 0 : 300 + i * 450);
      if (e.spurious) { line.style.opacity = opts.animate === false ? 1 : 0; line.style.transition = 'opacity 0.6s ease ' + delay + 'ms'; }
      else if (opts.animate !== false) {
        line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
        line.style.transition = 'stroke-dashoffset 0.5s ease ' + delay + 'ms';
      }
      var lbl = null;
      if (e.label) {
        // Label sits at fraction `at` along the edge, nudged by (dx, dy) so it clears boxes and lines.
        var f = e.at !== undefined ? e.at : 0.5;
        var lx = p1.x + (p2.x - p1.x) * f + (e.dx || 0), ly = p1.y + (p2.y - p1.y) * f + (e.dy !== undefined ? e.dy : -6);
        lbl = el('text', { x: lx, y: ly, class: 'edge-label' + (e.spurious ? ' spurious' : ''), 'text-anchor': e.anchor || 'start', text: e.label }, gEdges);
        if (opts.animate !== false) { lbl.style.opacity = 0; lbl.style.transition = 'opacity 0.4s ease ' + (delay + 400) + 'ms'; }
      }
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        if (e.spurious) line.style.opacity = 1; else line.style.strokeDashoffset = 0;
        if (lbl) lbl.style.opacity = 1;
      }); });
    });
  }
  function clipTo(a, b) { // point where the line from a's centre to b's centre leaves a's box
    var dx = b.x - a.x, dy = b.y - a.y;
    var t = Math.min(dx ? a.hw / Math.abs(dx) : Infinity, dy ? a.hh / Math.abs(dy) : Infinity);
    var pad = 3 / Math.hypot(dx, dy);
    return { x: a.x + dx * (t + pad), y: a.y + dy * (t + pad) };
  }
  function wrap(text, maxLen) {
    var words = text.split(' '), lines = [], cur = '';
    words.forEach(function (w) {
      if ((cur + ' ' + w).trim().length > maxLen && cur) { lines.push(cur); cur = w; }
      else cur = (cur + ' ' + w).trim();
    });
    if (cur) lines.push(cur);
    return lines;
  }

  /* Town map: the 20 wards as tiles, shaded light -> dark blue by a value (a sequential,
   * single-hue scale: darker = more). Each tile also prints its number, so colour is never
   * the only cue. opts: { wards, min (default 0), max, title, unit, dp }. Returns { update(values) }. */
  var RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
  function rampColor(t) {
    t = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
    var i = Math.min(RAMP.length - 2, Math.floor(t)), f = t - i;
    var a = hex(RAMP[i]), b = hex(RAMP[i + 1]);
    return 'rgb(' + [0, 1, 2].map(function (k) { return Math.round(a[k] + (b[k] - a[k]) * f); }).join(',') + ')';
  }
  function hex(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function townMap(container, opts) {
    container.innerHTML = '';
    var COLS = 5, TW = 104, TH = 62, GAP = 6, X0 = 6, Y0 = 30;
    var W = X0 * 2 + COLS * (TW + GAP) - GAP, rows = Math.ceil(opts.wards.length / COLS);
    var H = Y0 + rows * (TH + GAP) + 34;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart townmap', role: 'img', 'aria-label': 'Map of wards shaded by ' + opts.title }, container);
    el('text', { x: X0, y: 18, class: 'map-title', text: opts.title + (opts.unit ? ' (' + opts.unit + ')' : '') }, svg);
    var tiles = opts.wards.map(function (w, i) {
      var x = X0 + (i % COLS) * (TW + GAP), y = Y0 + Math.floor(i / COLS) * (TH + GAP);
      var g = el('g', { class: 'tile' }, svg);
      var r = el('rect', { x: x, y: y, width: TW, height: TH, rx: 8 }, g);
      var t1 = el('text', { x: x + 8, y: y + 16, class: 'tile-name', text: (i + 1) + '. ' + w.name }, g);
      var t2 = el('text', { x: x + TW / 2, y: y + 46, 'text-anchor': 'middle', class: 'tile-val', text: '' }, g);
      g.addEventListener('mousemove', function (evt) {
        showTip('<b>Ward ' + (i + 1) + ': ' + w.name + '</b><div>' + opts.title + ': ' + fmt(g._v, opts.dp) + (opts.unit ? ' ' + opts.unit : '') + '</div>', evt.clientX, evt.clientY);
      });
      g.addEventListener('mouseleave', hideTip);
      return { g: g, r: r, t1: t1, t2: t2 };
    });
    // legend: light = low, dark = high
    var gid = 'grad' + (++uid), defs = el('defs', {}, svg), lg = el('linearGradient', { id: gid }, defs);
    RAMP.forEach(function (c, i) { el('stop', { offset: (i / (RAMP.length - 1) * 100) + '%', 'stop-color': c }, lg); });
    var ly = H - 22;
    var lo = opts.min || 0;
    el('text', { x: X0, y: ly + 11, class: 'map-legend', text: fmt(lo, opts.dp) }, svg);
    el('rect', { x: X0 + 34, y: ly, width: 180, height: 12, rx: 3, fill: 'url(#' + gid + ')' }, svg);
    el('text', { x: X0 + 222, y: ly + 11, class: 'map-legend', text: fmt(opts.max, opts.dp) + (opts.unit ? ' ' + opts.unit : '') }, svg);
    function update(values) {
      values.forEach(function (v, i) {
        var t = opts.max > lo ? (v - lo) / (opts.max - lo) : 0, T = tiles[i];
        T.g._v = v;
        T.r.style.fill = rampColor(t);
        var dark = t > 0.45;
        T.t1.style.fill = dark ? '#ffffff' : '#0b0b0b';
        T.t2.style.fill = dark ? '#ffffff' : '#0b0b0b';
        T.t2.textContent = fmt(v, opts.dp);
      });
    }
    return { update: update };
  }

  M.charts = { lineChart: lineChart, scatter: scatter, dag: dag, townMap: townMap, fmt: fmt, showTip: showTip, hideTip: hideTip };
})(globalThis.Mayor = globalThis.Mayor || {});
