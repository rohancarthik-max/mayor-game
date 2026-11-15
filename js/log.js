/* log.js - playtest evidence. Every decision is recorded so peers' logs can be
 * downloaded (CSV/JSON) and combined later into the README's playtest results.
 * Also saved in localStorage (if the browser allows) so a refresh doesn't lose it. */
(function (M) {
  'use strict';
  var session = null;
  var STORE_KEY = 'mayor-for-a-year-last-session';

  function nowIso() { return new Date().toISOString(); }
  function newId() { return 'S' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }

  function start(seed, player) {
    session = { session_id: newId(), player: player || '', seed: String(seed), started: nowIso(),
      user_agent: (typeof navigator !== 'undefined' ? navigator.userAgent : 'node'),
      events: [], decisions: [], quiz: {}, feedback: null };
    save();
    return session;
  }
  function event(type, data) {
    if (!session) return;
    var e = { time: nowIso(), type: type };
    for (var k in data) e[k] = data[k];
    session.events.push(e);
    save();
  }
  function decision(row) {
    if (!session) return;
    row.session_id = session.session_id; row.player = session.player; row.seed = session.seed; row.time = nowIso();
    session.decisions.push(row);
    save();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(session)); } catch (e) { /* private mode: ignore */ }
  }
  function get() { return session; }

  var CSV_COLS = ['session_id', 'player', 'seed', 'level', 'level_title', 'policy_id', 'policy_label', 'cost_lakh',
    'concept', 'pilots', 'pilot_policies', 'pilot_cost_lakh',
    'true_impact', 'best_impact', 'best_policy', 'picked_true_cause', 'fell_for_trap', 'score',
    'explore_seconds', 'tools_used', 'used_key_tool', 'badges', 'time'];
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV() {
    var lines = [CSV_COLS.join(',')];
    (session ? session.decisions : []).forEach(function (r) {
      lines.push(CSV_COLS.map(function (c) { return csvCell(r[c]); }).join(','));
    });
    return lines.join('\n') + '\n';
  }
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function fileStem() {
    var who = (session.player || 'player').replace(/[^A-Za-z0-9_-]/g, '') || 'player';
    return 'mayor_log_' + who + '_' + session.seed + '_' + session.session_id;
  }
  function downloadJSON() { event('download', { format: 'json' }); download(fileStem() + '.json', JSON.stringify(session, null, 2), 'application/json'); }
  function downloadCSV() { event('download', { format: 'csv' }); download(fileStem() + '.csv', toCSV(), 'text/csv'); }

  // Quiz answers (which = 'pre' | 'post') and the end-of-game feedback form.
  function quiz(which, data) { if (!session) return; data.time = nowIso(); session.quiz[which] = data; save(); }
  function feedback(data) { if (!session) return; data.time = nowIso(); session.feedback = data; save(); }

  M.log = { start: start, event: event, decision: decision, quiz: quiz, feedback: feedback, get: get, toCSV: toCSV,
    downloadJSON: downloadJSON, downloadCSV: downloadCSV, download: download };
})(globalThis.Mayor = globalThis.Mayor || {});
