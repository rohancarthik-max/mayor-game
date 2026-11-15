/* scm/l2_clinics.js - REVERSE CAUSATION model (Level 2 "Clinic paradox"; re-themed in Level 5).
 *
 * Hidden causal model (w = ward, t = week, e = N(0,1) noise, u = uniform(0,1)):
 *   risk_w          hidden (crowding, sanitation); never shown
 *   S(t)            season curve (monsoon fevers)
 *   sick[w,t]       ~ Poisson( a * risk_w * (0.4 + S(t)) * exp(-gamma * clinicsNow[w,t-1]) )
 *   clinics[w,t]    = clinics[w,t-1] + 1   if the last 4 weeks averaged above a threshold and u < 0.35
 *                     (the town OPENS clinics where people are sick: sickness -> clinics)
 *   clinics[w,0]    ~ grows with risk_w (years of the same response)
 *   pharmacy[w,t]   = 20 + 3.5 * sick[w,t] + 4e     (also caused BY sickness)
 * Clinics really reduce sickness (gamma > 0), yet wards with more clinics are sicker, because
 * sickness causes clinics. That arrow pointing "backwards" is the trap.
 */
(function (M) {
  'use strict';
  var C = M.scm.common, S = M.stats, poissonFromU = M.rng.poissonFromU;
  var NW = 20, NT = 52, H = 12, CAPR = 12;

  var THEMES = {
    clinics: {
      outcome: 'Fever cases', outcomeShort: 'fever', outcomeIcon: 'patient', outcomeAnim: 'bob',
      resp: 'Clinics', respUnit: 'open in ward', respIcon: 'clinic', respOne: 'clinic',
      decoy: 'Pharmacy sales', decoyUnit: '₹ thousand/week', decoyIcon: 'pill',
      driver: 'Rainfall', driverUnit: 'mm/week', common: 'Crowding and poor sanitation',
      closePolicy: 'Close half of every ward\'s clinics', closeDesc: 'Clinics are expensive and the data says they "go with" more sickness. Shutting half returns money to the budget.',
      openPolicy: 'Open 2 new clinics in every ward', openDesc: 'More doctors and beds in every ward for the season.',
      decoyPolicy: 'Cap pharmacy opening hours', decoyDesc: 'Pharmacies close early, cutting sales. Cheap.',
      revEdge: 'town opens clinics where people are sick', fwdEdge: 'clinics prevent fever'
    },
    thefts: {
      outcome: 'Thefts reported', outcomeShort: 'thefts', outcomeIcon: 'alarm', outcomeAnim: 'flash',
      resp: 'Police posts', respUnit: 'in ward', respIcon: 'police', respOne: 'police post',
      decoy: 'Lock & CCTV sales', decoyUnit: '₹ thousand/week', decoyIcon: 'lock',
      driver: 'Festival-season crowds', driverUnit: 'index', common: 'Busy markets and crowded streets',
      closePolicy: 'Close half of every ward\'s police posts', closeDesc: 'Posts are expensive and the data says they "go with" more theft. Closing half returns money to the budget.',
      openPolicy: 'Open 2 new police posts in every ward', openDesc: 'More constables on the beat in every ward for the season.',
      decoyPolicy: 'Cap lock & CCTV shop licences', decoyDesc: 'Fewer licences for lock and CCTV shops. Cheap.',
      revEdge: 'town adds police where thefts happen', fwdEdge: 'police posts deter thieves'
    }
  };

  function makeNoise(rng, nT) {
    return { uOut: C.uniformMatrix(rng, NW, nT), uResp: C.uniformMatrix(rng, NW, nT),
      decoy: C.noiseMatrix(rng, NW, nT), driver: C.noiseMatrix(rng, NW, nT), town: C.noiseMatrix(rng, 1, nT)[0] };
  }

  /* polAt(w, k): 'open' adds 2, 'close' removes half, 'cap_decoy' zeroes the decoy, in that ward-week. */
  function simulate(world, weeks, peak, noise, polAt, R0, recent0) {
    var p = world.p, nT = weeks.length;
    var v = { driver: C.zeros(NW, nT), resp: C.zeros(NW, nT), decoy: C.zeros(NW, nT), outcome: C.zeros(NW, nT) };
    var R = R0.slice(), recent = recent0.map(function (r) { return r.slice(); }), last = R0.slice();
    for (var k = 0; k < nT; k++) {
      var s = C.season(weeks[k], peak, p.width);
      for (var w = 0; w < NW; w++) {
        var pol = polAt(w, k);
        // what is actually open this week
        var now = R[w] + (pol === 'open' ? 2 : 0) - (pol === 'close' ? Math.floor(R[w] / 2) : 0);
        var lam = p.a * world.wards[w].risk * (0.4 + s) * Math.exp(-p.gamma * last[w]);
        var y = poissonFromU(lam, noise.uOut[w][k]);
        v.outcome[w][k] = y;
        v.resp[w][k] = now;
        v.decoy[w][k] = pol === 'cap_decoy' ? 0 : Math.max(0, 20 + 3.5 * y + 4 * noise.decoy[w][k]);
        v.driver[w][k] = Math.max(0, p.drvAmp * s * (1 + 0.15 * noise.town[k]) + 5 * noise.driver[w][k]);
        last[w] = now;
        // the town's response: open a new one where the last 4 weeks were bad
        recent[w].push(y); if (recent[w].length > 4) recent[w].shift();
        if (S.mean(recent[w]) > p.thr && noise.uResp[w][k] < p.respP && R[w] < CAPR) R[w] += 1;
      }
    }
    return { v: v, R: R, recent: recent, last: last };
  }

  function make(themeKey) {
    var T = THEMES[themeKey];

    function generate(rng) {
      var p = { peak: rng.range(26, 34), width: rng.range(5, 8), futureShift: rng.range(-2, 2),
        a: rng.range(4, 6), gamma: rng.range(0.05, 0.09), drvAmp: rng.range(50, 90) };
      p.thr = p.a * rng.range(0.75, 0.95);
      p.respP = rng.range(0.2, 0.3);
      var wards = [], R0 = [], recent0 = [];
      for (var w = 0; w < NW; w++) {
        var risk = rng.range(0.4, 2.0);
        wards.push({ name: M.scm.WARD_NAMES[w], risk: risk });
        R0.push(Math.max(0, Math.min(9, Math.round(1 + 5 * (risk - 0.4) / 1.6 + 0.7 * rng.normal()))));
        recent0.push([]);
      }
      var world = { theme: themeKey, T: T, p: p, wards: wards };
      var weeks = []; for (var t = 1; t <= NT; t++) weeks.push(t);
      world.weeks = weeks;
      var hist = simulate(world, weeks, p.peak, makeNoise(rng, NT), C.policyAt('none'), R0, recent0);
      world.history = hist.v;
      world.end = { R: hist.R, recent: hist.recent };
      var fp = p.peak + p.futureShift, fWeeks = [];
      for (var k = 0; k < H; k++) fWeeks.push(fp - 6 + k);
      world.futureWeeks = fWeeks;
      world.futureNoise = makeNoise(rng, H);
      return world;
    }

    /* Trap: wards with more clinics have MORE sickness (ward yearly averages, r > 0.4).
     * Clue (so a careful player can win): in the "what changed first?" view, sickness was
     * already well above the ward's usual level in the weeks BEFORE a clinic opened. */
    function checkTrap(world) {
      var h = world.history;
      var rWard = S.pearson(C.wardMeans(h.resp), C.wardMeans(h.outcome));
      var rAll = S.pearson(C.flatten(h.resp), C.flatten(h.outcome));
      var ev = S.eventStudy(h.resp, h.outcome, 6), m = ev.means, i0 = ev.ks.indexOf(0);
      var before = S.mean([m[i0 - 3], m[i0 - 2], m[i0 - 1]]), early = S.mean([m[i0 - 6], m[i0 - 5], m[i0 - 4]]);
      var rDecoy = S.pearson(C.flatten(h.decoy), C.flatten(h.outcome));
      var ok = rWard > 0.4 && ev.n >= 8 && before > 1.15 && before > early;
      return { ok: ok, rWard: rWard, rAll: rAll, before: before, early: early, events: ev.n, rDecoy: rDecoy };
    }

    function policies() {
      return [
        { id: 'close', label: T.closePolicy, cost: -10, target: 'resp', changes: T.resp + ' (halved, money back)', desc: T.closeDesc },
        { id: 'open', label: T.openPolicy, cost: 25, target: 'resp', changes: T.resp + ' (+2 per ward)', desc: T.openDesc },
        { id: 'cap_decoy', label: T.decoyPolicy, cost: 5, target: 'decoy', changes: T.decoy + ' (set to zero)', desc: T.decoyDesc },
        { id: 'none', label: 'Do nothing', cost: 0, target: null, desc: 'Keep the budget and let the season run.' }
      ];
    }

    function simulateFuture(world, plan) {
      var run = simulate(world, world.futureWeeks, world.p.peak + world.p.futureShift, world.futureNoise,
        C.policyAt(plan), world.end.R, world.end.recent);
      var wardWeekly = run.v.outcome;
      var weekly = C.weekTotals(wardWeekly);
      return { weekly: weekly, total: S.sum(weekly), vars: run.v, wardWeekly: wardWeekly };
    }

    function variables() {
      return [
        { key: 'driver', label: T.driver, unit: T.driverUnit, dp: 0 },
        { key: 'resp', label: T.resp, unit: T.respUnit, dp: 0 },
        { key: 'decoy', label: T.decoy, unit: T.decoyUnit, dp: 0 },
        { key: 'outcome', label: T.outcome, unit: 'per week', dp: 0 }
      ];
    }

    return { kind: 'panel', type: 'reverse', theme: T, generate: generate, checkTrap: checkTrap, policies: policies,
      simulateFuture: simulateFuture, variables: variables, lowerIsBetter: true, outcome: 'outcome',
      budget: 40, horizon: H, warm: 0, NW: NW, NT: NT };
  }

  M.scm.l2 = make('clinics');
  M.scm.l2b = make('thefts');
})(globalThis.Mayor = globalThis.Mayor || {});
