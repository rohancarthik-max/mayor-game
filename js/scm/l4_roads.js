/* scm/l4_roads.js - HIDDEN CONFOUNDER + RANDOMISED PILOT model (Level 4 "Road accidents";
 * re-themed in Level 5).
 *
 * Hidden causal model (w = ward, t = week, e = N(0,1), u = uniform(0,1)):
 *   danger_w        hidden (how risky the ward's roads are); never shown
 *   traffic[w,t]    = 1000 * (0.5*danger_w + 0.5*other_w) * (1 + 0.05e)      shown, only PART of danger
 *   X_k[w]          = level of candidate measure k (3 of them), placed by the city where
 *                     roads were dangerous:  a_k * danger_w + noise           (shown)
 *   outcome[w,t]    ~ Poisson( base * danger_w * (0.7 + 0.6*S(t)) * exp(-theta * (X_c[w] - mean X_c)) )
 * Exactly ONE candidate c really reduces accidents (theta > 0), shuffled each game. All three
 * look harmful in the data (more speed breakers where more crashes), because the city put
 * them on dangerous roads. The danger itself is not in the data, so no table, plot or split
 * can fully remove it. A RANDOMISED pilot can: a coin decides which wards get the measure.
 */
(function (M) {
  'use strict';
  var C = M.scm.common, S = M.stats, poissonFromU = M.rng.poissonFromU;
  var NW = 20, NT = 52, H = 12;

  var THEMES = {
    roads: {
      outcome: 'Road accidents', outcomeShort: 'accidents', outcomeIcon: 'crash', outcomeAnim: 'flash',
      hidden: 'Dangerous roads', driver: 'Traffic', driverUnit: 'vehicles/day', seasonWord: 'monsoon',
      cands: [
        { name: 'Speed breakers', unit: 'in ward', icon: 'bump', lo: 2, hi: 12, delta: 4, policy: 'Build 4 speed breakers in every ward', desc: 'Raised humps on busy stretches to slow traffic.' },
        { name: 'Street lights', unit: 'working', icon: 'lamp', lo: 10, hi: 60, delta: 20, policy: 'Install 20 street lights in every ward', desc: 'Bright LED lights on dark roads.' },
        { name: 'Traffic police shifts', unit: 'per week', icon: 'police', lo: 1, hi: 9, delta: 3, policy: 'Add 3 traffic-police shifts per ward each week', desc: 'Officers at junctions during rush hours.' }
      ]
    },
    school: {
      outcome: 'Children absent from school', outcomeShort: 'absences', outcomeIcon: 'child', outcomeAnim: 'bob',
      hidden: 'Family hardship', driver: 'Families on ration cards', driverUnit: 'households', seasonWord: 'monsoon',
      cands: [
        { name: 'School buses', unit: 'running', icon: 'bus', lo: 0, hi: 6, delta: 3, policy: 'Add 3 school buses in every ward', desc: 'Free buses on the longest walking routes.' },
        { name: 'Mid-day meal upgrades', unit: 'schools', icon: 'meal', lo: 1, hi: 8, delta: 3, policy: 'Upgrade mid-day meals in 3 more schools per ward', desc: 'Eggs and fruit added to the school lunch.' },
        { name: 'Free uniform kits', unit: 'hundreds', icon: 'shirt', lo: 1, hi: 10, delta: 4, policy: 'Give 400 more free uniform kits per ward', desc: 'Uniform, shoes and a school bag for each child.' }
      ]
    }
  };

  function makeNoise(rng, nT) { return { uOut: C.uniformMatrix(rng, NW, nT), traffic: C.noiseMatrix(rng, NW, nT) }; }

  function simulate(world, weeks, peak, noise, polAt) {
    var p = world.p, nT = weeks.length, T = world.T;
    var v = { traffic: C.zeros(NW, nT), X0: C.zeros(NW, nT), X1: C.zeros(NW, nT), X2: C.zeros(NW, nT), outcome: C.zeros(NW, nT) };
    for (var k = 0; k < nT; k++) {
      var s = C.season(weeks[k], peak, p.width);
      for (var w = 0; w < NW; w++) {
        var wd = world.wards[w], pol = polAt(w, k);
        var X = wd.X.slice();
        for (var j = 0; j < 3; j++) if (pol === 'roll_' + j) X[j] += T.cands[j].delta;
        v.X0[w][k] = X[0]; v.X1[w][k] = X[1]; v.X2[w][k] = X[2];
        v.traffic[w][k] = Math.round(wd.traffic * (1 + 0.05 * noise.traffic[w][k]));
        var lam = p.base * wd.danger * (0.7 + 0.6 * s) * Math.exp(-p.theta * (X[p.cause] - p.meanX));
        v.outcome[w][k] = poissonFromU(lam, noise.uOut[w][k]);
      }
    }
    return v;
  }

  function make(themeKey) {
    var T = THEMES[themeKey];

    function generate(rng) {
      var cause = rng.int(0, 2), eff = rng.range(0.25, 0.40);
      var p = { peak: rng.range(26, 34), width: rng.range(6, 9), futureShift: rng.range(-2, 2), base: rng.range(4, 6),
        cause: cause, eff: eff, theta: -Math.log(1 - eff) / T.cands[cause].delta };
      var wards = [];
      for (var w = 0; w < NW; w++) {
        var danger = rng.range(0.6, 1.6), other = rng.range(0.6, 1.6);
        var X = T.cands.map(function (c) {
          var z = (danger - 0.6) / 1.0; // 0..1
          return Math.max(c.lo, Math.min(c.hi + 2, Math.round(c.lo + (c.hi - c.lo) * (0.15 + 0.7 * z) + (c.hi - c.lo) * 0.12 * rng.normal())));
        });
        wards.push({ name: M.scm.WARD_NAMES[w], danger: danger, traffic: 1000 * (0.5 * danger + 0.5 * other), X: X });
      }
      p.meanX = S.mean(wards.map(function (wd) { return wd.X[cause]; }));
      var world = { theme: themeKey, T: T, p: p, wards: wards, cause: cause };
      var weeks = []; for (var t = 1; t <= NT; t++) weeks.push(t);
      world.weeks = weeks;
      world.history = simulate(world, weeks, p.peak, makeNoise(rng, NT), C.policyAt('none'));
      var fp = p.peak + p.futureShift, fWeeks = [];
      for (var k = 0; k < H; k++) fWeeks.push(fp - 6 + k);
      world.futureWeeks = fWeeks;
      world.futureNoise = makeNoise(rng, H);
      world.pilotRng = rng.fork('pilot');
      return world;
    }

    /* Trap: all three measures go WITH more accidents (r > 0.2 across wards' yearly averages),
     * and the one with the strongest link is NOT the real cause. */
    function checkTrap(world) {
      var h = world.history, out = C.wardMeans(h.outcome);
      var r = [0, 1, 2].map(function (j) { return S.pearson(C.wardMeans(h['X' + j]), out); });
      var strongest = r.indexOf(S.max(r));
      var ok = S.min(r) > 0.2 && strongest !== world.cause;
      return { ok: ok, r: r, strongest: strongest };
    }

    function policies() {
      return T.cands.map(function (c, j) {
        return { id: 'roll_' + j, label: c.policy, cost: 30, target: 'X' + j, changes: c.name + ' (+' + c.delta + ' per ward)', desc: c.desc };
      }).concat([{ id: 'none', label: 'Do nothing', cost: 0, target: null, desc: 'Keep the budget and let the season run.' }]);
    }

    function simulateFuture(world, plan) {
      var v = simulate(world, world.futureWeeks, world.p.peak + world.p.futureShift, world.futureNoise, C.policyAt(plan));
      var weekly = C.weekTotals(v.outcome);
      return { weekly: weekly, total: S.sum(weekly), vars: v, wardWeekly: v.outcome };
    }

    function variables() {
      return [
        { key: 'traffic', label: T.driver, unit: T.driverUnit, dp: 0 },
        { key: 'X0', label: T.cands[0].name, unit: T.cands[0].unit, dp: 0 },
        { key: 'X1', label: T.cands[1].name, unit: T.cands[1].unit, dp: 0 },
        { key: 'X2', label: T.cands[2].name, unit: T.cands[2].unit, dp: 0 },
        { key: 'outcome', label: T.outcome, unit: 'per week', dp: 0 }
      ];
    }

    return { kind: 'panel', type: 'rct', theme: T, generate: generate, checkTrap: checkTrap, policies: policies,
      simulateFuture: simulateFuture, variables: variables, lowerIsBetter: true, outcome: 'outcome',
      budget: 40, horizon: H, warm: 0, NW: NW, NT: NT };
  }

  M.scm.l4 = make('roads');
  M.scm.l4b = make('school');
})(globalThis.Mayor = globalThis.Mayor || {});
