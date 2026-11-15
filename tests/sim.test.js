/* Simulation tests. Run from the mayor-game folder with:  node --test
 * They load the SAME files the browser loads, so they test the real game code.
 * Seeds are fixed strings, so every run checks exactly the same worlds. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
['rng.js', 'stats.js', 'scm/common.js', 'scm/l1_dengue.js', 'scm/l2_clinics.js', 'scm/l3_coaching.js', 'scm/l4_roads.js']
  .forEach(f => require(path.join(__dirname, '..', 'js', f)));
const M = globalThis.Mayor, C = M.scm.common, S = M.stats;
const SEEDS = 150;

// ---------------------------------------------------------------- basics
test('rng: same seed gives the same numbers, different seeds differ', () => {
  const a = new M.rng.Rng('x'), b = new M.rng.Rng('x'), c = new M.rng.Rng('y');
  const sa = [a.uniform(), a.normal()], sb = [b.uniform(), b.normal()], sc = [c.uniform(), c.normal()];
  assert.deepStrictEqual(sa, sb);
  assert.notDeepStrictEqual(sa, sc);
});

test('stats: Pearson r, t quantile and Welch CI are correct on known data', () => {
  assert.ok(Math.abs(S.pearson([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-12);
  assert.ok(Math.abs(S.pearson([1, 2, 3, 4], [8, 6, 4, 2]) + 1) < 1e-12);
  assert.ok(Math.abs(S.t975(10) - 2.228) < 0.01);    // from t tables
  assert.ok(Math.abs(S.t975(30) - 2.042) < 0.005);
  const w = S.welch([1, 2, 3, 4, 5], [3, 4, 5, 6, 7]);
  assert.ok(Math.abs(w.diff + 2) < 1e-12 && w.lo < -2 && w.hi > -2 && w.hi < 0.5);
});

// ---------------------------------------------------------------- shared checks for every model
const MODELS = { l1: 'Level 1 dengue (confounding)', l1b: 'Level 5 diarrhoea (confounding)', l2: 'Level 2 clinics (reverse)',
  l2b: 'Level 5 thefts (reverse)', l3: 'Level 3 coaching (Simpson)', l4: 'Level 4 roads (RCT)', l4b: 'Level 5 school (RCT)' };

for (const [key, name] of Object.entries(MODELS)) {
  const L = M.scm[key];

  test(`${name}: worlds are replayable from their seed`, () => {
    const a = C.generateWithTrap(L, 'replay'), b = C.generateWithTrap(L, 'replay');
    assert.deepStrictEqual(JSON.stringify(a.history), JSON.stringify(b.history));
  });

  test(`${name}: the trap holds in ${SEEDS} generated worlds`, () => {
    for (let i = 0; i < SEEDS; i++) {
      const w = C.generateWithTrap(L, key + '-trap-' + i);
      assert.ok(L.checkTrap(w).ok, 'seed ' + key + '-trap-' + i); // recomputed from the data, not trusted
    }
  });

  test(`${name}: rejection sampling needs few tries (worlds are typical, not cherry-picked)`, () => {
    let tries = 0;
    for (let i = 0; i < SEEDS; i++) tries += C.generateWithTrap(L, key + '-tries-' + i).tries;
    assert.ok(tries / SEEDS < 4, 'mean tries ' + (tries / SEEDS).toFixed(2));
  });

  test(`${name}: the real cause is shuffled between candidates`, () => {
    const seen = new Set();
    for (let i = 0; i < 40; i++) seen.add(String(C.generateWithTrap(L, key + '-shuf-' + i).cause));
    if (key.startsWith('l2')) return; // clinics are always the real cause; the decoy name is themed
    assert.ok(seen.size >= 2, 'causes seen: ' + [...seen]);
  });
}

// ---------------------------------------------------------------- confounding (L1 and its L5 version)
for (const key of ['l1', 'l1b']) {
  const L = M.scm[key];
  test(`${MODELS[key]}: banning the decoy or clearing the non-cause has EXACTLY zero effect (common random numbers)`, () => {
    for (let i = 0; i < SEEDS; i++) {
      const w = C.generateWithTrap(L, key + '-crn-' + i), ev = C.evaluatePolicies(L, w);
      const other = w.cause === 'A' ? 'clear_B' : 'clear_A';
      assert.strictEqual(ev.byId.ban_decoy.impact, 0);
      assert.strictEqual(ev.byId[other].impact, 0);
      assert.strictEqual(ev.byId.none.impact, 0);
    }
  });
  test(`${MODELS[key]}: clearing the real cause helps a lot and is the best option`, () => {
    for (let i = 0; i < SEEDS; i++) {
      const w = C.generateWithTrap(L, key + '-cause-' + i), ev = C.evaluatePolicies(L, w), id = 'clear_' + w.cause;
      assert.ok(ev.byId[id].impact > 0.25 * ev.base.total);
      assert.strictEqual(C.score(ev, id, L.budget).bestId, id);
    }
  });
}

// ---------------------------------------------------------------- reverse causation
for (const key of ['l2', 'l2b']) {
  const L = M.scm[key];
  test(`${MODELS[key]}: closing harms, opening helps, capping the downstream decoy does exactly nothing`, () => {
    for (let i = 0; i < SEEDS; i++) {
      const w = C.generateWithTrap(L, key + '-pol-' + i), ev = C.evaluatePolicies(L, w);
      assert.ok(ev.byId.close.impact < 0, 'close impact ' + ev.byId.close.impact);
      assert.ok(ev.byId.open.impact > 0, 'open impact ' + ev.byId.open.impact);
      assert.strictEqual(ev.byId.cap_decoy.impact, 0);
    }
  });
}

// ---------------------------------------------------------------- Simpson's paradox
test(`${MODELS.l3}: the real programme looks harmful overall but helps in every group; useless one has zero effect`, () => {
  const L = M.scm.l3;
  for (let i = 0; i < SEEDS; i++) {
    const w = C.generateWithTrap(L, 'l3-pol-' + i), ev = C.evaluatePolicies(L, w);
    const X = w.cause, O = X === 'A' ? 'B' : 'A';
    assert.ok(ev.byId['cut_' + X].impact < 0);
    assert.ok(ev.byId['seats_' + X].impact > 0);
    assert.strictEqual(ev.byId['cut_' + O].impact, 0);
    assert.strictEqual(ev.byId['seats_' + O].impact, 0);
    assert.strictEqual(C.score(ev, 'seats_' + X, L.budget).bestId, 'seats_' + X);
  }
});

// ---------------------------------------------------------------- randomised pilots
for (const key of ['l4', 'l4b']) {
  const L = M.scm[key];
  test(`${MODELS[key]}: rolling out a non-cause has exactly zero effect; the real cause helps`, () => {
    for (let i = 0; i < SEEDS; i++) {
      const w = C.generateWithTrap(L, key + '-pol-' + i), ev = C.evaluatePolicies(L, w);
      [0, 1, 2].forEach(j => {
        if (j === w.cause) assert.ok(ev.byId['roll_' + j].impact > 0);
        else assert.strictEqual(ev.byId['roll_' + j].impact, 0);
      });
    }
  });

  test(`${MODELS[key]}: a randomised pilot recovers the true effect (unbiased, 95% CIs cover it ~95% of the time)`, () => {
    const errs = []; let cover = 0, n = 0, nullCover = 0, nNull = 0;
    for (let i = 0; i < 200; i++) {
      const w = C.generateWithTrap(L, key + '-pilot-' + i);
      const base = L.simulateFuture(w, 'none'), usual = C.wardMeans(w.history.outcome);
      for (const j of [w.cause, (w.cause + 1) % 3]) {
        const mask = C.randomAssignment(new M.rng.Rng(key + 'coin' + i + '-' + j), 20);
        const phase = { from: 0, to: 4, policy: 'roll_' + j, mask };
        const run = L.simulateFuture(w, { phases: [phase] });
        const est = C.analysePilot(L, w, run, phase);
        // truth: the policy's real effect on the treated wards (same random numbers, with vs without)
        const truth = S.mean(mask.map((t, k) => t ? (S.mean(run.wardWeekly[k].slice(0, 4)) - S.mean(base.wardWeekly[k].slice(0, 4))) / usual[k] : null).filter(x => x !== null));
        if (j === w.cause) { errs.push(est.diff - truth); n++; if (est.lo <= truth && truth <= est.hi) cover++; }
        else { assert.strictEqual(truth, 0); nNull++; if (est.lo <= 0 && 0 <= est.hi) nullCover++; }
      }
    }
    assert.ok(Math.abs(S.mean(errs)) < 0.03, 'bias ' + S.mean(errs));
    assert.ok(cover / n > 0.88 && cover / n < 0.99, 'coverage ' + cover / n);
    assert.ok(nullCover / nNull > 0.88, 'null coverage ' + nullCover / nNull);
  });

  test(`${MODELS[key]}: a pilot plan's impact is between doing nothing and a full-season rollout`, () => {
    const w = C.generateWithTrap(L, key + '-plan'), ev = C.evaluatePolicies(L, w), id = 'roll_' + w.cause;
    const mask = C.randomAssignment(new M.rng.Rng('m'), 20);
    const plan = { phases: [{ from: 0, to: 4, policy: id, mask }, { from: 4, to: 12, policy: id }] };
    const imp = C.planImpact(L, w, plan, ev.base).impact;
    assert.ok(imp > 0 && imp < ev.byId[id].impact, imp + ' vs ' + ev.byId[id].impact);
  });
}

// ---------------------------------------------------------------- scoring
test('Scoring: the real cause beats doing nothing, which beats the decoy; waste is penalised; never below 0', () => {
  const L = M.scm.l1, w = C.generateWithTrap(L, 'score-1'), ev = C.evaluatePolicies(L, w);
  const good = C.score(ev, 'clear_' + w.cause, L.budget), decoy = C.score(ev, 'ban_decoy', L.budget), none = C.score(ev, 'none', L.budget);
  assert.ok(good.total > none.total && none.total > decoy.total, [good.total, none.total, decoy.total].join(' '));
  assert.ok(decoy.penalty > 0 && good.penalty === 0);
  const L2 = M.scm.l2, w2 = C.generateWithTrap(L2, 'score-2'), ev2 = C.evaluatePolicies(L2, w2);
  const close = C.score(ev2, 'close', L2.budget);
  assert.ok(close.total >= 0 && close.total < C.score(ev2, 'none', L2.budget).total);
});
