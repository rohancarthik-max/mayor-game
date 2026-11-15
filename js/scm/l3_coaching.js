/* scm/l3_coaching.js - SIMPSON'S PARADOX model (Level 3 "Coaching centres").
 * Unlike the ward x week levels, the data here is one row per student.
 *
 * Hidden causal model (one student; e = N(0,1), u = uniform(0,1)):
 *   prior       ~ N(55, 16)                     last year's marks
 *   group       = Low (< 45) / Mid (45-65) / High (>= 65)
 *   joinA       = u < pA[group]                 weaker students are far more likely to join
 *   joinB       = u < pB[group]
 *   final       = 8 + 0.9*prior + tauA*joinA + tauB*joinB + 8e   (capped to 0..100)
 * ONE of the two programmes really helps (tau 6-10 marks); the other does nothing (tau = 0).
 * Which one is shuffled each game. Because weak students join, BOTH programmes' students
 * score lower overall. Inside each prior-marks group, the real one clearly helps.
 */
(function (M) {
  'use strict';
  var S = M.stats;
  var N = 1200, GROUPS = ['Low', 'Mid', 'High'];

  var PROGRAMMES = [
    { name: 'Coaching centre', short: 'coaching', icon: '🏫', desc: 'Evening coaching classes run by private tutors.' },
    { name: 'Evening study hall', short: 'study hall', icon: '📚', desc: 'A quiet supervised room to study after school.' },
    { name: 'Test-series app', short: 'test app', icon: '📱', desc: 'Weekly online mock tests with instant marks.' }
  ];

  function groupOf(prior) { return prior < 45 ? 0 : prior < 65 ? 1 : 2; }

  function makeCohort(rng) {
    var c = [];
    for (var i = 0; i < N; i++) {
      c.push({ ePrior: rng.normal(), uA: rng.uniform(), uB: rng.uniform(), eScore: rng.normal(),
        female: rng.uniform() < 0.5, north: rng.uniform() < 0.5 });
    }
    return c;
  }

  /* Build the student table. `policy` is an intervention on joinA / joinB:
   *   cut_A / cut_B   : the programme closes, nobody attends it
   *   seats_A/seats_B : 300 free seats for the weakest students not already enrolled */
  function simulate(world, cohort, policy) {
    var p = world.p, rows = [];
    cohort.forEach(function (s, i) {
      var prior = Math.max(5, Math.min(98, 55 + 16 * s.ePrior));
      var g = groupOf(prior);
      rows.push({ id: i + 1, prior: prior, group: g, A: s.uA < p.pA[g] ? 1 : 0, B: s.uB < p.pB[g] ? 1 : 0,
        female: s.female ? 1 : 0, north: s.north ? 1 : 0, eScore: s.eScore });
    });
    if (policy === 'cut_A') rows.forEach(function (r) { r.A = 0; });
    if (policy === 'cut_B') rows.forEach(function (r) { r.B = 0; });
    if (policy === 'seats_A' || policy === 'seats_B') {
      var key = policy === 'seats_A' ? 'A' : 'B';
      rows.filter(function (r) { return !r[key]; })
        .sort(function (a, b) { return a.prior - b.prior; })
        .slice(0, 300).forEach(function (r) { r[key] = 1; });
    }
    rows.forEach(function (r) {
      r.final = Math.max(0, Math.min(100, 8 + 0.9 * r.prior + p.tauA * r.A + p.tauB * r.B + 8 * r.eScore));
    });
    return rows;
  }

  function diffs(rows, key) {
    var overall = S.mean(rows.filter(function (r) { return r[key]; }).map(function (r) { return r.final; })) -
      S.mean(rows.filter(function (r) { return !r[key]; }).map(function (r) { return r.final; }));
    var within = [0, 1, 2].map(function (g) {
      var inG = rows.filter(function (r) { return r.group === g; });
      return S.mean(inG.filter(function (r) { return r[key]; }).map(function (r) { return r.final; })) -
        S.mean(inG.filter(function (r) { return !r[key]; }).map(function (r) { return r.final; }));
    });
    return { overall: overall, within: within };
  }

  function generate(rng) {
    var progs = rng.shuffle(PROGRAMMES).slice(0, 2);
    var eff = rng.uniform() < 0.5 ? 'A' : 'B';
    var tau = rng.range(6, 10);
    var p = {
      pA: [rng.range(0.75, 0.90), rng.range(0.20, 0.35), rng.range(0.04, 0.10)],
      pB: [rng.range(0.75, 0.90), rng.range(0.20, 0.35), rng.range(0.04, 0.10)],
      tauA: eff === 'A' ? tau : 0, tauB: eff === 'B' ? tau : 0
    };
    var world = { p: p, progs: { A: progs[0], B: progs[1] }, cause: eff, N: N };
    world.history = simulate(world, makeCohort(rng), 'none');
    world.futureCohort = makeCohort(rng);
    return world;
  }

  /* Trap: the programme that really helps LOOKS harmful overall (its students score 3+ marks
   * lower), yet helps inside every prior-marks group (by 1.5+ marks). The useless programme
   * also looks harmful overall, but inside groups it is clearly weaker than the real one. */
  function checkTrap(world) {
    var X = world.cause, O = X === 'A' ? 'B' : 'A';
    var dx = diffs(world.history, X), dO = diffs(world.history, O);
    var ok = dx.overall < -3 && Math.min.apply(null, dx.within) > 1.5 && dO.overall < 0 &&
      S.mean(dO.within) < Math.min.apply(null, dx.within) - 1;
    return { ok: ok, overallCause: dx.overall, withinCause: dx.within, overallOther: dO.overall, withinOther: dO.within };
  }

  function policies(world) {
    var A = world.progs.A, B = world.progs.B;
    return [
      { id: 'cut_A', label: 'Stop funding the ' + A.name.toLowerCase(), cost: -10, target: 'A', changes: A.name + ': closes (money back)',
        desc: 'Its students score lower than everyone else. Closing it returns money to the budget.' },
      { id: 'cut_B', label: 'Stop funding the ' + B.name.toLowerCase(), cost: -10, target: 'B', changes: B.name + ': closes (money back)',
        desc: 'Its students score lower than everyone else. Closing it returns money to the budget.' },
      { id: 'seats_A', label: '300 free ' + A.name.toLowerCase() + ' seats', cost: 20, target: 'A', changes: A.name + ': +300 weakest students not yet enrolled',
        desc: 'Free places for the 300 weakest students who are not enrolled yet.' },
      { id: 'seats_B', label: '300 free ' + B.name.toLowerCase() + ' seats', cost: 20, target: 'B', changes: B.name + ': +300 weakest students not yet enrolled',
        desc: 'Free places for the 300 weakest students who are not enrolled yet.' },
      { id: 'none', label: 'Do nothing', cost: 0, target: null, desc: 'Keep the budget. Next year\'s exams run as usual.' }
    ];
  }

  function simulateFuture(world, plan) {
    var rows = simulate(world, world.futureCohort, typeof plan === 'string' ? plan : 'none');
    var total = S.sum(rows.map(function (r) { return r.final; }));
    return { rows: rows, total: total, mean: total / rows.length };
  }

  function variables(world) {
    return [
      { key: 'prior', label: 'Last year\'s marks', unit: 'out of 100', dp: 0 },
      { key: 'group', label: 'Prior-marks group', unit: '', dp: 0, cat: GROUPS },
      { key: 'A', label: world.progs.A.name, unit: '1 = attends', dp: 0, cat: ['No', 'Yes'] },
      { key: 'B', label: world.progs.B.name, unit: '1 = attends', dp: 0, cat: ['No', 'Yes'] },
      { key: 'female', label: 'Gender', unit: '', dp: 0, cat: ['Boy', 'Girl'] },
      { key: 'north', label: 'School zone', unit: '', dp: 0, cat: ['South', 'North'] },
      { key: 'final', label: 'Final exam score', unit: 'out of 100', dp: 0 }
    ];
  }

  M.scm.l3 = { kind: 'units', type: 'simpson', generate: generate, checkTrap: checkTrap, policies: policies,
    simulateFuture: simulateFuture, variables: variables, lowerIsBetter: false, outcome: 'final',
    budget: 40, N: N, GROUPS: GROUPS, diffs: diffs };
})(globalThis.Mayor = globalThis.Mayor || {});
