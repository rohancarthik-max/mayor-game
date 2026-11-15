/* rng.js - seeded random numbers.
 * Why: Math.random() cannot be replayed. A seeded generator gives the same
 * sequence every time for the same seed, so any game can be replayed exactly
 * (the seed is shown on screen) and the tests are reproducible.
 * Generator: mulberry32 (small, fast, good enough for a simulation/game).
 */
(function (M) {
  'use strict';

  // Turn any seed text into a 32-bit integer (FNV-1a hash + a final mix).
  function hashString(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= h >>> 16; h = Math.imul(h, 2246822507);
    h ^= h >>> 13; h = Math.imul(h, 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // uniform in [0, 1)
    };
  }

  function Rng(seed) {
    this.seed = String(seed);
    this._next = mulberry32(hashString(this.seed));
    this._spare = null;
  }
  Rng.prototype.uniform = function () { return this._next(); };
  Rng.prototype.range = function (a, b) { return a + (b - a) * this._next(); };
  Rng.prototype.int = function (a, b) { return a + Math.floor(this._next() * (b - a + 1)); };
  // Standard normal N(0,1) via the Marsaglia polar method.
  Rng.prototype.normal = function () {
    if (this._spare !== null) { var s0 = this._spare; this._spare = null; return s0; }
    var u, v, s;
    do { u = 2 * this._next() - 1; v = 2 * this._next() - 1; s = u * u + v * v; } while (s >= 1 || s === 0);
    var m = Math.sqrt(-2 * Math.log(s) / s);
    this._spare = v * m;
    return u * m;
  };
  Rng.prototype.pick = function (arr) { return arr[Math.floor(this._next() * arr.length)]; };
  Rng.prototype.shuffle = function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(this._next() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  };
  // An independent stream derived from this seed (e.g. one per level).
  Rng.prototype.fork = function (label) { return new Rng(this.seed + '/' + label); };

  /* Poisson count from a GIVEN uniform number u (inverse-CDF method).
   * Why: for common random numbers we draw u once and reuse it in both the
   * "with policy" and "without policy" runs. If the rate lambda is unchanged
   * the count is identical, so a policy on a non-cause has exactly zero effect. */
  function poissonFromU(lambda, u) {
    if (!(lambda > 0)) return 0;
    if (lambda > 500) { // normal approximation (never reached in our levels)
      var z = Math.sqrt(2) * erfinv(2 * u - 1);
      return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
    }
    var k = 0, p = Math.exp(-lambda), cdf = p;
    while (u > cdf && k < 2000) { k++; p *= lambda / k; cdf += p; }
    return k;
  }
  function erfinv(x) { // Giles' approximation, only used for huge lambda
    var w = -Math.log((1 - x) * (1 + x)), p;
    if (w < 5) { w -= 2.5; p = 2.81022636e-08; p = 3.43273939e-07 + p * w; p = -3.5233877e-06 + p * w; p = -4.39150654e-06 + p * w; p = 0.00021858087 + p * w; p = -0.00125372503 + p * w; p = -0.00417768164 + p * w; p = 0.246640727 + p * w; p = 1.50140941 + p * w; }
    else { w = Math.sqrt(w) - 3; p = -0.000200214257; p = 0.000100950558 + p * w; p = 0.00134934322 + p * w; p = -0.00367342844 + p * w; p = 0.00573950773 + p * w; p = -0.0076224613 + p * w; p = 0.00943887047 + p * w; p = 1.00167406 + p * w; p = 2.83297682 + p * w; }
    return p * x;
  }

  // A fresh 6-digit seed for a new game (the only place Math.random is used).
  function randomSeed() { return String(100000 + Math.floor(Math.random() * 900000)); }

  M.rng = { Rng: Rng, hashString: hashString, poissonFromU: poissonFromU, randomSeed: randomSeed };
})(globalThis.Mayor = globalThis.Mayor || {});
