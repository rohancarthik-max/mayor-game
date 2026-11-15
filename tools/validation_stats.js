/* Recomputes the validation numbers quoted in the report (fixed seeds, so the output is
 * identical every run). Run from the mayor-game folder:  node tools/validation_stats.js */
'use strict';
const path = require('path');
['rng.js', 'stats.js', 'scm/common.js', 'scm/l1_dengue.js', 'scm/l2_clinics.js', 'scm/l3_coaching.js', 'scm/l4_roads.js']
  .forEach(f => require(path.join(__dirname, '..', 'js', f)));
const M = globalThis.Mayor, C = M.scm.common, S = M.stats;

const MODELS = [['l1', 'L1 dengue (confounding)'], ['l2', 'L2 clinics (reverse causation)'], ['l3', "L3 coaching (Simpson's paradox)"],
  ['l4', 'L4 roads (hidden confounder)'], ['l1b', 'L5a diarrhoea (confounding)'], ['l2b', 'L5b thefts (reverse causation)'], ['l4b', 'L5c school (hidden confounder)']];
const RAW = 500, WORLDS = 200;

console.log('1. How often a raw random world already contains the trap (no rejection), and the effect of the best policy');
console.log(['model', 'raw worlds with trap', 'mean tries', 'best policy', 'best impact / no-policy outcome'].join(' | '));
for (const [key, name] of MODELS) {
  const L = M.scm[key];
  let ok = 0;
  for (let i = 0; i < RAW; i++) if (L.checkTrap(L.generate(new M.rng.Rng('val-raw-' + key + '-' + i))).ok) ok++;
  let tries = 0; const rel = []; const bestIds = {};
  for (let i = 0; i < WORLDS; i++) {
    const w = C.generateWithTrap(L, 'val-' + key + '-' + i); tries += w.tries;
    const ev = C.evaluatePolicies(L, w), sc = C.score(ev, 'none', L.budget);
    bestIds[sc.bestId.replace(/_[AB0-9]$/, '_*')] = (bestIds[sc.bestId.replace(/_[AB0-9]$/, '_*')] || 0) + 1;
    rel.push(sc.best / ev.base.total);
  }
  console.log([name, (100 * ok / RAW).toFixed(1) + '%', (tries / WORLDS).toFixed(2), JSON.stringify(bestIds), (100 * S.mean(rel)).toFixed(1) + '%'].join(' | '));
}

console.log('\n2. Interventions on non-causes (exact zero under common random numbers)');
let zeroChecks = 0, nonZero = 0;
for (const [key] of MODELS) {
  const L = M.scm[key];
  const nullIds = w => key.startsWith('l1') ? ['ban_decoy', w.cause === 'A' ? 'clear_B' : 'clear_A'] : key.startsWith('l2') ? ['cap_decoy']
    : key === 'l3' ? ['cut_' + (w.cause === 'A' ? 'B' : 'A'), 'seats_' + (w.cause === 'A' ? 'B' : 'A')] : [0, 1, 2].filter(j => j !== w.cause).map(j => 'roll_' + j);
  for (let i = 0; i < WORLDS; i++) {
    const w = C.generateWithTrap(L, 'val-' + key + '-' + i), ev = C.evaluatePolicies(L, w);
    nullIds(w).forEach(id => { zeroChecks++; if (ev.byId[id].impact !== 0) nonZero++; });
  }
}
console.log(`non-cause interventions checked: ${zeroChecks}, with non-zero impact: ${nonZero}`);

console.log('\n3. Randomised pilot (4 weeks, 10 treated vs 10 control wards): bias and 95% CI coverage');
for (const key of ['l4', 'l4b']) {
  const L = M.scm[key]; const errs = []; let cover = 0, n = 0, nullCover = 0, nNull = 0, detect = 0, width = [];
  for (let i = 0; i < 300; i++) {
    const w = C.generateWithTrap(L, 'val-pilot-' + key + '-' + i);
    const base = L.simulateFuture(w, 'none'), usual = C.wardMeans(w.history.outcome);
    for (const j of [w.cause, (w.cause + 1) % 3]) {
      const mask = C.randomAssignment(new M.rng.Rng('val-coin-' + key + i + '-' + j), 20);
      const phase = { from: 0, to: 4, policy: 'roll_' + j, mask };
      const run = L.simulateFuture(w, { phases: [phase] });
      const est = C.analysePilot(L, w, run, phase);
      const truth = S.mean(mask.map((t, k) => t ? (S.mean(run.wardWeekly[k].slice(0, 4)) - S.mean(base.wardWeekly[k].slice(0, 4))) / usual[k] : null).filter(x => x !== null));
      width.push(est.hi - est.lo);
      if (j === w.cause) { errs.push(est.diff - truth); n++; if (est.lo <= truth && truth <= est.hi) cover++; if (est.hi < 0) detect++; }
      else { nNull++; if (est.lo <= 0 && 0 <= est.hi) nullCover++; }
    }
  }
  console.log(`${key}: bias ${S.mean(errs).toFixed(3)} (sd ${S.sd(errs).toFixed(3)}), coverage ${(100 * cover / n).toFixed(1)}%, ` +
    `real cause detected (CI below 0) ${(100 * detect / n).toFixed(1)}%, non-cause CI contains 0 ${(100 * nullCover / nNull).toFixed(1)}%, mean CI width ${(100 * S.mean(width)).toFixed(0)} points`);
}
