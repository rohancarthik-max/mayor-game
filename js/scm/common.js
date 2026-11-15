/* scm/common.js - pieces every level's causal model shares.
 *
 * A level "model" is an object with:
 *   generate(rng)            -> world: hidden parameters + 52 weeks of history + future noise
 *   checkTrap(world)         -> { ok, ...numbers }: does this world contain the level's trap?
 *   policies(world)          -> list of { id, label, desc, cost, target }
 *   simulateFuture(world, id)-> { weekly: [...], total }: run the next 12 weeks under do(policy)
 *   lowerIsBetter            -> true if the outcome is something bad (cases, accidents)
 */
(function (M) {
  'use strict';
  var stats = M.stats;

  // Seasonal curve: 0 most of the year, rising to 1 at the peak week (a bell shape).
  function season(t, peak, width) {
    var z = (t - peak) / width;
    return Math.exp(-0.5 * z * z);
  }

  // A wards x weeks table of independent N(0,1) draws.
  function noiseMatrix(rng, nW, nT) {
    var m = [];
    for (var w = 0; w < nW; w++) {
      var row = new Array(nT);
      for (var t = 0; t < nT; t++) row[t] = rng.normal();
      m.push(row);
    }
    return m;
  }
  function uniformMatrix(rng, nW, nT) {
    var m = [];
    for (var w = 0; w < nW; w++) {
      var row = new Array(nT);
      for (var t = 0; t < nT; t++) row[t] = rng.uniform();
      m.push(row);
    }
    return m;
  }
  function zeros(nW, nT) {
    var m = [];
    for (var w = 0; w < nW; w++) m.push(new Array(nT).fill(0));
    return m;
  }
  // Every ward-week value in one flat list (for correlations across ward-weeks).
  function flatten(m) { var out = []; for (var w = 0; w < m.length; w++) for (var t = 0; t < m[w].length; t++) out.push(m[w][t]); return out; }
  // One yearly average per ward.
  function wardMeans(m) { return m.map(function (row) { return stats.mean(row); }); }
  // Town total per week.
  function weekTotals(m) {
    var nT = m[0].length, out = new Array(nT).fill(0);
    for (var w = 0; w < m.length; w++) for (var t = 0; t < nT; t++) out[t] += m[w][t];
    return out;
  }
  function weekMeans(m) { return weekTotals(m).map(function (v) { return v / m.length; }); }

  /* Rejection sampling: keep drawing fresh random worlds until the trap holds.
   * Why: the lesson needs the trap (e.g. the decoy must LOOK like the best
   * cause). Random parameters usually give it; when they don't, we redraw.
   * All draws come from the same seeded stream, so the result is replayable. */
  function generateWithTrap(model, seed, maxTries) {
    var rng = new M.rng.Rng(seed);
    maxTries = maxTries || 1000;
    for (var tries = 1; tries <= maxTries; tries++) {
      var world = model.generate(rng);
      var check = model.checkTrap(world);
      if (check.ok) { world.tries = tries; world.trap = check; world.seed = String(seed); return world; }
    }
    throw new Error('No world with the trap after ' + maxTries + ' tries (seed ' + seed + ')');
  }

  /* True impact of every policy, by COMMON RANDOM NUMBERS.
   * The future noise was drawn once inside generate(). Each policy run reuses
   * exactly that noise, so the only difference between "with" and "without"
   * is the policy itself: same weather, same luck. Impact = how much better
   * the outcome is than doing nothing. */
  function evaluatePolicies(model, world) {
    var base = model.simulateFuture(world, 'none');
    var out = {};
    model.policies(world).forEach(function (p) {
      var res = p.id === 'none' ? base : model.simulateFuture(world, p.id);
      var impact = model.lowerIsBetter ? base.total - res.total : res.total - base.total;
      out[p.id] = { policy: p, run: res, impact: impact };
    });
    return { base: base, byId: out };
  }

  /* Score out of 100:
   *   70 x (your true impact / the best possible impact)   - town wellbeing
   * + 30 x (share of budget left)                           - money matters
   * - 20 x (share of budget WASTED on a policy that did not help)
   * The best possible impact is found by simulating every option, not typed in. */
  /* `plan` (optional) describes a season with pilots: { impact, pilotCost }. Pilot money is
   * NOT counted as waste (it buys information), but it does use budget. Refunds (negative
   * cost, e.g. closing something) raise the budget points. The total never goes below 0. */
  function score(evaluation, choiceId, budget, plan) {
    var best = -Infinity, bestId = 'none';
    Object.keys(evaluation.byId).forEach(function (id) {
      var r = evaluation.byId[id];
      if (r.impact > best) { best = r.impact; bestId = id; }
    });
    var mine = evaluation.byId[choiceId];
    var rolloutCost = mine.policy.cost, pilotCost = plan ? plan.pilotCost : 0;
    var impact = plan ? plan.impact : mine.impact;
    var cost = rolloutCost + pilotCost;
    var ratio = best > 0 ? Math.max(-1, Math.min(1, impact / best)) : 0;
    var impactPts = 70 * ratio;
    var budgetPts = 30 * (budget - cost) / budget;
    var wasted = (rolloutCost > 0 && mine.impact <= 0.05 * best) ? rolloutCost : 0;
    var penalty = 20 * wasted / budget;
    return {
      total: Math.max(0, Math.round(impactPts + budgetPts - penalty)),
      impactPts: impactPts, budgetPts: budgetPts, penalty: penalty,
      impact: impact, best: best, bestId: bestId, cost: cost, pilotCost: pilotCost, wasted: wasted
    };
  }

  /* A season "plan" is either a policy id (whole season, every ward) or a list of phases:
   *   { phases: [{ from: 0, to: 4, policy: 'x', mask: [true,false,...] }, { from: 4, to: 12, policy: 'y' }] }
   * Weeks are counted from 0 = first week of the season. Warm-up weeks (k < 0) follow week 0.
   * Returns policyAt(ward, week) -> the policy id acting there (or 'none'). */
  function policyAt(plan) {
    if (!plan || typeof plan === 'string') { var id = plan || 'none'; return function () { return id; }; }
    var ph = plan.phases;
    return function (w, k) {
      if (k < 0) k = 0;
      for (var i = 0; i < ph.length; i++) {
        if (k >= ph[i].from && k < ph[i].to) return (!ph[i].mask || ph[i].mask[w]) ? ph[i].policy : 'none';
      }
      return 'none';
    };
  }

  // Impact of any plan against doing nothing, with the same random numbers.
  function planImpact(model, world, plan, base) {
    base = base || model.simulateFuture(world, 'none');
    var run = model.simulateFuture(world, plan);
    return { run: run, impact: model.lowerIsBetter ? base.total - run.total : run.total - base.total };
  }

  /* Randomised pilot: pick which wards get the policy by a (seeded) coin toss, half and half. */
  function randomAssignment(rng, n) {
    var idx = rng.shuffle(Array.apply(null, Array(n)).map(function (_, i) { return i; }));
    var mask = new Array(n).fill(false);
    for (var i = 0; i < Math.floor(n / 2); i++) mask[idx[i]] = true;
    return mask;
  }

  /* Analyse a pilot from the simulated season. Each ward is compared with ITS OWN usual level
   * (last year's weekly average), which removes fixed differences between wards; then treated
   * wards are compared with control wards (Welch 95% CI). Because the coin decided who got the
   * policy, the two groups differ only by chance and by the policy itself. */
  function analysePilot(model, world, run, phase) {
    var out = model.outcome, base = wardMeans(world.history[out]);
    var rel = run.wardWeekly.map(function (row, w) {
      var seg = row.slice(phase.from, phase.to);
      return M.stats.mean(seg) / Math.max(0.05, base[w]) - 1; // change vs usual, as a fraction
    });
    var tr = [], co = [];
    rel.forEach(function (r, w) { (phase.mask[w] ? tr : co).push(r); });
    var wl = M.stats.welch(tr, co);
    return { treated: M.stats.mean(tr), control: M.stats.mean(co), diff: wl.diff, lo: wl.lo, hi: wl.hi,
      nT: tr.length, nC: co.length, rel: rel };
  }

  M.scm = M.scm || {};
  M.scm.common = {
    season: season, noiseMatrix: noiseMatrix, uniformMatrix: uniformMatrix, zeros: zeros,
    flatten: flatten, wardMeans: wardMeans, weekTotals: weekTotals, weekMeans: weekMeans,
    generateWithTrap: generateWithTrap, evaluatePolicies: evaluatePolicies, score: score,
    policyAt: policyAt, planImpact: planImpact, randomAssignment: randomAssignment, analysePilot: analysePilot
  };
})(globalThis.Mayor = globalThis.Mayor || {});
