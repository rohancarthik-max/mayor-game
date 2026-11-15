/* scm/l1_dengue.js - CONFOUNDING model (Level 1 "Dengue season"; re-themed in Level 5).
 *
 * Hidden causal model (w = ward, t = week, e = fresh N(0,1) noise):
 *   S(t)          = season curve, peaks in the warm wet season
 *   temp[t]       = tBase + tAmp*S(t) + 0.6e   (+0.3e per ward)
 *   rain[w,t]     = max(0, rainAmp*S(t) + 6e) * wet_w + 4e
 *   siteA[w,t]    = max(0, dA_w * rain/10 + 0.8e)       source type A (e.g. stagnant water)
 *   siteB[w,t]    = max(0, dB_w * rain/10 + 0.8e)       source type B (e.g. open tanks)
 *   decoy[w,t]    = max(0, base_w + perDeg*(temp-25) + 1.5e)   (e.g. ice-cream sales)
 *   complaintsA/B = round(report_w * site + 1.5e)       (what the town actually records)
 *   outcome[w,t]  ~ Poisson( b0 + beta * siteCAUSE[w,t-2] * (temp-20)/10 )
 * Only ONE of site A / site B is a cause (shuffled each game). The decoy has NO arrow into
 * the outcome: it only shares a cause (the season) with it.
 */
(function (M) {
  'use strict';
  var C = M.scm.common, S = M.stats, poissonFromU = M.rng.poissonFromU;

  var NW = 20, NT = 52, H = 12, WARM = 2, LAG = 2;

  var WARD_NAMES = ['Gandhi Nagar', 'Market Road', 'Temple Street', 'Lake View', 'Railway Colony',
    'Bus Stand', 'Old Town', 'Mill Area', 'Fisher Lane', 'College Road', 'Park Town', 'Riverside',
    "Weavers' Colony", 'Hill Side', 'New Extension', 'Salt Pans', 'Bazaar', 'Canal Bank',
    'Airport Road', 'Station Road'];

  var THEMES = {
    dengue: {
      outcome: 'Dengue cases', outcomeShort: 'dengue', outcomeIcon: 'mosquito', outcomeAnim: 'buzz',
      decoy: 'Ice-cream sales', decoyUnit: '₹ thousand/week', decoyIcon: 'cart',
      decoyPolicy: 'Ban ice-cream sales', decoyDesc: 'Shops and carts may not sell ice-cream during the season. Cheap to enforce.',
      decoyChanges: 'Ice-cream sales (set to zero)', decoyPlural: 'carts',
      common: 'Warm, wet season', causeEdge: 'mosquitoes, 2 weeks later', tempEdge: 'faster breeding when warm',
      mechanism: 'where mosquitoes breed',
      sites: [
        { name: 'stagnant-water sites', icon: 'puddle', complaint: 'Stagnant-water complaints', policy: 'Drain-clearing drive',
          policyDesc: 'Crews unblock drains and pump out puddles and pools in every ward.' },
        { name: 'uncovered water tanks', icon: 'tank', complaint: 'Open-tank complaints', policy: 'Tank-cover campaign',
          policyDesc: 'Free lids and inspections for rooftop and street water tanks in every ward.' },
        { name: 'discarded tyres and containers', icon: 'tyre', complaint: 'Tyre and junk-dump complaints', policy: 'Scrap-collection drive',
          policyDesc: 'Trucks collect old tyres, pots and junk that hold rainwater in every ward.' }
      ]
    },
    diarrhoea: {
      outcome: 'Diarrhoea cases', outcomeShort: 'diarrhoea', outcomeIcon: 'patient', outcomeAnim: 'bob',
      decoy: 'Cold-drink sales', decoyUnit: '₹ thousand/week', decoyIcon: 'bottle',
      decoyPolicy: 'Ban roadside cold-drink stalls', decoyDesc: 'Roadside stalls may not sell cold drinks this season. Cheap to enforce.',
      decoyChanges: 'Cold-drink sales (set to zero)', decoyPlural: 'stalls',
      common: 'Hot, rainy season', causeEdge: 'dirty water, 2 weeks later', tempEdge: 'germs grow faster when hot',
      mechanism: 'which dirties the drinking water',
      sites: [
        { name: 'overflowing sewers', icon: 'puddle', complaint: 'Sewer-overflow complaints', policy: 'Sewer repair drive',
          policyDesc: 'Crews clear and reline overflowing sewers in every ward.' },
        { name: 'leaking water pipes', icon: 'tank', complaint: 'Leaking-pipe complaints', policy: 'Pipe repair drive',
          policyDesc: 'Plumbers fix leaking public water pipes in every ward.' },
        { name: 'open garbage dumps', icon: 'tyre', complaint: 'Garbage-dump complaints', policy: 'Garbage clearance drive',
          policyDesc: 'Trucks clear open garbage dumps near water sources in every ward.' }
      ]
    }
  };

  function makeNoise(rng, nT) {
    return {
      tTown: C.noiseMatrix(rng, 1, nT)[0], rTown: C.noiseMatrix(rng, 1, nT)[0],
      tW: C.noiseMatrix(rng, NW, nT), rW: C.noiseMatrix(rng, NW, nT),
      siteA: C.noiseMatrix(rng, NW, nT), siteB: C.noiseMatrix(rng, NW, nT),
      decoy: C.noiseMatrix(rng, NW, nT),
      compA: C.noiseMatrix(rng, NW, nT), compB: C.noiseMatrix(rng, NW, nT),
      uOut: C.uniformMatrix(rng, NW, nT)
    };
  }

  /* Run the causal model. polAt(w, k) says which intervention do(X) acts in ward w, week k:
   *   'ban_decoy' sets the decoy to 0; 'clear_A' / 'clear_B' removes a share of that source.
   * The SAME function makes the history (no policy) and the future. */
  function simulate(world, weeks, peak, noise, polAt, k0) {
    var p = world.p, nT = weeks.length;
    k0 = k0 || 0;
    var v = { rain: C.zeros(NW, nT), temp: C.zeros(NW, nT), decoy: C.zeros(NW, nT),
      siteA: C.zeros(NW, nT), siteB: C.zeros(NW, nT), compA: C.zeros(NW, nT), compB: C.zeros(NW, nT),
      outcome: C.zeros(NW, nT) };
    for (var k = 0; k < nT; k++) {
      var s = C.season(weeks[k], peak, p.width);
      var tempTown = p.tBase + p.tAmp * s + 0.6 * noise.tTown[k];
      var rainTown = Math.max(0, p.rainAmp * s + 6 * noise.rTown[k]);
      for (var w = 0; w < NW; w++) {
        var wd = world.wards[w], pol = polAt(w, k + k0);
        var temp = tempTown + 0.3 * noise.tW[w][k];
        var rain = Math.max(0, rainTown * wd.wet + 4 * noise.rW[w][k]);
        var sA = Math.max(0, wd.dA * rain / 10 + 0.8 * noise.siteA[w][k]);
        var sB = Math.max(0, wd.dB * rain / 10 + 0.8 * noise.siteB[w][k]);
        if (pol === 'clear_A') sA *= (1 - p.clearEff);
        if (pol === 'clear_B') sB *= (1 - p.clearEff);
        var decoy = Math.max(0, wd.decoyBase + p.perDeg * (temp - 25) + 1.5 * noise.decoy[w][k]);
        if (pol === 'ban_decoy') decoy = 0;
        v.rain[w][k] = rain; v.temp[w][k] = temp; v.decoy[w][k] = decoy;
        v.siteA[w][k] = sA; v.siteB[w][k] = sB;
        v.compA[w][k] = Math.round(Math.max(0, wd.repA * sA + 1.5 * noise.compA[w][k]));
        v.compB[w][k] = Math.round(Math.max(0, wd.repB * sB + 1.5 * noise.compB[w][k]));
      }
    }
    // Outcome: from the CAUSE source, two weeks earlier, faster when warm.
    var causeKey = world.cause === 'A' ? 'siteA' : 'siteB';
    for (var k2 = 0; k2 < nT; k2++) {
      for (var w2 = 0; w2 < NW; w2++) {
        var src = v[causeKey][w2][Math.max(0, k2 - LAG)];
        var warmth = Math.max(0.2, (v.temp[w2][k2] - 20) / 10);
        v.outcome[w2][k2] = poissonFromU(p.b0 + p.beta * src * warmth, noise.uOut[w2][k2]);
      }
    }
    return v;
  }

  function make(themeKey) {
    var T = THEMES[themeKey];

    function generate(rng) {
      var p = {
        peak: rng.range(26, 34), width: rng.range(5, 8), futureShift: rng.range(-2, 2),
        tBase: rng.range(26.5, 28.5), tAmp: rng.range(4, 7), rainAmp: rng.range(50, 90),
        perDeg: rng.range(3, 6), b0: rng.range(0.3, 1.0), beta: rng.range(0.5, 1.0),
        clearEff: rng.range(0.55, 0.75)
      };
      var types = rng.shuffle(T.sites).slice(0, 2);
      var cause = rng.uniform() < 0.5 ? 'A' : 'B';
      var wards = [];
      for (var w = 0; w < NW; w++) {
        wards.push({ name: WARD_NAMES[w], wet: rng.range(0.8, 1.2),
          dA: rng.range(0.5, 1.5), dB: rng.range(0.5, 1.5),
          repA: rng.range(0.4, 1.0), repB: rng.range(0.4, 1.0), decoyBase: rng.range(8, 12) });
      }
      var world = { theme: themeKey, T: T, p: p, wards: wards, sites: { A: types[0], B: types[1] }, cause: cause };
      var weeks = []; for (var t = 1; t <= NT; t++) weeks.push(t);
      world.weeks = weeks;
      world.history = simulate(world, weeks, p.peak, makeNoise(rng, NT), C.policyAt('none'));
      var fp = p.peak + p.futureShift, fWeeks = [];
      for (var k = 0; k < WARM + H; k++) fWeeks.push(fp - 6 - WARM + k);
      world.futureWeeks = fWeeks;
      world.futureNoise = makeNoise(rng, WARM + H);
      return world;
    }

    /* The trap must hold AND be beatable:
     *  - the decoy is the strongest ward-week correlate of the outcome (r > 0.5, beats both
     *    complaint columns by at least 0.05)                                  <- the trap
     *  - on wards' yearly averages (the season cancels out) the real cause's complaints track
     *    the outcome clearly, and the decoy does not                          <- the clue */
    function checkTrap(world) {
      var h = world.history, F = C.flatten, Wm = C.wardMeans;
      var causeComp = world.cause === 'A' ? 'compA' : 'compB', otherComp = world.cause === 'A' ? 'compB' : 'compA';
      var d = F(h.outcome), dW = Wm(h.outcome);
      var rDecoy = S.pearson(F(h.decoy), d), rCause = S.pearson(F(h[causeComp]), d), rOther = S.pearson(F(h[otherComp]), d);
      var wDecoy = S.pearson(Wm(h.decoy), dW), wCause = S.pearson(Wm(h[causeComp]), dW), wOther = S.pearson(Wm(h[otherComp]), dW);
      var ok = rDecoy > 0.5 && rDecoy > rCause + 0.05 && rDecoy > rOther + 0.05 &&
        wCause > 0.4 && wCause > wDecoy + 0.25 && wCause > wOther + 0.25;
      return { ok: ok, rDecoy: rDecoy, rCause: rCause, rOther: rOther, wDecoy: wDecoy, wCause: wCause, wOther: wOther };
    }

    function policies(world) {
      return [
        { id: 'ban_decoy', label: T.decoyPolicy, cost: 5, target: 'decoy', changes: T.decoyChanges, desc: T.decoyDesc },
        { id: 'clear_A', label: world.sites.A.policy, cost: 25, target: 'compA', changes: 'The number of ' + world.sites.A.name + ' (cut by 55–75%)', desc: world.sites.A.policyDesc },
        { id: 'clear_B', label: world.sites.B.policy, cost: 25, target: 'compB', changes: 'The number of ' + world.sites.B.name + ' (cut by 55–75%)', desc: world.sites.B.policyDesc },
        { id: 'none', label: 'Do nothing', cost: 0, target: null, desc: 'Keep the whole budget and let the season run.' }
      ];
    }

    function simulateFuture(world, plan) {
      var v = simulate(world, world.futureWeeks, world.p.peak + world.p.futureShift, world.futureNoise, C.policyAt(plan), -WARM);
      var wardWeekly = v.outcome.map(function (row) { return row.slice(WARM); });
      var weekly = C.weekTotals(wardWeekly);
      return { weekly: weekly, total: S.sum(weekly), vars: v, wardWeekly: wardWeekly };
    }

    function variables(world) {
      return [
        { key: 'rain', label: 'Rainfall', unit: 'mm/week', dp: 0 },
        { key: 'temp', label: 'Temperature', unit: '°C', dp: 1 },
        { key: 'decoy', label: T.decoy, unit: T.decoyUnit, dp: 1 },
        { key: 'compA', label: world.sites.A.complaint, unit: 'per week', dp: 0 },
        { key: 'compB', label: world.sites.B.complaint, unit: 'per week', dp: 0 },
        { key: 'outcome', label: T.outcome, unit: 'per week', dp: 0 }
      ];
    }

    return { kind: 'panel', type: 'confounding', theme: T, generate: generate, checkTrap: checkTrap, policies: policies,
      simulateFuture: simulateFuture, variables: variables, lowerIsBetter: true, outcome: 'outcome',
      budget: 40, horizon: H, warm: WARM, NW: NW, NT: NT };
  }

  M.scm.l1 = make('dengue');
  M.scm.l1b = make('diarrhoea');
  M.scm.WARD_NAMES = WARD_NAMES;
})(globalThis.Mayor = globalThis.Mayor || {});
