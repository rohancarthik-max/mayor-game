/* ui.js - the screens and the game loop:
 *   start -> (pre-quiz) -> for each level: brief -> explore -> policy desk (-> pilots) -> simulation -> reveal
 *   -> (post-quiz) -> feedback -> report card
 * The UI only displays numbers computed from the generated world. */
(function (M) {
  'use strict';
  var C = M.scm.common, S = M.stats, CH = M.charts, fmt = CH.fmt;
  var app, state = {};

  var OBJECTIVES = [
    'Explain why a strong correlation does not show causation.',
    'Recognise confounding, reverse causation and Simpson\'s paradox in data.',
    'Use stratification (comparing like with like) to control for a confounder.',
    'Explain why randomised experiments establish causation.'
  ];
  var LEVEL_NAMES = ['Dengue season', 'Clinic paradox', 'Coaching centres', 'Road accidents', 'Final term'];
  var TAB_NAMES = { town: 'Town view', map: 'Ward heatmap', timeseries: 'Time series', scatter: 'Scatter + r', lag: 'What changed first?',
    splitp: 'Split by group', table: 'Data table', class: 'Class view', compare: 'Compare averages', split: 'Split by group' };
  var OTHER_COLORS = ['var(--s3)', 'var(--s4)', 'var(--s2)', 'var(--s5)', 'var(--s7)', 'var(--s6)'];

  var BADGES = [
    { id: 'rootcause', icon: '🎯', name: 'Root-cause fixer', desc: 'Funded the policy that targets the real cause.' },
    { id: 'sceptic', icon: '🧐', name: 'Sceptic', desc: 'Didn\'t fall for the trap the data set up.' },
    { id: 'detective', icon: '🔍', name: 'Data detective', desc: 'Used the right tool for this kind of trap before deciding.' },
    { id: 'explorer', icon: '🧭', name: 'Explorer', desc: 'Opened every unlocked tool before deciding.' },
    { id: 'scientist', icon: '🧪', name: 'Scientist', desc: 'Ran a randomised pilot before rolling out.' }
  ];
  var DETECTIVE_HINT = { confounding: 'Compare wards\' yearly averages (or split by a season measure) so the shared season cancels out.',
    reverse: 'Use "What changed first?" to see which moved first.', simpson: 'Split by prior-marks group to compare like with like.',
    rct: 'Run a randomised pilot: let a coin decide who gets the measure.' };

  // ---------------------------------------------------------------- helpers
  var timers = [];
  function every(fn, ms) { var id = setInterval(fn, ms); timers.push(id); return id; }
  function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }
  function stopTimers() { timers.forEach(function (id) { clearInterval(id); clearTimeout(id); }); timers = []; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function render(html) {
    stopTimers(); CH.hideTip();
    app.innerHTML = html; window.scrollTo(0, 0);
    app.classList.remove('enter'); void app.offsetWidth; app.classList.add('enter');
  }
  function q(sel) { return app.querySelector(sel); }
  function qa(sel) { return Array.prototype.slice.call(app.querySelectorAll(sel)); }
  function lakh(x) { return '₹' + fmt(Math.abs(x), 0) + ' lakh'; }
  function costText(c) { return c > 0 ? lakh(c) : c < 0 ? 'saves ' + lakh(c) : 'free'; }
  function signed(x, dp) { return (x > 0 ? '+' : x < 0 ? '−' : '') + fmt(Math.abs(x), dp || 0); }
  function pct(x) { return signed(x * 100, 0) + '%'; }
  function L() { return state.level; }
  function isPanel() { return L().model.kind === 'panel'; }
  function levelLabel(lv) { return lv.part ? 'Level 5 · problem ' + lv.part + ' of 3' : 'Level ' + lv.n + ' of 5'; }
  function termLeft() { return M.TERM_BUDGET - state.termSpent; }
  function budgetLeft() { // money still available in this level
    var spentPilots = state.pilots.reduce(function (a, p) { return a + p.cost; }, 0);
    return (L().shared ? termLeft() : L().model.budget) - spentPilots;
  }
  function scoreBudget() { return L().shared ? L().partBudget : L().model.budget; }
  function varByKey(k) { return state.vars.filter(function (v) { return v.key === k; })[0]; }
  function varColor(key) {
    if (key === L().model.outcome) return 'var(--s1)';
    var others = state.vars.filter(function (v) { return v.key !== L().model.outcome; });
    for (var i = 0; i < others.length; i++) if (others[i].key === key) return OTHER_COLORS[i % OTHER_COLORS.length];
    return 'var(--muted)';
  }
  function shown(r) { return r.shown; }
  function totalScore() { return (state.results || []).filter(shown).reduce(function (a, r) { return a + r.score.total; }, 0); }

  function topbar() {
    var info = document.getElementById('topbar-info');
    if (!state.seed) { info.innerHTML = ''; return; }
    var lv = state.level ? levelLabel(state.level) : '';
    info.innerHTML = '<span>Seed <b>' + esc(state.seed) + '</b></span>' + (lv ? '<span>' + lv + '</span>' : '') +
      (state.level && state.level.shared ? '<span>Term budget <b>' + lakh(termLeft()) + '</b></span>' : '') +
      '<span>Score <b>' + totalScore() + '</b></span>';
  }
  function levelPath() {
    var cur = state.level ? state.level.n - 1 : 5;
    return '<ol class="path" aria-label="Level progress">' + LEVEL_NAMES.map(function (name, i) {
      var rs = (state.results || []).filter(function (r) { return r.n === i + 1 && r.shown; });
      var need = i === 4 ? 3 : 1, done = rs.length >= need;
      var cls = done ? 'done' : i === cur ? 'current' : i > cur ? 'locked' : '';
      var stars = done ? '<span class="path-stars">' + '★★★'.slice(0, Math.round(S.mean(rs.map(function (r) { return M.fx.starsFor(r.score.total); })))) + '</span>' : '';
      return '<li class="step ' + cls + '"><span class="dot">' + (done ? '✓' : i > cur ? '🔒' : i + 1) + '</span><span class="step-name">' + name + '</span>' + stars + '</li>';
    }).join('') + '</ol>';
  }
  function badgesHTML(earned, showMissed, lv) {
    return '<ul class="badges">' + BADGES.filter(function (b) {
      if (b.id === 'scientist' && lv && !lv.pilot && earned.indexOf('scientist') < 0) return false;
      return showMissed || earned.indexOf(b.id) >= 0;
    }).map(function (b, i) {
      var got = earned.indexOf(b.id) >= 0;
      var desc = b.id === 'detective' && lv ? DETECTIVE_HINT[lv.type] : b.desc;
      return '<li class="badge ' + (got ? 'got' : 'missed') + '" style="animation-delay:' + (0.9 + i * 0.15) + 's"><span class="b-icon" aria-hidden="true">' + b.icon + '</span>' +
        '<span><b>' + b.name + '</b>' + (got ? '' : ' <span class="muted small">(missed)</span>') + '<br><span class="small muted">' + desc + '</span></span></li>';
    }).join('') + '</ul>';
  }
  function townSpecFor() {
    var spec = L().townSpec(state.world);
    spec.wards = state.world.wards; spec.history = state.world.history;
    return spec;
  }
  function worstWeek(m) { var tot = C.weekTotals(m); return tot.indexOf(S.max(tot)); }

  // ---------------------------------------------------------------- start
  function startScreen() {
    state = {};
    topbar();
    render(
      '<section class="hero card">' +
        '<p class="eyebrow">A data-science game about cause and effect</p>' +
        '<h1>Mayor for a Year</h1>' +
        '<p class="lead">You are the new mayor of <b>Navapuram</b>, a small Indian town. Each level gives you one problem, a budget and a dashboard of the town\'s data. ' +
        'The data always points somewhere. Your job is to work out whether it points at the <i>cause</i>.</p>' +
        M.town.advisorHTML('<p>Welcome, Mayor! I\'m Dr. Asha, your advisor. Five problems are waiting. Each one hides a <b>trap</b> in the data, and your policies run in a simulated town where we can see what really happens.</p>', 'happy') +
      '</section>' +
      '<div class="grid2">' +
        '<section class="card"><h2>What you will learn</h2><ol class="objectives">' +
          OBJECTIVES.map(function (o) { return '<li>' + o + '</li>'; }).join('') + '</ol></section>' +
        '<section class="card"><h2>How to play</h2><ol>' +
          '<li><b>Read the brief</b>: the problem, your goal and your budget.</li>' +
          '<li><b>Explore the data</b> with the tools you have unlocked so far.</li>' +
          '<li><b>Fund one policy.</b> From Level 4 you can test one first with a randomised pilot.</li>' +
          '<li><b>Watch the season.</b> The town runs twice, with and without your policy, using the same weather and luck, so you see your <i>true</i> impact.</li>' +
          '<li><b>See the reveal</b>: the hidden cause-and-effect diagram and the trap in the data.</li>' +
        '</ol><p class="muted small">Score per problem, out of 100: town wellbeing (your true impact compared with the best possible) up to 70, plus up to 30 for budget left, minus a penalty for money spent on a policy that didn\'t help.</p></section>' +
      '</div>' +
      '<section class="card"><h2>Start</h2>' +
        '<div class="form-row"><label for="player">Player tag <span class="muted">(optional, e.g. P3; please don\'t use your full name)</span></label>' +
        '<input id="player" maxlength="20" autocomplete="off"></div>' +
        '<div class="form-row"><label for="seed">Town seed <span class="muted">(the same seed builds the same town, so any game can be replayed)</span></label>' +
        '<input id="seed" maxlength="20" value="' + M.rng.randomSeed() + '" autocomplete="off"></div>' +
        '<button class="btn primary" id="go">Start as mayor →</button>' +
      '</section>'
    );
    q('#go').addEventListener('click', function () {
      var seed = q('#seed').value.trim() || M.rng.randomSeed();
      var player = q('#player').value.trim();
      M.log.start(seed, player);
      M.log.event('game_start', { seed: seed });
      state = { seed: seed, player: player, results: [], levelIdx: 0, termSpent: 0, quiz: {} };
      quizScreen('pre');
    });
  }

  // ---------------------------------------------------------------- quizzes (optional, before Level 1 and after Level 5)
  function quizScreen(which) {
    var set = M.quiz[which];
    state.level = null;
    topbar();
    render(
      '<section class="card"><p class="eyebrow">' + (which === 'pre' ? 'Before you start' : 'After the final term') + '</p>' +
        '<h1>' + (which === 'pre' ? 'Warm-up: 3 quick questions' : 'Check-out: 3 quick questions') + '</h1>' +
        M.town.advisorHTML('<p>' + (which === 'pre' ? 'Before you take office, answer three short questions. There are no marks and you can skip it. It helps us see what the game teaches.' :
          'One last thing: three new questions, like the warm-up. Let\'s see what you think now.') + '</p>', 'neutral') + '</section>' +
      '<form id="quiz">' + set.map(function (it, i) {
        return '<fieldset class="card quiz-q"><legend><b>Q' + (i + 1) + '.</b> ' + it.q + '</legend>' + it.options.map(function (o, j) {
          return '<label class="quiz-opt"><input type="radio" name="q' + i + '" value="' + j + '"> <span>' + o + '</span></label>';
        }).join('') + '<div class="quiz-fb" id="fb' + i + '"></div></fieldset>';
      }).join('') + '</form>' +
      '<div class="actions" id="qact"><button class="btn" id="skip">Skip</button><button class="btn primary" id="submit">Submit answers</button></div>'
    );
    q('#skip').addEventListener('click', function () { M.log.event('quiz_skip', { which: which }); next(); });
    q('#submit').addEventListener('click', function () {
      var answers = set.map(function (_, i) { var r = q('input[name=q' + i + ']:checked'); return r ? +r.value : null; });
      if (answers.some(function (a) { return a === null; })) { alert('Please answer all three (or press Skip).'); return; }
      var correct = answers.map(function (a, i) { return a === set[i].correct ? 1 : 0; });
      var total = correct.reduce(function (a, b) { return a + b; }, 0);
      state.quiz[which] = { answers: answers, correct: correct, score: total };
      M.log.quiz(which, { answers: answers, correct: correct, score: total, concepts: set.map(function (x) { return x.concept; }) });
      if (which === 'post') { // the check-out shows the right answers, the warm-up does not
        set.forEach(function (it, i) {
          q('#fb' + i).innerHTML = (correct[i] ? '<span class="tag good">✓ Correct</span> ' : '<span class="tag bad">✗ Not quite</span> ') + it.why;
        });
        qa('#quiz input').forEach(function (x) { x.disabled = true; });
        q('#qact').innerHTML = '<button class="btn primary" id="cont">Continue →</button>';
        q('#cont').addEventListener('click', next);
      } else next();
    });
    function next() { if (which === 'pre') loadLevel(0); else feedbackScreen(); }
  }

  // ---------------------------------------------------------------- level setup
  function loadLevel(idx) {
    var lv = M.levels[idx];
    state.levelIdx = idx;
    state.level = lv;
    state.world = C.generateWithTrap(lv.model, state.seed + '-L' + lv.id);
    state.vars = lv.model.variables(state.world);
    state.toolsUsed = {}; state.flags = {}; state.choice = null; state.pilots = []; state.weeksUsed = 0;
    state.tsSel = lv.defaultSeries ? lv.defaultSeries.slice() : [lv.model.outcome];
    state.sc = { x: lv.defaultX || state.vars[0].key, y: lv.model.outcome, mode: lv.defaultMode || 'wardweek' };
    state.lastTab = null; state.map = null; state.townT = null; state.exploreStart = null;
    state.lag = null; state.sp = null; state.u = null;
    M.log.event('level_start', { level: lv.id, tries: state.world.tries });
    briefScreen();
  }

  // ---------------------------------------------------------------- brief
  function briefScreen() {
    var lv = L(), w = state.world;
    var paper = lv.headline ? lv.headline(w) : null;
    topbar();
    render(
      levelPath() +
      '<section class="card"><p class="eyebrow">' + levelLabel(lv) + '</p><h1>' + esc(lv.title) + '</h1>' +
        M.town.advisorHTML(lv.story(w).map(function (p) { return '<p>' + p + '</p>'; }).join(''), 'worried') + '</section>' +
      (isPanel() ?
        '<section class="card town-card"><div class="town-title"><h2>Navapuram, last year</h2>' +
        '<button class="btn small-btn" id="replay">▶ Replay the year</button></div><div id="town"></div></section>' :
        '<section class="card"><h2>Last year\'s exam, every student</h2><div id="classview"></div></section>') +
      '<div class="grid2">' +
        (paper ? '<section class="card paper-card">' + M.fx.newspaper(paper.head, paper.sub, paper.edition) + '</section>' : '') +
        '<section class="card goal"><h2>Your goal</h2><p>' + lv.goal + '</p><ul>' +
          (lv.shared ? '<li>Term budget left: <b>' + lakh(termLeft()) + '</b>, shared by the three final problems.</li>' : '<li>Budget: <b>' + lakh(lv.model.budget) + '</b>.</li>') +
          '<li>You can fund <b>one</b> policy. What really causes what is <b>hidden</b>.</li>' +
          (lv.pilot ? '<li>You may run a <b>randomised pilot</b> first: ₹' + lv.pilot.cost + ' lakh and ' + lv.pilot.weeks + ' weeks of the season.</li>' : '') +
          '<li>Afterwards the game simulates the season and shows your true impact.</li></ul></section>' +
      '</div>' +
      '<section class="card"><h2>' + (lv.newTools.length ? 'New tools unlocked' : 'Tools') + '</h2>' +
        (lv.newTools.length ? '<ul class="tools">' + lv.newTools.map(function (t) { return '<li><b>' + t.name + '</b>: ' + t.desc + '</li>'; }).join('') + '</ul>' :
          '<p>Every tool from the earlier levels is open.</p>') + '</section>' +
      '<div class="actions"><button class="btn primary" id="go">Open the data dashboard →</button></div>'
    );
    q('#go').addEventListener('click', exploreScreen);
    if (!isPanel()) { classView(q('#classview'), w.history, { key: 'A', compact: true }); return; }
    var spec = townSpecFor(), h = w.history;
    spec.budget = lv.shared ? termLeft() : lv.model.budget;
    var town = M.town.create(q('#town'), spec);
    var n = w.weeks.length, pk = worstWeek(h[lv.model.outcome]);
    function show(t, suffix) { town.update(M.town.frameAt(h, t, 'Week ' + w.weeks[t] + (suffix || ''), spec)); }
    function play() {
      var t = 0;
      stopTimers();
      if (M.fx.reduced) { show(pk, ' (worst)'); return; }
      show(0);
      every(function () { t++; if (t >= n) { stopTimers(); show(pk, ' (worst)'); return; } show(t); }, 170);
    }
    q('#replay').addEventListener('click', play);
    play();
  }

  // ---------------------------------------------------------------- explore
  function exploreScreen() {
    var lv = L();
    if (!state.exploreStart) state.exploreStart = Date.now();
    topbar();
    render(
      '<section class="card slim"><p class="eyebrow">' + levelLabel(lv) + ': ' + esc(lv.title) + '</p>' +
        '<p class="goal-line">' + lv.goal + ' Money available: ' + lakh(budgetLeft()) + '.</p></section>' +
      '<div class="card slim">' + M.town.advisorHTML(lv.advisor.explore, 'neutral') + '</div>' +
      '<nav class="tabs" role="tablist">' + lv.tools.map(function (t) {
        return '<button role="tab" class="tab" data-tab="' + t + '">' + TAB_NAMES[t] + '</button>';
      }).join('') + '</nav>' +
      '<section class="card" id="panel"></section>' +
      '<div class="actions sticky"><button class="btn primary" id="to-desk">I\'ve decided. Go to the policy desk →</button></div>'
    );
    qa('.tab').forEach(function (b) { b.addEventListener('click', function () { showTool(b.getAttribute('data-tab')); }); });
    q('#to-desk').addEventListener('click', deskScreen);
    showTool(state.lastTab || lv.tools[0]);
  }
  function showTool(tab) {
    state.lastTab = tab;
    state.toolsUsed[tab] = true;
    qa('.tab').forEach(function (x) { x.classList.toggle('active', x.getAttribute('data-tab') === tab); });
    M.log.event('tool_view', { level: L().id, tool: tab });
    stopTimers(); CH.hideTip();
    ({ town: toolTown, map: toolMap, timeseries: toolTimeseries, scatter: toolScatter, lag: toolLag, splitp: toolSplitPanel,
      table: isPanel() ? toolTable : toolUnitsTable, class: toolClass, compare: toolCompare, split: toolSplitUnits })[tab](q('#panel'));
  }
  function wardOptions(includeTown) {
    var o = includeTown ? '<option value="town">Whole town (average of 20 wards)</option>' : '';
    state.world.wards.forEach(function (w, i) { o += '<option value="' + i + '">Ward ' + (i + 1) + ': ' + esc(w.name) + '</option>'; });
    return o;
  }
  function varOptions(sel, filter) {
    return state.vars.filter(filter || function () { return true; }).map(function (v) {
      return '<option value="' + v.key + '"' + (v.key === sel ? ' selected' : '') + '>' + esc(v.label) + '</option>';
    }).join('');
  }

  // ----- ward-week (panel) tools
  function toolTown(panel) {
    var w = state.world, h = w.history, n = w.weeks.length;
    if (state.townT === null || state.townT === undefined) state.townT = worstWeek(h[L().model.outcome]);
    panel.innerHTML = '<div class="toolbar"><button class="btn small-btn" id="tplay">▶ Play</button>' +
      '<input type="range" id="twk" min="0" max="' + (n - 1) + '" value="' + state.townT + '" aria-label="Week"></div><div id="town"></div>' +
      '<p class="muted small">Hover or tap a ward to see its exact numbers. Icon counts are rounded, so check the numbers before you decide.</p>';
    var spec = townSpecFor(), town = M.town.create(panel.querySelector('#town'), spec);
    function paint() { town.update(M.town.frameAt(h, state.townT, 'Week ' + w.weeks[state.townT], spec)); panel.querySelector('#twk').value = state.townT; }
    var playing = false, btn = panel.querySelector('#tplay');
    function stop() { playing = false; stopTimers(); btn.textContent = '▶ Play'; }
    btn.addEventListener('click', function () {
      if (playing) { stop(); return; }
      playing = true; btn.textContent = '❚❚ Pause';
      if (state.townT >= n - 1) state.townT = 0;
      every(function () { state.townT++; paint(); if (state.townT >= n - 1) stop(); }, 200);
      M.log.event('town_play', { level: L().id });
    });
    panel.querySelector('#twk').addEventListener('input', function (e) { stop(); state.townT = +e.target.value; paint(); });
    paint();
  }

  function toolMap(panel) {
    var h = state.world.history, w = state.world;
    if (!state.map) state.map = { left: L().model.outcome, right: L().defaultX || state.vars[0].key, mode: 'week', t: worstWeek(h[L().model.outcome]) };
    var m = state.map;
    panel.innerHTML = '<div class="toolbar"><label>Left map <select id="ml">' + varOptions(m.left) + '</select></label>' +
      '<label>Right map <select id="mr">' + varOptions(m.right) + '</select></label></div>' +
      '<div class="toolbar radios" role="radiogroup" aria-label="Time"><label><input type="radio" name="mm" value="week"' + (m.mode === 'week' ? ' checked' : '') + '> One week at a time</label>' +
      '<label><input type="radio" name="mm" value="avg"' + (m.mode === 'avg' ? ' checked' : '') + '> Each ward\'s yearly average</label></div>' +
      '<div class="toolbar" id="timebar"><button class="btn small-btn" id="play">▶ Play</button>' +
      '<input type="range" id="wk" min="0" max="' + (w.weeks.length - 1) + '" value="' + m.t + '" aria-label="Week"><span class="week-label" id="wklab"></span></div>' +
      '<div class="maps"><div id="mapL"></div><div id="mapR"></div></div>' +
      '<p class="muted small">Darker = higher. Each map has its own scale (in yearly-average mode it runs from the lowest ward to the highest). Hover or tap a ward for its value.</p>';
    var maps = {};
    function build() {
      ['left', 'right'].forEach(function (side) {
        var v = varByKey(m[side]), mat = h[v.key], avg = m.mode === 'avg', means = C.wardMeans(mat);
        maps[side] = CH.townMap(panel.querySelector(side === 'left' ? '#mapL' : '#mapR'), { wards: w.wards,
          min: avg ? S.min(means) : 0, max: avg ? S.max(means) : S.max(C.flatten(mat)),
          title: v.label + (avg ? ', yearly average' : ''), unit: v.unit, dp: avg ? v.dp + 1 : v.dp });
      });
      panel.querySelector('#timebar').style.display = m.mode === 'avg' ? 'none' : '';
      paint();
      if (m.mode === 'avg') state.flags.wardavg = true;
      M.log.event('map_view', { level: L().id, left: m.left, right: m.right, mode: m.mode });
    }
    function paint() {
      ['left', 'right'].forEach(function (side) {
        var mat = h[m[side]];
        maps[side].update(m.mode === 'avg' ? C.wardMeans(mat) : mat.map(function (row) { return row[m.t]; }));
      });
      panel.querySelector('#wk').value = m.t;
      panel.querySelector('#wklab').textContent = 'Week ' + w.weeks[m.t];
    }
    var playing = false, playBtn = panel.querySelector('#play');
    function stop() { playing = false; stopTimers(); playBtn.textContent = '▶ Play'; }
    playBtn.addEventListener('click', function () {
      if (playing) { stop(); return; }
      playing = true; playBtn.textContent = '❚❚ Pause';
      if (m.t >= w.weeks.length - 1) m.t = 0;
      every(function () { m.t++; paint(); if (m.t >= w.weeks.length - 1) stop(); }, 140);
    });
    panel.querySelector('#wk').addEventListener('input', function (e) { stop(); m.t = +e.target.value; paint(); });
    panel.querySelector('#ml').addEventListener('change', function (e) { m.left = e.target.value; build(); });
    panel.querySelector('#mr').addEventListener('change', function (e) { m.right = e.target.value; build(); });
    qa('#panel input[name=mm]').forEach(function (rb) { rb.addEventListener('change', function () { stop(); m.mode = rb.value; build(); }); });
    build();
  }

  function toolTable(panel) {
    var vars = state.vars, h = state.world.history;
    panel.innerHTML = '<div class="toolbar"><label>Ward <select id="ward">' + wardOptions(false) + '</select></label>' +
      '<button class="btn" id="csv">Download all wards as CSV</button></div>' +
      '<div class="table-wrap"><table class="data"><thead><tr><th>Week</th>' +
      vars.map(function (v) { return '<th>' + esc(v.label) + '<br><span class="unit">' + esc(v.unit) + '</span></th>'; }).join('') +
      '</tr></thead><tbody></tbody></table></div>';
    function fill() {
      var w = +panel.querySelector('#ward').value, rows = '';
      for (var t = 0; t < state.world.weeks.length; t++) {
        rows += '<tr><td>' + state.world.weeks[t] + '</td>' + vars.map(function (v) { return '<td>' + fmt(h[v.key][w][t], v.dp) + '</td>'; }).join('') + '</tr>';
      }
      panel.querySelector('tbody').innerHTML = rows;
    }
    panel.querySelector('#ward').addEventListener('change', fill);
    panel.querySelector('#csv').addEventListener('click', function () {
      var lines = ['ward,ward_name,week,' + vars.map(function (v) { return slug(v.label); }).join(',')];
      state.world.wards.forEach(function (wd, w) {
        state.world.weeks.forEach(function (wk, t) {
          lines.push((w + 1) + ',"' + wd.name + '",' + wk + ',' + vars.map(function (v) { return +h[v.key][w][t].toFixed(v.dp + 1); }).join(','));
        });
      });
      M.log.event('data_download', { level: L().id });
      M.log.download('navapuram_level' + L().id + '_seed' + state.seed + '.csv', lines.join('\n') + '\n', 'text/csv');
    });
    fill();
  }
  function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }

  function toolTimeseries(panel) {
    var vars = state.vars;
    panel.innerHTML = '<div class="toolbar"><label>Area <select id="area">' + wardOptions(true) + '</select></label></div>' +
      '<fieldset class="checks"><legend>Show up to 3 measures</legend>' + vars.map(function (v) {
        return '<label class="check"><input type="checkbox" value="' + v.key + '"' + (state.tsSel.indexOf(v.key) >= 0 ? ' checked' : '') + '>' +
          '<span class="sw" style="background:' + varColor(v.key) + '"></span>' + esc(v.label) + '</label>';
      }).join('') + '</fieldset><div id="ts"></div>' +
      '<p class="muted small">Each line is scaled to its own yearly peak (100%), so you can compare <b>timing</b> on one axis. Hover or tap to see the real values.</p>';
    function draw() {
      var area = panel.querySelector('#area').value, h = state.world.history;
      var series = state.tsSel.map(function (k) {
        var v = varByKey(k);
        var raw = area === 'town' ? C.weekMeans(h[k]) : h[k][+area].slice();
        var peak = S.max(raw) || 1;
        return { name: v.label, values: raw.map(function (x) { return 100 * x / peak; }), tipValues: raw, unit: v.unit, dp: v.dp, color: varColor(k) };
      });
      CH.lineChart(panel.querySelector('#ts'), { x: state.world.weeks, xLabel: 'Week', yLabel: '% of its yearly peak', series: series, yMin: 0, yMax: 105 });
      M.log.event('timeseries_view', { level: L().id, vars: state.tsSel.join('|'), area: area });
    }
    qa('#panel input[type=checkbox]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var k = cb.value;
        if (cb.checked) { state.tsSel.push(k); if (state.tsSel.length > 3) { var drop = state.tsSel.shift(); panel.querySelector('input[value="' + drop + '"]').checked = false; } }
        else state.tsSel = state.tsSel.filter(function (x) { return x !== k; });
        draw();
      });
    });
    panel.querySelector('#area').addEventListener('change', draw);
    draw();
  }

  function toolScatter(panel) {
    var vars = state.vars;
    panel.innerHTML = '<div class="toolbar"><label>Across (x) <select id="sx">' + varOptions(state.sc.x) + '</select></label>' +
      '<label>Up (y) <select id="sy">' + varOptions(state.sc.y) + '</select></label></div>' +
      '<div class="toolbar radios" role="radiogroup" aria-label="What each dot is">' +
      '<label><input type="radio" name="mode" value="wardweek"' + (state.sc.mode === 'wardweek' ? ' checked' : '') + '> Each dot = one ward in one week (1,040 dots)</label>' +
      '<label><input type="radio" name="mode" value="ward"' + (state.sc.mode === 'ward' ? ' checked' : '') + '> Each dot = one ward\'s yearly average (20 dots)</label></div>' +
      '<div class="r-big" id="rbig"></div><div id="sc"></div>' +
      '<h3>Correlation of every measure with <span id="ylab"></span> <span class="muted small">(in this view)</span></h3><div id="rtable"></div>';
    function series(k) { var m = state.world.history[k]; return state.sc.mode === 'ward' ? C.wardMeans(m) : C.flatten(m); }
    function draw() {
      var xs = series(state.sc.x), ys = series(state.sc.y), vx = varByKey(state.sc.x), vy = varByKey(state.sc.y);
      var nT = state.world.weeks.length;
      var pts = xs.map(function (x, i) {
        var label = state.sc.mode === 'ward' ? 'Ward ' + (i + 1) + ': ' + state.world.wards[i].name : 'Ward ' + (Math.floor(i / nT) + 1) + ', week ' + state.world.weeks[i % nT];
        return { x: x, y: ys[i], label: label };
      });
      var r = S.pearson(xs, ys);
      if (state.sc.mode === 'ward') state.flags.wardavg = true;
      panel.querySelector('#rbig').innerHTML = 'r = <b>' + signed(r, 2) + '</b> <span class="muted">(n = ' + fmt(xs.length) + ' dots)</span>';
      CH.scatter(panel.querySelector('#sc'), { points: pts, xLabel: vx.label, yLabel: vy.label, xUnit: vx.unit, yUnit: vy.unit,
        xdp: vx.dp, ydp: vy.dp, color: 'var(--s1)', small: state.sc.mode === 'ward' });
      panel.querySelector('#ylab').textContent = vy.label;
      panel.querySelector('#rtable').innerHTML = rTable(vars.filter(function (v) { return v.key !== state.sc.y; }).map(function (v) {
        return { label: v.label, r: S.pearson(series(v.key), ys) };
      }));
      M.log.event('scatter_view', { level: L().id, x: state.sc.x, y: state.sc.y, mode: state.sc.mode, r: +r.toFixed(3) });
    }
    panel.querySelector('#sx').addEventListener('change', function (e) { state.sc.x = e.target.value; draw(); });
    panel.querySelector('#sy').addEventListener('change', function (e) { state.sc.y = e.target.value; draw(); });
    qa('#panel input[name=mode]').forEach(function (rb) { rb.addEventListener('change', function () { state.sc.mode = rb.value; draw(); }); });
    draw();
  }
  function rTable(rows, first) {
    return '<table class="rtable"><thead><tr><th>' + (first || 'Measure') + '</th><th class="num">r</th><th>strength</th></tr></thead><tbody>' +
      rows.map(function (x) {
        var rv = x.r;
        return '<tr><td>' + esc(x.label) + (x.n ? ' <span class="muted small">(n = ' + fmt(x.n) + ')</span>' : '') + '</td><td class="num">' + (isNaN(rv) ? '–' : signed(rv, 2)) + '</td><td class="bar-cell"><span class="rbar ' + (rv < 0 ? 'neg' : '') + '" style="width:' + Math.round(Math.abs(rv || 0) * 100) + '%"></span></td></tr>';
      }).join('') + '</tbody></table>';
  }

  /* What changed first? Event study: when X jumped, what was Y doing before and after? */
  function toolLag(panel) {
    if (!state.lag) state.lag = { x: L().lagX || state.vars[0].key, y: L().model.outcome };
    var lg = state.lag;
    panel.innerHTML = '<div class="toolbar"><label>When this jumped <select id="lx">' + varOptions(lg.x) + '</select></label>' +
      '<label>…what was this doing? <select id="ly">' + varOptions(lg.y) + '</select></label></div>' +
      '<div id="lagchart"></div><p class="callout" id="lagsum"></p>' +
      '<p class="muted small">How it works: find every ward-week where the first measure jumped (one of its biggest week-to-week rises). Line those weeks up at 0 and average the second measure around them, each ward compared with its own usual level (100%). If it was already high <b>before</b> week 0, it moved first.</p>';
    function draw() {
      var h = state.world.history, vx = varByKey(lg.x), vy = varByKey(lg.y);
      var ev = S.eventStudy(h[lg.x], h[lg.y], 6);
      state.flags.lag = true;
      M.log.event('lag_view', { level: L().id, x: lg.x, y: lg.y, events: ev.n });
      if (!ev.n) {
        panel.querySelector('#lagchart').innerHTML = '';
        panel.querySelector('#lagsum').innerHTML = '<b>' + esc(vx.label) + '</b> never jumped last year (it stayed the same), so there is nothing to line up. Try another measure.';
        return;
      }
      CH.lineChart(panel.querySelector('#lagchart'), { x: ev.ks, xLabel: 'Weeks before (−) and after (+) a jump in ' + vx.label.toLowerCase(),
        yLabel: vy.label + ', % of usual', yMin: 0, yMax: Math.max(110, S.max(ev.means.filter(isFinite)) * 100 * 1.1),
        series: [{ name: vy.label, values: ev.means.map(function (m) { return 100 * m; }), color: 'var(--s1)', unit: '% of usual' },
          { name: 'Usual level', values: ev.ks.map(function () { return 100; }), color: 'var(--muted)', dash: true, unit: '%' }] });
      var i0 = ev.ks.indexOf(0), before = S.mean(ev.means.slice(i0 - 3, i0)), after = S.mean(ev.means.slice(i0 + 1, i0 + 4));
      panel.querySelector('#lagsum').innerHTML = 'Across <b>' + ev.n + '</b> jumps in ' + esc(vx.label.toLowerCase()) + ': in the 3 weeks <b>before</b>, ' + esc(vy.label.toLowerCase()) +
        ' was at <b>' + Math.round(before * 100) + '%</b> of usual; in the 3 weeks <b>after</b>, <b>' + Math.round(after * 100) + '%</b>.';
    }
    panel.querySelector('#lx').addEventListener('change', function (e) { lg.x = e.target.value; draw(); });
    panel.querySelector('#ly').addEventListener('change', function (e) { lg.y = e.target.value; draw(); });
    draw();
  }

  /* Split by group (ward-week levels): the link between X and Y inside low / middle / high groups of Z. */
  function toolSplitPanel(panel) {
    var keys = state.vars.map(function (v) { return v.key; });
    if (!state.sp) { var x0 = L().defaultX || keys[0]; state.sp = { x: x0, y: L().model.outcome, z: keys[0] === x0 ? keys[1] : keys[0] }; }
    var sp = state.sp;
    panel.innerHTML = '<div class="toolbar"><label>Link between <select id="px">' + varOptions(sp.x) + '</select></label>' +
      '<label>and <select id="py">' + varOptions(sp.y) + '</select></label>' +
      '<label>split by <select id="pz">' + varOptions(sp.z) + '</select></label></div><div id="splitout"></div>' +
      '<p class="muted small">The ward-weeks are split into three equal-sized groups on the third measure (low / middle / high). Inside a group that measure is roughly the same, so it can\'t explain the link there. If the link vanishes inside the groups, the third measure was behind it. If it survives, the third measure wasn\'t the explanation (but something you can\'t see might be).</p>';
    function draw() {
      var h = state.world.history, X = C.flatten(h[sp.x]), Y = C.flatten(h[sp.y]), Z = C.flatten(h[sp.z]);
      var sorted = Z.slice().sort(function (a, b) { return a - b; });
      var c1 = sorted[Math.floor(sorted.length / 3)], c2 = sorted[Math.floor(2 * sorted.length / 3)];
      var groups = [[], [], []];
      Z.forEach(function (z, i) { groups[z < c1 ? 0 : z < c2 ? 1 : 2].push(i); });
      var vz = varByKey(sp.z);
      var rows = [{ label: 'All ward-weeks together', r: S.pearson(X, Y), n: X.length }].concat(groups.map(function (g, j) {
        return { label: ['Low', 'Middle', 'High'][j] + ' ' + vz.label.toLowerCase(), r: S.pearson(g.map(function (i) { return X[i]; }), g.map(function (i) { return Y[i]; })), n: g.length };
      }));
      panel.querySelector('#splitout').innerHTML = '<h3>r between ' + esc(varByKey(sp.x).label.toLowerCase()) + ' and ' + esc(varByKey(sp.y).label.toLowerCase()) + '</h3>' + rTable(rows, 'Group');
      state.flags.splitp = true;
      M.log.event('split_view', { level: L().id, x: sp.x, y: sp.y, z: sp.z });
    }
    ['x', 'y', 'z'].forEach(function (k) { panel.querySelector('#p' + k).addEventListener('change', function (e) { sp[k] = e.target.value; draw(); }); });
    draw();
  }

  // ----- student (units) tools
  function progOptions(sel) {
    var w = state.world;
    return ['A', 'B'].map(function (k) { return '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(w.progs[k].name) + '</option>'; }).join('');
  }
  function uState() { if (!state.u) state.u = { prog: 'A', by: 'group', page: 0 }; return state.u; }
  function meanOf(rows, key) { return S.mean(rows.map(function (r) { return r[key]; })); }

  function toolUnitsTable(panel) {
    var u = uState(), rows = state.world.history, vars = state.vars, per = 25, pages = Math.ceil(rows.length / per);
    function draw() {
      var slice = rows.slice(u.page * per, (u.page + 1) * per);
      panel.innerHTML = '<div class="toolbar"><button class="btn small-btn" id="prev">← Prev</button><span>Students ' + (u.page * per + 1) + '–' + Math.min(rows.length, (u.page + 1) * per) + ' of ' + fmt(rows.length) + '</span>' +
        '<button class="btn small-btn" id="nextp">Next →</button><button class="btn" id="csv">Download all as CSV</button></div>' +
        '<div class="table-wrap"><table class="data"><thead><tr><th>Student</th>' + vars.map(function (v) { return '<th>' + esc(v.label) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        slice.map(function (r) {
          return '<tr><td>' + r.id + '</td>' + vars.map(function (v) { return '<td>' + (v.cat ? v.cat[r[v.key]] : fmt(r[v.key], v.dp)) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>';
      panel.querySelector('#prev').addEventListener('click', function () { u.page = Math.max(0, u.page - 1); draw(); });
      panel.querySelector('#nextp').addEventListener('click', function () { u.page = Math.min(pages - 1, u.page + 1); draw(); });
      panel.querySelector('#csv').addEventListener('click', function () {
        var lines = ['student,' + vars.map(function (v) { return slug(v.label); }).join(',')];
        rows.forEach(function (r) { lines.push(r.id + ',' + vars.map(function (v) { return v.cat ? v.cat[r[v.key]] : r[v.key].toFixed(1); }).join(',')); });
        M.log.event('data_download', { level: L().id });
        M.log.download('navapuram_students_seed' + state.seed + '.csv', lines.join('\n') + '\n', 'text/csv');
      });
    }
    draw();
  }

  function toolClass(panel) {
    var u = uState();
    panel.innerHTML = '<div class="toolbar"><label>Colour students who attend <select id="cp">' + progOptions(u.prog) + '</select></label></div><div id="classview"></div>';
    function draw() { classView(panel.querySelector('#classview'), state.world.history, { key: u.prog }); M.log.event('class_view', { level: L().id, prog: u.prog }); }
    panel.querySelector('#cp').addEventListener('change', function (e) { u.prog = e.target.value; draw(); });
    draw();
  }
  /* Class view: every student is a dot placed by exam score, in one row per prior-marks group.
   * Blue = attends the chosen programme. Short lines mark each colour's average in the row. */
  function classView(container, rows, opt) {
    var Wd = 680, rowH = 96, top = 30, Hh = top + 3 * rowH + 40, ml = 70, mr = 20;
    var key = opt.key, prog = state.world.progs[key];
    var px = function (v) { return ml + v / 100 * (Wd - ml - mr); };
    var jr = new M.rng.Rng('class-jitter');
    var s = '<svg viewBox="0 0 ' + Wd + ' ' + Hh + '" class="chart classview" role="img" aria-label="Students by exam score and prior-marks group">';
    s += '<text x="' + ml + '" y="18" class="axis-title">Final exam score →   <tspan class="att-ink">● attends ' + esc(prog.name.toLowerCase()) + '</tspan>   <tspan class="no-ink">● does not</tspan></text>';
    [0, 1, 2].forEach(function (g) {
      var y0 = top + (2 - g) * rowH;
      s += '<rect x="' + ml + '" y="' + (y0 + 4) + '" width="' + (Wd - ml - mr) + '" height="' + (rowH - 8) + '" rx="8" class="class-row"/>';
      s += '<text x="' + (ml - 8) + '" y="' + (y0 + rowH / 2 + 4) + '" text-anchor="end" class="axis-title">' + M.scm.l3.GROUPS[g] + '</text>';
      var inG = rows.filter(function (r) { return r.group === g; });
      inG.forEach(function (r) {
        var yy = y0 + 10 + jr.uniform() * (rowH - 20);
        s += '<circle cx="' + px(r.final).toFixed(1) + '" cy="' + yy.toFixed(1) + '" r="2.6" class="sdot ' + (r[key] ? 'att' : 'no') + '"/>';
      });
      var ma = meanOf(inG.filter(function (r) { return r[key]; }), 'final'), mn = meanOf(inG.filter(function (r) { return !r[key]; }), 'final');
      [[mn, 'no'], [ma, 'att']].forEach(function (pr) {
        if (isNaN(pr[0])) return;
        s += '<line x1="' + px(pr[0]) + '" x2="' + px(pr[0]) + '" y1="' + (y0 + 4) + '" y2="' + (y0 + rowH - 4) + '" class="meanline ' + pr[1] + '"/>';
      });
      s += '<text x="' + (Wd - mr - 6) + '" y="' + (y0 + 18) + '" text-anchor="end" class="row-note">attends ' + (isNaN(ma) ? '–' : ma.toFixed(1)) + ' · others ' + mn.toFixed(1) + '</text>';
    });
    [0, 20, 40, 60, 80, 100].forEach(function (v) { s += '<text x="' + px(v) + '" y="' + (top + 3 * rowH + 16) + '" text-anchor="middle">' + v + '</text>'; });
    s += '<text x="' + ml + '" y="' + (Hh - 4) + '" class="axis-title">Rows: last year\'s marks group (High at the top)</text></svg>';
    var all = meanOf(rows.filter(function (r) { return r[key]; }), 'final') - meanOf(rows.filter(function (r) { return !r[key]; }), 'final');
    container.innerHTML = s + '<p class="small">All students together: attenders score <b>' + signed(all, 1) + '</b> marks compared with others.' +
      (opt.compact ? '' : ' Short vertical lines show each colour\'s average inside a row.') + '</p>';
  }

  function barsHTML(items, max) { // items: [{label, value, cls, note}]
    return '<div class="hbars">' + items.map(function (it) {
      return '<div class="hbar-row"><span class="hbar-lbl">' + it.label + '</span><span class="hbar-track"><span class="hbar ' + (it.cls || '') + '" style="width:' + Math.max(0, it.value / max * 100).toFixed(1) + '%"></span></span><span class="hbar-val">' + it.value.toFixed(1) + (it.note ? ' <span class="muted small">' + it.note + '</span>' : '') + '</span></div>';
    }).join('') + '</div>';
  }
  function toolCompare(panel) {
    var u = uState();
    panel.innerHTML = '<div class="toolbar"><label>Programme <select id="cp">' + progOptions(u.prog) + '</select></label></div><div id="cmp"></div>';
    function draw() {
      var rows = state.world.history, att = rows.filter(function (r) { return r[u.prog]; }), no = rows.filter(function (r) { return !r[u.prog]; });
      var a = meanOf(att, 'final'), b = meanOf(no, 'final');
      panel.querySelector('#cmp').innerHTML = '<h3>Average final exam score</h3>' + barsHTML([
        { label: 'Attend', value: a, cls: 'att', note: '(' + att.length + ' students)' },
        { label: 'Don\'t attend', value: b, cls: 'no', note: '(' + no.length + ' students)' }], 100) +
        '<p class="r-big">Difference: <b>' + signed(a - b, 1) + '</b> marks</p>';
      M.log.event('compare_view', { level: L().id, prog: u.prog, diff: +(a - b).toFixed(2) });
    }
    panel.querySelector('#cp').addEventListener('change', function (e) { u.prog = e.target.value; draw(); });
    draw();
  }
  function toolSplitUnits(panel) {
    var u = uState();
    var catVars = state.vars.filter(function (v) { return v.cat && v.key !== 'A' && v.key !== 'B'; });
    panel.innerHTML = '<div class="toolbar"><label>Programme <select id="cp">' + progOptions(u.prog) + '</select></label>' +
      '<label>Split by <select id="sb">' + catVars.map(function (v) { return '<option value="' + v.key + '"' + (v.key === u.by ? ' selected' : '') + '>' + esc(v.label) + '</option>'; }).join('') + '</select></label></div><div id="spl"></div>';
    function draw() {
      var rows = state.world.history, v = varByKey(u.by), html = '';
      var diffs = v.cat.map(function (name, j) {
        var g = rows.filter(function (r) { return r[u.by] === j; }), att = g.filter(function (r) { return r[u.prog]; }), no = g.filter(function (r) { return !r[u.prog]; });
        var a = meanOf(att, 'final'), b = meanOf(no, 'final');
        html += '<div class="split-group"><h3>' + esc(v.label) + ': ' + name + ' <span class="muted small">(' + g.length + ' students)</span></h3>' +
          barsHTML([{ label: 'Attend', value: a || 0, cls: 'att', note: '(' + att.length + ')' }, { label: 'Don\'t attend', value: b || 0, cls: 'no', note: '(' + no.length + ')' }], 100) +
          '<p>Difference: <b>' + (att.length && no.length ? signed(a - b, 1) : '–') + '</b> marks</p></div>';
        return a - b;
      });
      panel.querySelector('#spl').innerHTML = '<div class="split-grid">' + html + '</div>';
      if (u.by === 'group') state.flags.splitGroup = true;
      M.log.event('split_view', { level: L().id, prog: u.prog, by: u.by, diffs: diffs.map(function (d) { return +(d || 0).toFixed(2); }).join('|') });
    }
    panel.querySelector('#cp').addEventListener('change', function (e) { u.prog = e.target.value; draw(); });
    panel.querySelector('#sb').addEventListener('change', function (e) { u.by = e.target.value; draw(); });
    draw();
  }

  // ---------------------------------------------------------------- policy desk (and pilots)
  function deskScreen() {
    var lv = L(), pols = lv.model.policies(state.world), avail = budgetLeft();
    var H = lv.model.horizon, canPilot = lv.pilot && state.pilots.length < lv.pilot.max && state.weeksUsed + lv.pilot.weeks <= H - 4 && avail >= lv.pilot.cost;
    topbar();
    render(
      '<section class="card"><p class="eyebrow">' + levelLabel(lv) + ': policy desk</p><h1>Fund one policy</h1>' +
      '<p>' + lv.goal + ' Money available: <b>' + lakh(avail) + '</b>' + (lv.shared ? ' (shared term budget)' : '') + '. Any money you don\'t spend adds to your score.</p>' +
      (state.pilots.length ? '<p>Season weeks left after your pilot' + (state.pilots.length > 1 ? 's' : '') + ': <b>' + (H - state.weeksUsed) + ' of ' + H + '</b>. Your roll-out starts in week ' + (state.weeksUsed + 1) + '.</p>' : '') +
      M.town.advisorHTML(lv.advisor.desk, 'neutral') + '</section>' +
      (state.pilots.length ? '<section class="card"><h2>Your pilot results</h2>' + state.pilots.map(pilotSummaryHTML).join('') + '</section>' : '') +
      '<div class="policies" role="radiogroup">' + pols.map(function (p) {
        var tooMuch = p.cost > avail;
        return '<label class="policy card' + (tooMuch ? ' disabled' : '') + '"><input type="radio" name="pol" value="' + p.id + '"' + (tooMuch ? ' disabled' : '') + '>' +
          '<span class="p-head"><b>' + esc(p.label) + '</b><span class="cost">' + costText(p.cost) + '</span></span>' +
          '<span class="p-desc">' + esc(p.desc) + '</span>' +
          (p.changes ? '<span class="p-tgt muted small">Directly changes: ' + esc(p.changes) + '</span>' : '') +
          (tooMuch ? '<span class="small bad-ink">Not enough money left.</span>' : '') + '</label>';
      }).join('') + '</div>' +
      (lv.pilot ? '<section class="card pilot-card"><h2>🧪 Run a randomised pilot first?</h2>' +
        (canPilot ? '<p>A coin toss picks <b>10 wards</b> to get the policy for <b>' + lv.pilot.weeks + ' weeks</b>; the other 10 are the comparison. Costs <b>₹' + lv.pilot.cost + ' lakh</b> and uses ' + lv.pilot.weeks + ' weeks of the season (your roll-out then starts later).</p>' +
          '<div class="toolbar"><label>Test <select id="pp">' + pols.filter(function (p) { return p.cost > 0; }).map(function (p) { return '<option value="' + p.id + '">' + esc(p.label) + '</option>'; }).join('') + '</select></label>' +
          '<button class="btn" id="runpilot">🪙 Toss the coins and run the pilot</button></div>'
          : '<p class="muted">' + (state.pilots.length >= lv.pilot.max ? 'You have used all your pilots for this problem.' : 'Not enough money or weeks left for another pilot.') + '</p>') + '</section>' : '') +
      '<div class="actions"><button class="btn" id="back">← Back to the data</button>' +
      '<button class="btn primary" id="fund" disabled>Fund it and run the season →</button></div>'
    );
    qa('input[name=pol]').forEach(function (rb) {
      rb.addEventListener('change', function () {
        state.choice = rb.value; q('#fund').disabled = false;
        qa('.policy').forEach(function (c) { c.classList.toggle('selected', c.contains(rb)); });
      });
    });
    q('#back').addEventListener('click', exploreScreen);
    q('#fund').addEventListener('click', decide);
    if (q('#runpilot')) q('#runpilot').addEventListener('click', function () { pilotScreen(q('#pp').value); });
  }

  function pilotSummaryHTML(p) {
    var lower = L().model.lowerIsBetter, good = lower ? p.hi < 0 : p.lo > 0, bad = lower ? p.lo > 0 : p.hi < 0;
    var verdict = good ? '<span class="tag good">clearly helps</span>' : bad ? '<span class="tag bad">clearly makes it worse</span>' : '<span class="tag">can\'t tell from luck</span>';
    var lo = -0.8, hi = 0.8, sc = function (v) { return Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)); };
    return '<div class="pilot-sum"><p><b>' + esc(p.label) + '</b> (weeks ' + (p.phase.from + 1) + '–' + p.phase.to + ') ' + verdict + '</p>' +
      '<p class="small">Treated wards: <b>' + pct(p.treated) + '</b> vs their usual level · control wards: <b>' + pct(p.control) + '</b>. ' +
      'Effect: <b>' + pct(p.diff) + '</b> (95% CI ' + pct(p.lo) + ' to ' + pct(p.hi) + ').</p>' +
      '<div class="ci" aria-label="95% confidence interval"><span class="ci-zero" style="left:' + sc(0) + '%"></span>' +
      '<span class="ci-bar" style="left:' + sc(p.lo) + '%;width:' + Math.max(1, sc(p.hi) - sc(p.lo)) + '%"></span>' +
      '<span class="ci-dot" style="left:' + sc(p.diff) + '%"></span><span class="ci-l">−80%</span><span class="ci-0" style="left:' + sc(0) + '%">0</span><span class="ci-r">+80%</span></div></div>';
  }

  /* Pilot: coins decide the treated wards (seeded, so replayable); the pilot runs on the real
   * simulated season for 4 weeks; we compare treated vs control wards with a Welch 95% CI. */
  function pilotScreen(policyId) {
    var lv = L(), w = state.world, pol = lv.model.policies(w).filter(function (p) { return p.id === policyId; })[0];
    var n = state.pilots.length, rng = new M.rng.Rng(state.seed + '-L' + lv.id + '-pilot' + n);
    var mask = C.randomAssignment(rng, w.wards.length);
    var phase = { from: state.weeksUsed, to: state.weeksUsed + lv.pilot.weeks, policy: policyId, mask: mask };
    var plan = { phases: state.pilots.map(function (p) { return p.phase; }).concat([phase]) };
    var run = lv.model.simulateFuture(w, plan);
    var a = C.analysePilot(lv.model, w, run, phase);
    var pilot = { policy: policyId, label: pol.label, cost: lv.pilot.cost, phase: phase, treated: a.treated, control: a.control, diff: a.diff, lo: a.lo, hi: a.hi };
    state.pilots.push(pilot);
    state.weeksUsed += lv.pilot.weeks;
    state.flags.pilot = true;
    M.log.event('pilot', { level: lv.id, policy: policyId, diff: +a.diff.toFixed(3), lo: +a.lo.toFixed(3), hi: +a.hi.toFixed(3) });
    topbar();
    render(
      '<section class="card"><p class="eyebrow">' + levelLabel(lv) + ': randomised pilot</p><h1>Testing: ' + esc(pol.label) + '</h1>' +
      M.town.advisorHTML('<p>Watch the coins: each ward is tossed into <b>T</b> (gets the policy) or <b>C</b> (doesn\'t). Nobody chooses, so the two groups are alike in everything else, even things we can\'t measure.</p>', 'neutral') +
      '<div id="ptown"></div><p class="counter" id="pcount"></p></section>' +
      '<section class="card hidden" id="presult"></section>'
    );
    var spec = townSpecFor(); spec.compact = true;
    var town = M.town.create(q('#ptown'), spec), wk = lv.model.warm || 0;
    town.update(M.town.frameAt(run.vars, phase.from + wk, 'Pilot week 1', spec));
    var partial = mask.map(function () { return null; }), i = 0;
    function flip() {
      partial[i] = mask[i];
      town.setMask(partial.map(function (x) { return x; }), true);
      q('#pcount').textContent = '🪙 Ward ' + (i + 1) + ': ' + (mask[i] ? 'T (gets the policy)' : 'C (comparison)');
      i++;
      if (i >= mask.length) { stopTimers(); later(runWeeks, 500); }
    }
    function runWeeks() {
      town.setMask(mask);
      town.setPolicy(lv.policyVisual[policyId], mask);
      var k = 0;
      every(function () {
        town.update(M.town.frameAt(run.vars, phase.from + k + wk, 'Pilot week ' + (k + 1) + ' of ' + lv.pilot.weeks, spec));
        q('#pcount').textContent = 'Pilot week ' + (k + 1) + ' of ' + lv.pilot.weeks;
        k++;
        if (k >= lv.pilot.weeks) { stopTimers(); showPilot(); }
      }, 650);
    }
    function showPilot() {
      var box = q('#presult'); box.classList.remove('hidden');
      box.innerHTML = '<h2>Pilot result</h2>' + pilotSummaryHTML(pilot) +
        '<p class="small muted">Each ward is compared with its own usual level from last year, then T wards are compared with C wards. The 95% CI is the range of effects that fit the data; if it doesn\'t include 0, luck alone is an unlikely explanation.</p>' +
        '<div class="actions"><button class="btn primary" id="todesk">Back to the policy desk →</button></div>';
      q('#todesk').addEventListener('click', deskScreen);
      topbar();
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (M.fx.reduced) { town.setMask(mask); runWeeks(); } else every(flip, 90);
  }

  // ---------------------------------------------------------------- decide and simulate
  function decide() {
    var lv = L(), w = state.world, model = lv.model;
    var ev = C.evaluatePolicies(model, w);
    var pol = ev.byId[state.choice].policy;
    var pilotCost = state.pilots.reduce(function (a, p) { return a + p.cost; }, 0);
    var plan = null, run = ev.byId[state.choice].run, planInfo = null;
    if (state.pilots.length) {
      plan = { phases: state.pilots.map(function (p) { return p.phase; }).concat([{ from: state.weeksUsed, to: model.horizon, policy: state.choice }]) };
      var pr = C.planImpact(model, w, plan, ev.base);
      run = pr.run; planInfo = { impact: pr.impact, pilotCost: pilotCost };
    }
    var sc = C.score(ev, state.choice, scoreBudget(), planInfo);
    var trapIds = lv.trapPolicies || [lv.trapPolicy(w)];
    var res = { id: lv.id, n: lv.n, part: lv.part, title: lv.title, type: lv.type, choice: state.choice, policy: pol, ev: ev, run: run, plan: plan,
      score: sc, pilots: state.pilots.slice(), fellForTrap: trapIds.indexOf(state.choice) >= 0, pickedCause: state.choice === lv.causePolicy(w),
      exploreSeconds: Math.round((Date.now() - (state.exploreStart || Date.now())) / 1000) };
    var det = { confounding: state.flags.wardavg || state.flags.splitp, reverse: state.flags.lag, simpson: state.flags.splitGroup, rct: state.flags.pilot }[lv.type];
    var earned = [];
    if (res.pickedCause) earned.push('rootcause');
    if (!res.fellForTrap && state.choice !== 'none') earned.push('sceptic');
    if (det) earned.push('detective');
    if (lv.tools.every(function (t) { return state.toolsUsed[t]; })) earned.push('explorer');
    if (state.pilots.length) earned.push('scientist');
    res.badges = earned;
    if (lv.shared) state.termSpent += pol.cost + pilotCost;
    state.results.push(res);
    M.log.decision({ level: lv.id, level_title: lv.title, concept: lv.type, policy_id: pol.id, policy_label: pol.label, cost_lakh: pol.cost,
      pilots: state.pilots.length, pilot_policies: state.pilots.map(function (p) { return p.policy; }).join('|'), pilot_cost_lakh: pilotCost,
      true_impact: +sc.impact.toFixed(1), best_impact: +sc.best.toFixed(1), best_policy: sc.bestId,
      picked_true_cause: res.pickedCause ? 1 : 0, fell_for_trap: res.fellForTrap ? 1 : 0, score: sc.total,
      explore_seconds: res.exploreSeconds, tools_used: Object.keys(state.toolsUsed).join('|'), used_key_tool: det ? 1 : 0, badges: earned.join('|') });
    if (isPanel()) simScreen(res); else examScreen(res);
  }

  function simScreen(res) {
    var lv = L(), base = res.ev.base.weekly, mine = res.run.weekly, weeks = mine.map(function (_, i) { return i + 1; });
    topbar();
    render(
      '<section class="card"><p class="eyebrow">' + levelLabel(lv) + ': the next ' + lv.model.horizon + ' weeks</p>' +
      '<h1>You funded: ' + esc(res.policy.label) + (res.pilots.length ? ' <span class="muted small">(after ' + res.pilots.length + ' pilot' + (res.pilots.length > 1 ? 's' : '') + ')</span>' : '') + '</h1>' +
      '<p>The town is simulated <b>twice</b> with the same weather and the same luck: once with your plan and once without it. The gap between the lines is your <b>true impact</b>.</p>' +
      '<div id="simchart"></div><p class="counter" id="counter"></p>' +
      '<div class="maps sim-towns"><div><h3 class="map-h">Without your policy</h3><div id="townBase"></div></div>' +
      '<div><h3 class="map-h">With your plan</h3><div id="townMine"></div></div></div>' +
      '<div class="actions"><button class="btn" id="skip">Skip animation</button></div></section>' +
      '<section class="card hidden" id="outcome"></section>'
    );
    var chart = CH.lineChart(q('#simchart'), { x: weeks, xLabel: 'Week of the season', yLabel: lv.chartY, yMin: 0,
      yMax: Math.max(S.max(base), S.max(mine)) * 1.08, ariaLabel: 'Weekly ' + lv.words.short + ' with and without your plan',
      series: [{ name: 'Without your policy', values: base, color: 'var(--s2)', dash: true }, { name: 'With your plan', values: mine, color: 'var(--s1)' }] });
    var spec = townSpecFor(), WARM = lv.model.warm || 0;
    spec.compact = true;
    var tBase = M.town.create(q('#townBase'), spec), tMine = M.town.create(q('#townMine'), spec);
    function paint(k) {
      var i = Math.max(0, k - 1), lab = 'Week ' + Math.max(1, k);
      tBase.update(M.town.frameAt(res.ev.base.vars, i + WARM, lab, spec));
      tMine.update(M.town.frameAt(res.run.vars, i + WARM, lab, spec));
      var ph = res.pilots.filter(function (p) { return i >= p.phase.from && i < p.phase.to; })[0];
      if (ph) { tMine.setMask(ph.phase.mask); tMine.setPolicy(lv.policyVisual[ph.policy], ph.phase.mask); }
      else { tMine.setMask(null); tMine.setPolicy(lv.policyVisual[res.choice] || null); }
    }
    paint(1);
    var k = 0;
    function step() {
      k++;
      chart.setProgress(k); paint(k);
      q('#counter').innerHTML = 'Week ' + k + ': <b>' + fmt(S.sum(mine.slice(0, k))) + '</b> ' + lv.words.short + ' with your plan vs <b>' + fmt(S.sum(base.slice(0, k))) + '</b> without';
      if (k >= weeks.length) { stopTimers(); var sk = q('#skip'); if (sk) sk.remove(); showOutcome(res); }
    }
    chart.setProgress(0);
    if (M.fx.reduced) { k = weeks.length - 1; step(); return; }
    every(step, 380);
    q('#skip').addEventListener('click', function () { stopTimers(); k = weeks.length - 1; step(); });
  }

  // Level 3: results day. Average score per group with vs without the policy, same students.
  function examScreen(res) {
    var lv = L(), baseRows = res.ev.base.rows, mineRows = res.run.rows, G = M.scm.l3.GROUPS;
    topbar();
    var groups = [2, 1, 0].map(function (g) {
      var b = meanOf(baseRows.filter(function (r) { return r.group === g; }), 'final'), m = meanOf(mineRows.filter(function (r) { return r.group === g; }), 'final');
      return { name: G[g], b: b, m: m };
    });
    var bAll = meanOf(baseRows, 'final'), mAll = meanOf(mineRows, 'final');
    render(
      '<section class="card"><p class="eyebrow">' + levelLabel(lv) + ': results day</p><h1>You funded: ' + esc(res.policy.label) + '</h1>' +
      '<p>Next year\'s ' + fmt(lv.model.N) + ' students sit the exam <b>twice</b> in the simulation: once with your policy, once without, with the same students and the same luck on the day.</p>' +
      '<div class="exam-big"><div><span class="muted small">Town average without your policy</span><span class="stat-num" id="eb">0</span></div><div><span class="muted small">With your policy</span><span class="stat-num" id="em">0</span></div></div>' +
      '<div class="split-grid">' + groups.map(function (g) {
        return '<div class="split-group"><h3>' + g.name + ' group</h3><div class="hbars">' +
          '<div class="hbar-row"><span class="hbar-lbl">Without</span><span class="hbar-track"><span class="hbar no grow" data-w="' + g.b.toFixed(1) + '"></span></span><span class="hbar-val">' + g.b.toFixed(1) + '</span></div>' +
          '<div class="hbar-row"><span class="hbar-lbl">With</span><span class="hbar-track"><span class="hbar att grow" data-w="' + g.m.toFixed(1) + '"></span></span><span class="hbar-val">' + g.m.toFixed(1) + ' <span class="muted small">(' + signed(g.m - g.b, 1) + ')</span></span></div></div></div>';
      }).join('') + '</div></section>' +
      '<section class="card hidden" id="outcome"></section>'
    );
    M.fx.countUp(q('#eb'), bAll, 1000, function (v) { return v.toFixed(1); });
    M.fx.countUp(q('#em'), mAll, 1000, function (v) { return v.toFixed(1); });
    requestAnimationFrame(function () { requestAnimationFrame(function () { qa('.hbar.grow').forEach(function (b) { b.style.width = b.getAttribute('data-w') + '%'; }); }); });
    later(function () { showOutcome(res); }, M.fx.reduced ? 0 : 1400);
  }

  function showOutcome(res) {
    var lv = L(), sc = res.score, box = q('#outcome'), words = lv.words;
    res.shown = true;
    var stars = M.fx.starsFor(sc.total);
    var wellPct = sc.best > 0 ? Math.max(0, Math.min(1, sc.impact / sc.best)) : 0;
    var paper = lv.afterHeadline ? lv.afterHeadline(state.world, res) : null;
    var say = lv.advisor.result(res);
    var impactNum = words.impact(sc.impact);
    box.classList.remove('hidden');
    box.innerHTML = (paper ? M.fx.newspaper(paper.head, paper.sub, paper.edition) : '') + M.town.advisorHTML(say.text, say.mood) +
      '<div class="result-head"><h2>Your true impact</h2>' + M.fx.starsHTML(stars) + '</div>' +
      '<div class="stats">' +
        '<div class="stat"><span class="stat-num">' + impactNum + '</span><span class="stat-lbl">' + (sc.impact >= 0 ? words.better : words.worse) + '</span></div>' +
        '<div class="stat"><span class="stat-num">' + costText(sc.cost) + '</span><span class="stat-lbl">' + (sc.pilotCost ? 'incl. ₹' + sc.pilotCost + ' lakh of pilots' : 'cost') + '</span></div>' +
        '<div class="stat"><span class="stat-num" id="n-score">0</span><span class="stat-lbl">score / 100</span></div>' +
      '</div>' +
      '<div class="meter-wrap"><div class="meter-lbl"><span>Town wellbeing</span><span>' + Math.round(wellPct * 100) + '% of the best possible</span></div>' +
        '<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(wellPct * 100) + '"><div class="meter-fill" id="meter"></div></div></div>' +
      '<table class="breakdown"><tbody>' +
        '<tr><td>Town wellbeing: your impact ' + impactNum + ', best possible ' + words.impact(sc.best) + '</td><td class="num">' + signed(sc.impactPts, 1) + '</td></tr>' +
        '<tr><td>Budget left (out of ' + lakh(scoreBudget()) + ')</td><td class="num">' + signed(sc.budgetPts, 1) + '</td></tr>' +
        '<tr><td>Money wasted on a policy that didn\'t help' + (sc.wasted ? ' (' + lakh(sc.wasted) + ')' : '') + '</td><td class="num">' + signed(-sc.penalty, 1) + '</td></tr>' +
      '</tbody></table>' +
      (Math.abs(sc.impact) < 1e-9 && res.policy.cost > 0 && !res.pilots.length ? '<p class="callout warn"><b>Exactly the same as doing nothing.</b> Your policy changed something, but nothing that leads to ' + words.short + '.</p>' : '') +
      '<h3>Badges</h3>' + badgesHTML(res.badges, true, lv) +
      '<div class="actions"><button class="btn primary" id="reveal">Reveal the hidden causes →</button></div>';
    topbar();
    M.fx.countUp(q('#n-score'), sc.total, 1200);
    requestAnimationFrame(function () { requestAnimationFrame(function () { var m = q('#meter'); if (m) m.style.width = (wellPct * 100) + '%'; }); });
    if (res.pickedCause) later(M.fx.confetti, 500);
    q('#reveal').addEventListener('click', function () { revealScreen(res); });
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------------------------------------------------------------- reveal
  function revealScreen(res) {
    var lv = L(), w = state.world, ex = lv.explain(w, res.ev, res), tb = lv.revealTable(w, res.ev);
    M.log.event('reveal_view', { level: lv.id });
    var last = state.levelIdx === M.levels.length - 1;
    var nextLv = last ? null : M.levels[state.levelIdx + 1];
    topbar();
    render(
      '<section class="card"><p class="eyebrow">' + levelLabel(lv) + ': the reveal</p><h1>What was really going on</h1>' +
        '<p class="concept"><span class="chip big">' + esc(ex.concept) + '</span> ' + ex.definition + '</p>' +
        '<div id="dag"></div>' +
        '<ul class="dag-legend small"><li><span class="lg-arrow"></span> causes (a real arrow)</li><li><span class="lg-dash"></span> correlated only, no causal effect</li>' +
        (lv.type === 'reverse' ? '<li><span class="lg-rev"></span> the "backwards" arrow</li>' : '') +
        '<li><span class="lg-node cause"></span> real cause</li><li><span class="lg-node decoy"></span> the decoy</li><li><span class="lg-node common"></span> hidden common cause</li></ul>' +
      '</section>' +
      '<section class="card"><h2>The trap</h2>' + ex.lines.map(function (l) { return '<p>' + l + '</p>'; }).join('') +
        '<p class="callout">' + ex.clue + '</p></section>' +
      '<section class="card"><h2>Every option: what the data suggested vs what actually happened</h2>' +
        '<div class="table-wrap"><table class="data compact"><thead><tr>' + tb.head.map(function (h, i) { return '<th' + (i ? ' class="num"' : '') + '>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
        tb.rows.map(function (r) {
          return '<tr class="' + (r.id === res.choice ? 'mine' : '') + '">' + r.cells.map(function (c, i) {
            var v = i === r.cells.length - 1 ? costText(c) : c;
            return '<td' + (i ? ' class="num"' : '') + '>' + (i === 0 ? esc(v) + (r.id === res.choice ? ' <span class="chip">your pick</span>' : '') : v) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>' +
        '<p class="muted small">The data columns use last year\'s records. The impact column comes from simulating the coming season with each policy for the whole season, using the same random numbers.</p></section>' +
      '<div class="actions"><button class="btn primary" id="next">' + (last ? 'Finish the term →' : nextLv.n !== lv.n ? 'Next level: ' + esc(LEVEL_NAMES[nextLv.n - 1]) + ' →' : 'Next problem →') + '</button></div>'
    );
    CH.dag(q('#dag'), lv.diagram(w));
    q('#next').addEventListener('click', function () { if (last) quizScreen('post'); else loadLevel(state.levelIdx + 1); });
  }

  // ---------------------------------------------------------------- feedback form
  function feedbackScreen() {
    state.level = null;
    topbar();
    render(
      '<section class="card"><p class="eyebrow">Almost done</p><h1>How was it?</h1>' +
      M.town.advisorHTML('<p>Thank you for serving as mayor! Three quick questions help improve the game. Your answers go into your playtest log only.</p>', 'happy') +
      '<form id="fbf"><fieldset class="rating"><legend><b>How much did the game help you understand correlation vs causation?</b></legend>' +
        [1, 2, 3, 4, 5].map(function (v) { return '<label class="rate"><input type="radio" name="rate" value="' + v + '"><span>' + '★'.repeat(v) + '</span></label>'; }).join('') +
        '<span class="muted small">1 = not at all · 5 = a lot</span></fieldset>' +
        '<div class="form-row"><label for="learn">What is one thing you learned?</label><textarea id="learn" rows="3" maxlength="600"></textarea></div>' +
        '<div class="form-row"><label for="improve">What was confusing, or what would you change?</label><textarea id="improve" rows="3" maxlength="600"></textarea></div>' +
      '</form></section>' +
      '<div class="actions"><button class="btn" id="skip">Skip</button><button class="btn primary" id="send">Save and see my report card →</button></div>'
    );
    q('#skip').addEventListener('click', function () { M.log.event('feedback_skip', {}); reportScreen(); });
    q('#send').addEventListener('click', function () {
      var r = q('input[name=rate]:checked');
      M.log.feedback({ rating: r ? +r.value : null, learned: q('#learn').value.trim(), improve: q('#improve').value.trim() });
      reportScreen();
    });
  }

  // ---------------------------------------------------------------- report card
  function reportScreen() {
    M.log.event('report_view', { total: totalScore() });
    state.level = null;
    topbar();
    var rs = state.results.filter(shown);
    var rows = rs.map(function (r) {
      return '<tr><td>' + r.id + '. ' + esc(r.title) + '</td><td>' + esc(r.policy.label) + (r.pilots.length ? ' <span class="chip">🧪 ' + r.pilots.length + '</span>' : '') + '</td>' +
        '<td>' + (r.pickedCause ? '<span class="tag good">✓ real cause</span>' : r.fellForTrap ? '<span class="tag bad">✗ fell for the trap</span>' : '<span class="tag">✗ missed the cause</span>') + '</td>' +
        '<td class="num"><b>' + r.score.total + '</b></td><td>' + M.fx.starsHTML(M.fx.starsFor(r.score.total)) + '</td></tr>';
    }).join('');
    var allBadges = [];
    rs.forEach(function (r) { r.badges.forEach(function (b) { if (allBadges.indexOf(b) < 0) allBadges.push(b); }); });
    var totalStars = rs.reduce(function (a, r) { return a + M.fx.starsFor(r.score.total); }, 0);
    var pre = state.quiz && state.quiz.pre, post = state.quiz && state.quiz.post;
    var l1 = rs.filter(function (r) { return r.id === '1'; })[0], l5 = rs.filter(function (r) { return r.n === 5; });
    render(
      levelPath() +
      '<section class="card"><p class="eyebrow">End of term</p><h1>Report card</h1>' +
        '<div class="stats"><div class="stat"><span class="stat-num" id="n-total">0</span><span class="stat-lbl">total score (of ' + rs.length * 100 + ')</span></div>' +
        '<div class="stat"><span class="stat-num">' + totalStars + ' ★</span><span class="stat-lbl">stars (of ' + rs.length * 3 + ')</span></div>' +
        '<div class="stat"><span class="stat-num">' + allBadges.length + '</span><span class="stat-lbl">badges (of ' + BADGES.length + ')</span></div></div>' +
        '<div class="table-wrap"><table class="data compact"><thead><tr><th>Problem</th><th>Your policy</th><th>Verdict</th><th class="num">Score</th><th>Stars</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<h3>Did you get better at spotting traps?</h3><p>' +
          (l1 ? 'Level 1: ' + (l1.fellForTrap ? 'fell for the trap' : 'avoided the trap') + '. ' : '') +
          (l5.length ? 'Final term: fell for <b>' + l5.filter(function (r) { return r.fellForTrap; }).length + ' of ' + l5.length + '</b> traps.' : '') + '</p>' +
        (pre || post ? '<p>Quiz: warm-up <b>' + (pre ? pre.score + '/3' : 'skipped') + '</b> → check-out <b>' + (post ? post.score + '/3' : 'skipped') + '</b>.</p>' : '') +
        '<h3>Badges earned</h3>' + (allBadges.length ? badgesHTML(allBadges, false) : '<p class="muted">None yet. Play again and try the tool each level unlocks before you decide.</p>') +
      '</section>' +
      '<section class="card"><h2>Help test the game</h2><p>Download your playtest log and send it to Rohan. It holds your player tag, decisions, scores, quiz answers, feedback and browser type. Nothing else.</p>' +
        '<div class="actions left"><button class="btn primary" id="dl-json">Download my playtest log (JSON)</button><button class="btn" id="dl-csv">Download decisions as CSV</button></div></section>' +
      '<div class="actions"><button class="btn" id="again">Play again with a new town</button></div>'
    );
    M.fx.countUp(q('#n-total'), totalScore(), 1200);
    q('#dl-json').addEventListener('click', M.log.downloadJSON);
    q('#dl-csv').addEventListener('click', M.log.downloadCSV);
    q('#again').addEventListener('click', startScreen);
  }

  function init(root) {
    app = root;
    document.getElementById('home').addEventListener('click', function (e) {
      e.preventDefault();
      if (!state.seed || confirm('Leave this game and go back to the start screen?')) startScreen();
    });
    startScreen();
  }

  M.ui = { init: init, _state: function () { return state; }, _goto: function (i) { loadLevel(i); } };
})(globalThis.Mayor = globalThis.Mayor || {});
