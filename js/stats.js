/* stats.js - the statistics the dashboard computes live from generated data.
 * Nothing here knows the answer; it only sees the numbers the player sees. */
(function (M) {
  'use strict';

  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : NaN; }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function sd(a) { // sample standard deviation
    var m = mean(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return a.length > 1 ? Math.sqrt(s / (a.length - 1)) : NaN;
  }
  // Pearson correlation r: how well a straight line fits, from -1 to +1.
  function pearson(x, y) {
    var n = Math.min(x.length, y.length);
    if (n < 3) return NaN;
    var mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
    mx /= n; my /= n;
    var sxy = 0, sxx = 0, syy = 0;
    for (i = 0; i < n; i++) {
      var dx = x[i] - mx, dy = y[i] - my;
      sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
    }
    if (sxx === 0 || syy === 0) return 0;
    return sxy / Math.sqrt(sxx * syy);
  }
  // Least-squares line y = intercept + slope * x (for the trend line on scatter plots).
  function linreg(x, y) {
    var mx = mean(x), my = mean(y), sxy = 0, sxx = 0;
    for (var i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); }
    var slope = sxx === 0 ? 0 : sxy / sxx;
    return { slope: slope, intercept: my - slope * mx };
  }
  function min(a) { var m = Infinity; for (var i = 0; i < a.length; i++) if (a[i] < m) m = a[i]; return m; }
  function max(a) { var m = -Infinity; for (var i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }

  function variance(a) { var s = sd(a); return s * s; }

  // 97.5% point of Student's t with df degrees of freedom (Cornish-Fisher expansion;
  // within 0.01 of tables for df >= 3). Used for 95% confidence intervals.
  function t975(df) {
    var z = 1.959964, z3 = z * z * z, z5 = z3 * z * z, z7 = z5 * z * z;
    return z + (z3 + z) / (4 * df) + (5 * z5 + 16 * z3 + 3 * z) / (96 * df * df) +
      (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * df * df * df);
  }
  /* Welch two-sample comparison: difference of means (a - b) with a 95% CI.
   * Welch's version does not assume both groups have equal variance. */
  function welch(a, b) {
    var na = a.length, nb = b.length, va = variance(a) / na, vb = variance(b) / nb;
    var diff = mean(a) - mean(b), se = Math.sqrt(va + vb);
    var df = (va + vb) * (va + vb) / (va * va / (na - 1) + vb * vb / (nb - 1));
    if (!isFinite(df) || df < 1) df = Math.max(1, na + nb - 2);
    var t = t975(df);
    return { diff: diff, se: se, df: df, lo: diff - t * se, hi: diff + t * se, tstat: se > 0 ? diff / se : 0 };
  }

  /* Lagged correlation between two wards x weeks tables, pooled over wards.
   * r at lag k pairs X in week t with Y in week t + k. With `changes` on, both series are
   * first turned into week-to-week changes, which removes slow trends and each ward's
   * usual level, so the question becomes "when X moved, what did Y do k weeks later?" */
  function laggedCorr(X, Y, k, changes) {
    var xs = [], ys = [];
    for (var w = 0; w < X.length; w++) {
      var x = X[w], y = Y[w], nT = x.length;
      for (var t = 1; t < nT; t++) {
        var u = t + k;
        if (u < 1 || u >= nT) continue;
        xs.push(changes ? x[t] - x[t - 1] : x[t]);
        ys.push(changes ? y[u] - y[u - 1] : y[u]);
      }
    }
    return pearson(xs, ys);
  }

  /* "What changed first?" (an event study). Find every ward-week where X JUMPED (one of its
   * biggest week-to-week rises), then average Y in the weeks around those jumps, each ward's Y
   * expressed relative to that ward's usual level (1.0 = usual). If Y was already high BEFORE
   * X jumped, Y probably drove X, not the other way round. */
  function eventStudy(X, Y, win) {
    win = win || 6;
    var deltas = [];
    X.forEach(function (row) { for (var t = 1; t < row.length; t++) deltas.push(row[t] - row[t - 1]); });
    var pos = deltas.filter(function (d) { return d > 0; }).sort(function (a, b) { return a - b; });
    if (!pos.length) return { ks: [], means: [], n: 0 };
    var thr = Math.max(pos[0], pos[Math.floor(pos.length * 0.75)]);
    var ks = [], sums = [], counts = [];
    for (var k = -win; k <= win; k++) { ks.push(k); sums.push(0); counts.push(0); }
    var n = 0;
    for (var w = 0; w < X.length; w++) {
      var base = mean(Y[w]) || 1e-9;
      for (var t = 1; t < X[w].length; t++) {
        if (X[w][t] - X[w][t - 1] < thr) continue;
        n++;
        for (var j = 0; j < ks.length; j++) {
          var u = t + ks[j];
          if (u < 0 || u >= Y[w].length) continue;
          sums[j] += Y[w][u] / base; counts[j]++;
        }
      }
    }
    return { ks: ks, means: sums.map(function (s, j) { return counts[j] ? s / counts[j] : NaN; }), n: n };
  }

  M.stats = { mean: mean, sum: sum, sd: sd, variance: variance, pearson: pearson, linreg: linreg, min: min, max: max,
    t975: t975, welch: welch, laggedCorr: laggedCorr, eventStudy: eventStudy };
})(globalThis.Mayor = globalThis.Mayor || {});
