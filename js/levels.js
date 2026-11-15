/* levels.js - the story, tools, causal diagram and explanation for every level.
 * Each level is built by a small "factory" for its concept, so Level 5 can reuse the same
 * logic with new stories. Every number in the text comes from the generated world. */
(function (M) {
  'use strict';
  var S = M.stats, C = M.scm.common;

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function low(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
  function fmtN(x) { return Math.round(Number(x)).toLocaleString('en-IN'); }
  function f2(x) { return (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2); }
  function f1(x) { return (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1); }

  var TOOLS = {
    town: { name: 'Town view', desc: 'Watch last year play out across Navapuram, ward by ward.' },
    map: { name: 'Ward heatmap', desc: 'Two measures side by side on the ward map, week by week or as yearly averages.' },
    timeseries: { name: 'Time-series plot', desc: 'How each measure rose and fell over the year.' },
    scatter: { name: 'Scatter plot + correlation r', desc: 'Plot any two measures. r runs from −1 to +1; near ±1 means the dots lie close to a straight line.' },
    lag: { name: 'What changed first?', desc: 'Find the weeks when one measure jumped, and see what another measure was doing before and after.' },
    splitp: { name: 'Split by group', desc: 'Compare like with like: split the wards into low / middle / high on a third measure, and look at the link inside each group.' },
    table: { name: 'Data table', desc: 'The raw numbers. You can download them as CSV.' },
    class: { name: 'Class view', desc: 'Every student as a dot, placed by exam score, in rows by last year\'s marks.' },
    compare: { name: 'Compare averages', desc: 'Average exam score of students who attend a programme vs those who don\'t.' },
    split: { name: 'Split by group', desc: 'The same comparison, but inside each group (for example each prior-marks group).' },
    pilot: { name: 'Randomised pilot', desc: 'At the policy desk: try a policy in randomly chosen wards for 4 weeks and compare them with the rest. Costs money and time.' }
  };

  // Shared "what the data said vs what happened" table for ward-level levels.
  function panelRevealTable(world, ev, model, words) {
    var h = world.history, out = model.outcome, flat = C.flatten(h[out]), wm = C.wardMeans(h[out]);
    return {
      head: ['Policy', 'r with ' + words.short + '<br><span class="unit">ward-weeks</span>', 'r with ' + words.short + '<br><span class="unit">ward averages</span>',
        cap(words.better) + '<br><span class="unit">simulated</span>', 'Cost'],
      rows: model.policies(world).map(function (p) {
        return { id: p.id, cells: [p.label,
          p.target ? f2(S.pearson(C.flatten(h[p.target]), flat)) : '–',
          p.target ? f2(S.pearson(C.wardMeans(h[p.target]), wm)) : '–',
          '<b>' + words.impact(ev.byId[p.id].impact) + '</b>', p.cost] };
      })
    };
  }
  function countWords(noun) { // impact wording for "lower is better" counts
    return { short: noun, better: noun + ' prevented', worse: 'extra ' + noun,
      impact: function (x) { return (x < 0 ? '−' : '') + fmtN(Math.abs(x)); } };
  }

  // ===================================================================== CONFOUNDING
  function confounding(model, o) {
    var T = model.theme;
    return {
      id: o.id, n: o.n, part: o.part, title: o.title, concept: 'Confounding', type: 'confounding', model: model,
      tools: o.tools, newTools: o.newTools, keyTool: 'wardavg', pilot: o.pilot || null,
      defaultSeries: ['outcome', 'decoy'], defaultX: 'decoy',
      words: countWords(T.outcomeShort + ' cases'),
      chartY: T.outcome + ' in town',
      goal: 'Fund ONE policy that cuts ' + T.outcomeShort + ' cases over the coming 12-week peak season.',
      story: function (world) {
        var weekly = C.weekTotals(world.history.outcome), total = S.sum(weekly), pk = weekly.indexOf(S.max(weekly)) + 1;
        return o.story ? o.story(world, total, pk) : [
          'Mayor, Navapuram had <b>' + fmtN(total) + ' ' + T.outcomeShort + ' cases</b> last year, with the worst week around week ' + pk + '. The season is coming back.',
          'I\'ve pulled last year\'s records for all 20 wards. The morning paper already has an opinion, but let\'s look at the data ourselves.',
          'You have <b>₹' + model.budget + ' lakh</b>. Look at the data, then fund one policy. Any money you don\'t spend counts toward your score.'];
      },
      headline: function (world) {
        return { edition: 'Morning edition', head: T.decoy + ' and ' + T.outcomeShort + ' rise together. Ban it?',
          sub: 'Our analysis of city records finds a correlation of r = ' + f2(world.trap.rDecoy) + '. "The numbers speak for themselves," says a local shopkeeper.' };
      },
      afterHeadline: genericAfter(T.outcomeShort + ' cases', T.outcomeShort),
      townSpec: function (world) {
        return { outcome: { key: 'outcome', label: T.outcome, legendUnit: T.outcomeShort + ' cases', icon: T.outcomeIcon, anim: T.outcomeAnim },
          rain: 'rain', temp: 'temp',
          layers: [
            { key: 'decoy', icon: T.decoyIcon, label: T.decoy + ' (₹ thousand)', legendUnit: '₹ thousand of ' + low(T.decoy) + ' (' + T.decoyPlural + ')', dp: 0 },
            { key: 'compA', icon: world.sites.A.icon, label: world.sites.A.complaint, legendUnit: low(world.sites.A.complaint), dp: 1 },
            { key: 'compB', icon: world.sites.B.icon, label: world.sites.B.complaint, legendUnit: low(world.sites.B.complaint), dp: 1 }] };
      },
      policyVisual: { ban_decoy: 'ban', clear_A: 'trucks', clear_B: 'trucks' },
      advisor: {
        explore: o.exploreTip || 'Press <b>▶ Play</b> and watch the town through last year. Where do the problems show up, and what was there just before them? The other tabs let you check your hunch with numbers.',
        desk: 'Whatever you fund, I\'ll run the season <b>twice</b>, once with it and once without, with the same weather. Then we\'ll know its true effect.',
        result: function (res) {
          if (res.pickedCause) return { mood: 'happy', text: 'Cases fell in every ward. That was a <b>real cause</b>!' };
          if (res.choice === 'none') return { mood: 'neutral', text: 'We kept the money, but the season ran its full course.' };
          return { mood: 'worried', text: 'The two towns look identical. We changed something that only <b>moves with</b> ' + T.outcomeShort + ', not something that <b>causes</b> it.' };
        }
      },
      trapPolicy: function () { return 'ban_decoy'; },
      causePolicy: function (world) { return 'clear_' + world.cause; },
      diagram: function (world) {
        var X = world.cause, Oo = X === 'A' ? 'B' : 'A', t = world.trap;
        return { nodes: [
          { id: 'season', label: T.common, x: 320, y: 40, kind: 'common' },
          { id: 'rain', label: 'Rainfall', x: 170, y: 120 }, { id: 'temp', label: 'Temperature', x: 470, y: 120 },
          { id: 'other', label: cap(world.sites[Oo].name), x: 75, y: 215 },
          { id: 'cause', label: cap(world.sites[X].name), x: 250, y: 215, kind: 'cause' },
          { id: 'decoy', label: T.decoy, x: 570, y: 215, kind: 'decoy' },
          { id: 'out', label: T.outcome, x: 400, y: 310, kind: 'outcome' }],
          edges: [
            { from: 'season', to: 'rain' }, { from: 'season', to: 'temp' }, { from: 'rain', to: 'cause' }, { from: 'rain', to: 'other' },
            { from: 'temp', to: 'decoy' }, { from: 'temp', to: 'out', label: T.tempEdge, at: 0.35, dx: -8, dy: 0, anchor: 'end' },
            { from: 'cause', to: 'out', label: T.causeEdge, strong: true, at: 0.5, dx: -8, dy: 16, anchor: 'end' },
            { from: 'decoy', to: 'out', spurious: true, label: 'r = ' + f2(t.rDecoy) + ' · no causal arrow', at: 0.5, dx: -17, dy: 40, anchor: 'start' }] };
      },
      explain: function (world, ev) {
        var t = world.trap, X = world.cause, cc = low(world.sites[X].complaint);
        return {
          concept: 'Confounding',
          definition: 'A confounder is a hidden common cause of two variables. It makes them move together even when neither one affects the other.',
          lines: [
            'Of all the things you could act on, ' + low(T.decoy) + ' had the <b>strongest</b> link with ' + T.outcomeShort + ' (r = ' + f2(t.rDecoy) + '), stronger than ' + cc + ' (r = ' + f2(t.rCause) + '). Yet ' + low(T.decoy) + ' does not cause ' + T.outcomeShort + '. Both rise in the same season, so they move together.',
            'A hidden common cause like the season is a <b>confounder</b>. Banning ' + low(T.decoy) + ' changes nothing that leads to ' + T.outcomeShort + ', so it prevented <b>0 cases</b>. The real cause was <b>' + world.sites[X].name + '</b>, ' + T.mechanism + '. Tackling them prevented <b>' + fmtN(ev.byId['clear_' + X].impact) + ' cases</b>.'],
          clue: 'The clue you could have used: compare <b>wards</b> using their yearly averages (scatter plot or heatmap). Every ward has the same season, so the confounder cancels out. Ward by ward, ' + cc + ' still tracked ' + T.outcomeShort + ' (r = ' + f2(t.wCause) + ') but ' + low(T.decoy) + ' did not (r = ' + f2(t.wDecoy) + ').'
        };
      },
      revealTable: function (world, ev) { return panelRevealTable(world, ev, model, this.words); }
    };
  }

  // ===================================================================== REVERSE CAUSATION
  function reverse(model, o) {
    var T = model.theme;
    return {
      id: o.id, n: o.n, part: o.part, title: o.title, concept: 'Reverse causation', type: 'reverse', model: model,
      tools: o.tools, newTools: o.newTools, keyTool: 'lag', pilot: o.pilot || null,
      defaultSeries: ['outcome', 'resp'], defaultX: 'resp', defaultMode: 'ward', lagX: 'resp',
      words: countWords(T.outcomeShort + (T.outcomeShort === 'fever' ? ' cases' : '')),
      chartY: T.outcome + ' in town',
      goal: 'Fund ONE policy that cuts ' + low(T.outcome) + ' over the coming 12-week season.',
      story: function (world) {
        var total = S.sum(C.flatten(world.history.outcome));
        return [
          'Mayor, the finance office has a proposal. Last year Navapuram had <b>' + fmtN(total) + ' ' + low(T.outcome) + '</b>, and the wards with the most <b>' + low(T.resp) + '</b> had the most ' + T.outcomeShort + '.',
          '"' + T.resp + ' don\'t seem to work," they say. "Close half of them and save ₹10 lakh." Before you agree, let\'s check <b>which came first</b>.',
          'You have <b>₹' + model.budget + ' lakh</b>. Fund one policy (closing gives money back).'];
      },
      headline: function (world) {
        return { edition: 'Morning edition', head: 'More ' + low(T.resp) + ', more ' + T.outcomeShort + '?',
          sub: 'Wards with the most ' + low(T.resp) + ' report the most ' + T.outcomeShort + ' (r = ' + f2(world.trap.rWard) + ' across wards). Should the town stop wasting money?' };
      },
      afterHeadline: genericAfter(low(T.outcome), T.outcomeShort),
      townSpec: function () {
        return { outcome: { key: 'outcome', label: T.outcome, legendUnit: low(T.outcome), icon: T.outcomeIcon, anim: T.outcomeAnim },
          rain: T.driver === 'Rainfall' ? 'driver' : null, temp: null,
          layers: [{ key: 'resp', icon: T.respIcon, label: T.resp, legendUnit: low(T.resp), dp: 0, cap: 5, exact: true },
            { key: 'decoy', icon: T.decoyIcon, label: T.decoy + ' (₹ thousand)', legendUnit: '₹ thousand of ' + low(T.decoy), dp: 0 }] };
      },
      policyVisual: { open: 'trucks', close: 'closed', cap_decoy: 'ban' },
      advisor: {
        explore: o.exploreTip || 'Wards with more ' + low(T.resp) + ' have more ' + T.outcomeShort + '. But which way does the arrow point? Try the <b>What changed first?</b> tab.',
        desk: 'Remember: closing gives money back, but if ' + low(T.resp) + ' really help, the season will be worse.',
        result: function (res) {
          if (res.pickedCause) return { mood: 'happy', text: 'With more ' + low(T.resp) + ', ' + T.outcomeShort + ' fell. They were helping all along!' };
          if (res.choice === 'close') return { mood: 'worried', text: 'Closing them made things <b>worse</b>. They were in the worst wards <b>because</b> those wards had the most ' + T.outcomeShort + '.' };
          if (res.choice === 'none') return { mood: 'neutral', text: 'We kept the money, but the season ran its full course.' };
          return { mood: 'worried', text: 'Nothing changed. ' + T.decoy + ' is caused <b>by</b> ' + T.outcomeShort + '; cutting it can\'t reduce ' + T.outcomeShort + '.' };
        }
      },
      trapPolicy: function () { return 'close'; },
      trapPolicies: ['close', 'cap_decoy'],
      causePolicy: function () { return 'open'; },
      diagram: function (world) {
        var t = world.trap;
        return { nodes: [
          { id: 'risk', label: T.common, x: 130, y: 60, kind: 'common' },
          { id: 'out', label: T.outcome, x: 300, y: 220, kind: 'outcome' },
          { id: 'resp', label: T.resp, x: 540, y: 90, kind: 'cause' },
          { id: 'decoy', label: T.decoy, x: 540, y: 310, kind: 'decoy' }],
          edges: [
            { from: 'risk', to: 'out', label: 'more ' + T.outcomeShort, at: 0.5, dx: -10, dy: 0, anchor: 'end' },
            { from: 'out', to: 'resp', label: T.revEdge, reverse: true, offset: -9, at: 0.5, dx: -40, dy: -26, anchor: 'middle' },
            { from: 'resp', to: 'out', label: T.fwdEdge, strong: true, offset: -9, at: 0.5, dx: 18, dy: 26, anchor: 'start' },
            { from: 'out', to: 'decoy', label: 'sick people buy more', at: 0.5, dx: -10, dy: 18, anchor: 'end' }] };
      },
      explain: function (world, ev) {
        var t = world.trap;
        return {
          concept: 'Reverse causation',
          definition: 'Reverse causation means the arrow points the other way: Y causes X, not X causes Y. A correlation alone can\'t tell you which way it goes.',
          lines: [
            'Wards with more ' + low(T.resp) + ' had more ' + T.outcomeShort + ' (r = ' + f2(t.rWard) + ' across wards). But that is because the town <b>puts</b> ' + low(T.resp) + ' where ' + T.outcomeShort + ' is high: ' + T.outcomeShort + ' causes ' + low(T.resp) + '.',
            'The arrow also runs forward: ' + T.fwdEdge + '. Closing half changed the season by <b>' + fmtN(-ev.byId.close.impact) + ' extra</b>; opening more prevented <b>' + fmtN(ev.byId.open.impact) + '</b>. ' + T.decoy + ' is just a <b>result</b> of ' + T.outcomeShort + ', so capping it changed nothing.'],
          clue: 'The clue: in <b>What changed first?</b>, ' + T.outcomeShort + ' was already at <b>' + Math.round(t.before * 100) + '%</b> of the ward\'s usual level in the 3 weeks <b>before</b> a new ' + T.respOne + ' opened. The ' + T.outcomeShort + ' came first.'
        };
      },
      revealTable: function (world, ev) { return panelRevealTable(world, ev, model, this.words); }
    };
  }

  // ===================================================================== SIMPSON'S PARADOX
  function simpson(model, o) {
    return {
      id: o.id, n: o.n, part: o.part, title: o.title, concept: 'Simpson\'s paradox', type: 'simpson', model: model,
      tools: o.tools, newTools: o.newTools, keyTool: 'split-group',
      words: { short: 'exam score', better: 'marks gained per student', worse: 'marks lost per student',
        impact: function (x) { var v = x / model.N; return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2); } },
      goal: 'Fund ONE policy that raises next year\'s average exam score.',
      story: function (world) {
        var A = world.progs.A, B = world.progs.B, d = model.diffs(world.history, world.cause), d2 = model.diffs(world.history, world.cause === 'A' ? 'B' : 'A');
        var dA = world.cause === 'A' ? d.overall : d2.overall, dB = world.cause === 'A' ? d2.overall : d.overall;
        return [
          'Mayor, the education office has last year\'s results for <b>' + fmtN(model.N) + ' students</b>. The town funds two programmes: the <b>' + low(A.name) + '</b> and the <b>' + low(B.name) + '</b>.',
          'Students in the ' + low(A.name) + ' scored <b>' + Math.abs(dA).toFixed(1) + ' marks ' + (dA < 0 ? 'lower' : 'higher') + '</b> than others, and the ' + low(B.name) + ' students <b>' + Math.abs(dB).toFixed(1) + ' marks ' + (dB < 0 ? 'lower' : 'higher') + '</b>. Are they a waste of money?',
          'You have <b>₹' + model.budget + ' lakh</b>. Fund one policy (stopping a programme gives money back).'];
      },
      headline: function (world) {
        var d = model.diffs(world.history, world.cause);
        return { edition: 'Education page', head: world.progs[world.cause].name + ' makes marks worse?',
          sub: 'Students in a town-funded programme scored ' + Math.abs(d.overall).toFixed(1) + ' marks lower on average. Parents ask why the town pays for it.' };
      },
      afterHeadline: function (world, res) {
        var v = res.score.impact / model.N;
        if (res.choice === 'none') return { edition: 'Results day', head: 'Exam results unchanged', sub: 'The town kept its money. Average marks were the same as they would have been.' };
        if (v > 0.05) return { edition: 'Results day', head: 'Marks up ' + v.toFixed(1) + ' per student after ' + low(res.policy.label), sub: 'The weakest students gained the most.' };
        if (v < -0.05) return { edition: 'Results day', head: 'Marks fall after the town ' + low(res.policy.label).replace('stop', 'stops'), sub: 'Average down ' + Math.abs(v).toFixed(1) + ' marks per student. The programme was helping after all.' };
        return { edition: 'Results day', head: cap(res.policy.label) + ': no change in marks', sub: 'Exactly the same results as without it.' };
      },
      advisor: {
        explore: o.exploreTip || 'Weak students are the ones who join these programmes. So is it fair to compare them with everyone else? Try <b>Split by group</b> to compare like with like.',
        desk: 'I\'ll run next year\'s exams twice: once with your policy and once without, with the same students.',
        result: function (res) {
          if (res.pickedCause) return { mood: 'happy', text: 'Marks went up. Inside every group, this programme really helps.' };
          if (res.fellForTrap) return { mood: 'worried', text: 'Marks went <b>down</b>. The programme looked bad only because weaker students join it.' };
          if (res.choice === 'none') return { mood: 'neutral', text: 'We kept the money; nothing changed.' };
          return { mood: 'worried', text: 'No change. That programme doesn\'t actually help, even within groups.' };
        }
      },
      trapPolicy: function (world) { return 'cut_' + world.cause; },
      causePolicy: function (world) { return 'seats_' + world.cause; },
      diagram: function (world) {
        var X = world.progs[world.cause].name, Oo = world.progs[world.cause === 'A' ? 'B' : 'A'].name, t = world.trap;
        return { nodes: [
          { id: 'prior', label: 'Last year\'s marks', x: 320, y: 40, kind: 'common' },
          { id: 'x', label: X, x: 150, y: 175, kind: 'cause' }, { id: 'o', label: Oo, x: 490, y: 175, kind: 'decoy' },
          { id: 'out', label: 'Final exam score', x: 320, y: 310, kind: 'outcome' }],
          edges: [
            { from: 'prior', to: 'x', label: 'weaker students join', at: 0.5, dx: -10, dy: 0, anchor: 'end' },
            { from: 'prior', to: 'o', label: 'weaker students join', at: 0.5, dx: 10, dy: 0, anchor: 'start' },
            { from: 'prior', to: 'out', label: 'strong students score high', at: 0.55, dx: 8, dy: 0, anchor: 'start' },
            { from: 'x', to: 'out', label: '+' + (model === M.scm.l3 ? world.p['tau' + world.cause].toFixed(1) : '') + ' marks', strong: true, at: 0.5, dx: -10, dy: 10, anchor: 'end' },
            { from: 'o', to: 'out', spurious: true, label: 'overall ' + f1(t.overallOther) + ' · no effect', at: 0.5, dx: 12, dy: 16, anchor: 'start' }] };
      },
      explain: function (world, ev) {
        var t = world.trap, X = world.progs[world.cause], Oo = world.progs[world.cause === 'A' ? 'B' : 'A'];
        var w = t.withinCause.map(function (d, i) { return model.GROUPS[i] + ' ' + f1(d); }).join(', ');
        return {
          concept: 'Simpson\'s paradox',
          definition: 'Simpson\'s paradox: a trend that appears in the whole data reverses inside every group. It happens when a confounder (here, last year\'s marks) decides who is in which group.',
          lines: [
            '<b>' + X.name + '</b> students scored ' + Math.abs(t.overallCause).toFixed(1) + ' marks <b>lower</b> overall. But mostly <b>weak</b> students join it. Inside each prior-marks group they scored <b>higher</b>: ' + w + ' marks.',
            'Comparing like with like (<b>stratifying</b> by last year\'s marks) removes the confounder. 300 free seats raised the town\'s average by <b>' + this.words.impact(ev.byId['seats_' + world.cause].impact) + '</b> marks per student; stopping it lost <b>' + this.words.impact(-ev.byId['cut_' + world.cause].impact).replace('+', '') + '</b>. The ' + low(Oo.name) + ' also looked bad overall, and really does nothing.'],
          clue: 'The clue: <b>Split by group</b> with "Prior-marks group". The overall comparison mixes strong and weak students; inside each group the comparison is fair.'
        };
      },
      revealTable: function (world, ev) {
        var words = this.words;
        return {
          head: ['Policy', 'Attenders vs others<br><span class="unit">overall, marks</span>', 'Attenders vs others<br><span class="unit">avg inside groups</span>', cap(words.better) + '<br><span class="unit">simulated</span>', 'Cost'],
          rows: model.policies(world).map(function (p) {
            var d = p.target ? model.diffs(world.history, p.target) : null;
            return { id: p.id, cells: [p.label, d ? f1(d.overall) : '–', d ? f1(S.mean(d.within)) : '–', '<b>' + words.impact(ev.byId[p.id].impact) + '</b>', p.cost] };
          })
        };
      }
    };
  }

  // ===================================================================== RANDOMISED EXPERIMENT
  function rct(model, o) {
    var T = model.theme;
    return {
      id: o.id, n: o.n, part: o.part, title: o.title, concept: 'Randomised experiments', type: 'rct', model: model,
      tools: o.tools, newTools: o.newTools, keyTool: 'pilot', pilot: { cost: 5, weeks: 4, max: 2 },
      defaultSeries: ['outcome', 'X0'], defaultX: 'X0', defaultMode: 'ward',
      words: countWords(T.outcomeShort),
      chartY: T.outcome + ' in town',
      goal: 'Fund ONE measure that cuts ' + low(T.outcome) + ' over the coming 12-week season.',
      story: function (world) {
        var total = S.sum(C.flatten(world.history.outcome));
        return [
          'Mayor, last year Navapuram had <b>' + fmtN(total) + ' ' + low(T.outcome) + '</b>. Three measures are on the table: <b>' + T.cands.map(function (c) { return low(c.name); }).join('</b>, <b>') + '</b>.',
          'The trouble: the town already put all three where things were worst, so all three <b>go with</b> more ' + T.outcomeShort + '. And the main reason, ' + low(T.hidden) + ', isn\'t in our data.',
          'You can only afford <b>one</b> full roll-out (₹30 lakh of ₹' + model.budget + ' lakh). New: you can run a <b>randomised pilot</b> first.'];
      },
      headline: function (world) {
        var r = world.trap.r, j = world.trap.strongest;
        return { edition: 'Morning edition', head: T.cands[j].name + ' linked to more ' + T.outcomeShort + '!',
          sub: 'Wards with more ' + low(T.cands[j].name) + ' report more ' + T.outcomeShort + ' (r = ' + f2(r[j]) + '). Experts disagree on what to do.' };
      },
      afterHeadline: genericAfter(low(T.outcome), T.outcomeShort),
      townSpec: function () {
        return { outcome: { key: 'outcome', label: T.outcome, legendUnit: low(T.outcome), icon: T.outcomeIcon, anim: T.outcomeAnim },
          rain: null, temp: null,
          layers: [0, 1, 2].map(function (j) { return { key: 'X' + j, icon: T.cands[j].icon, label: T.cands[j].name, legendUnit: low(T.cands[j].name), dp: 0 }; }) };
      },
      policyVisual: { roll_0: 'trucks', roll_1: 'trucks', roll_2: 'trucks' },
      advisor: {
        explore: o.exploreTip || 'All three measures were placed where things were already bad, so every chart is muddled by that. When the data can\'t settle it, an <b>experiment</b> can. Check the pilot at the policy desk.',
        desk: 'A pilot: a <b>coin toss</b> picks 10 wards to get the measure for 4 weeks; the other 10 don\'t. Because a coin chose, the two groups differ only by luck and by the measure.',
        result: function (res) {
          if (res.pickedCause) return { mood: 'happy', text: 'That measure really works. ' + (res.pilots ? 'The pilot paid for itself.' : 'Lucky pick, or good detective work?') };
          if (res.choice === 'none') return { mood: 'neutral', text: 'We kept the money, but the season ran its full course.' };
          return { mood: 'worried', text: 'No change at all. That measure was placed on dangerous roads, but it doesn\'t prevent anything itself.' };
        }
      },
      trapPolicy: function (world) { return 'roll_' + world.trap.strongest; },
      causePolicy: function (world) { return 'roll_' + world.cause; },
      diagram: function (world) {
        var r = world.trap.r, xs = [240, 400, 560];
        var nodes = [{ id: 'hid', label: T.hidden + ' (hidden)', x: 320, y: 40, kind: 'common' },
          { id: 'drv', label: T.driver, x: 80, y: 175 },
          { id: 'out', label: T.outcome, x: 320, y: 310, kind: 'outcome' }];
        var edges = [{ from: 'hid', to: 'drv' }, { from: 'hid', to: 'out' }];
        T.cands.forEach(function (c, j) {
          nodes.push({ id: 'c' + j, label: c.name + (j === world.cause ? ' (−' + Math.round(world.p.eff * 100) + '% when rolled out)' : ''), x: xs[j], y: 175, kind: j === world.cause ? 'cause' : 'decoy' });
          edges.push({ from: 'hid', to: 'c' + j });
          if (j === world.cause) edges.push({ from: 'c' + j, to: 'out', strong: true });
          else edges.push({ from: 'c' + j, to: 'out', spurious: true, label: 'r = ' + f2(r[j]), at: 0.45, dx: xs[j] < 320 ? -8 : 8, dy: 4, anchor: xs[j] < 320 ? 'end' : 'start' });
        });
        return { nodes: nodes, edges: edges };
      },
      explain: function (world, ev, res) {
        var r = world.trap.r, c = T.cands[world.cause];
        return {
          concept: 'Randomised experiments',
          definition: 'In a randomised experiment a coin, not people, decides who gets the treatment. So the treated and untreated groups are alike in everything except the treatment, even things we can\'t measure, and any difference is caused by the treatment.',
          lines: [
            'All three measures went with <b>more</b> ' + T.outcomeShort + ' (r = ' + r.map(f2).join(', ') + ' across wards), because the town put them where ' + low(T.hidden) + ' made things worst. ' + T.hidden + ' was not in the data, so no chart or split could remove it.',
            'Only <b>' + low(c.name) + '</b> really works: a full roll-out prevents <b>' + fmtN(ev.byId['roll_' + world.cause].impact) + '</b> ' + T.outcomeShort + '. The other two prevent exactly 0.'],
          clue: res.pilots && res.pilots.length ? 'Your pilot' + (res.pilots.length > 1 ? 's' : '') + ' let the coin do the work: ' + res.pilots.map(function (p) { return p.label + ': ' + f1(p.diff * 100) + '% vs control (95% CI ' + f1(p.lo * 100) + ' to ' + f1(p.hi * 100) + ')'; }).join('; ') + '.'
            : 'The clue: a <b>randomised pilot</b> (₹5 lakh, 4 weeks) would have compared coin-chosen wards with the rest, and shown which measure really cuts ' + T.outcomeShort + '.'
        };
      },
      revealTable: function (world, ev) { return panelRevealTable(world, ev, model, this.words); }
    };
  }

  function genericAfter(noun, short) {
    return function (world, res) {
      var base = res.ev.base.total, imp = res.score.impact, pct = base > 0 ? Math.round(100 * imp / base) : 0;
      var label = res.policy.label;
      if (res.choice === 'none') return { edition: 'Season report', head: 'Mayor sits out the season', sub: fmtN(base) + ' ' + noun + ' recorded in 12 weeks. Nothing was tried, so nothing was learned.' };
      if (imp > 0.5) return { edition: 'Season report', head: label + (res.pilots && res.pilots.length ? ' (after a pilot)' : '') + ' cuts ' + short + ' by ' + pct + '%', sub: fmtN(imp) + ' fewer than the town would have had. Officials are delighted.' };
      if (imp < -0.5) return { edition: 'Season report', head: label + ' backfires', sub: fmtN(-imp) + ' extra ' + noun + ' this season.' };
      return { edition: 'Season report', head: label + ' changes nothing', sub: 'Exactly as bad as it would have been. ₹' + res.policy.cost + ' lakh spent, nothing prevented.' };
    };
  }

  // ===================================================================== THE FIVE LEVELS
  var PANEL1 = ['town', 'map', 'timeseries', 'scatter', 'table'];
  var PANEL_ALL = ['town', 'map', 'timeseries', 'scatter', 'lag', 'splitp', 'table'];
  function tl(keys) { return keys.map(function (k) { return TOOLS[k]; }); }

  var L1 = confounding(M.scm.l1, { id: '1', n: 1, title: 'Dengue season', tools: PANEL1, newTools: tl(PANEL1) });
  var L2 = reverse(M.scm.l2, { id: '2', n: 2, title: 'The clinic paradox',
    tools: ['town', 'map', 'timeseries', 'scatter', 'lag', 'table'], newTools: tl(['lag']) });
  var L3 = simpson(M.scm.l3, { id: '3', n: 3, title: 'Coaching centres', tools: ['class', 'compare', 'split', 'table'], newTools: tl(['class', 'compare', 'split']) });
  var L4 = rct(M.scm.l4, { id: '4', n: 4, title: 'Road accidents', tools: PANEL_ALL, newTools: tl(['splitp', 'pilot']) });

  var FINAL_INTRO = 'Final term: three new problems, one shared budget of <b>₹90 lakh</b>. Every tool and the randomised pilot are open. Pilots cost money and weeks, so only use them when the data can\'t settle it.';
  var L5a = confounding(M.scm.l1b, { id: '5a', n: 5, part: 1, title: 'Final term: stomach bugs', tools: PANEL_ALL, newTools: tl(['pilot']),
    pilot: { cost: 5, weeks: 4, max: 1 },
    story: function (world, total, pk) {
      return [FINAL_INTRO, 'Problem 1 of 3. Navapuram had <b>' + fmtN(total) + ' diarrhoea cases</b> last year, worst around week ' + pk + '. The paper blames cold drinks.'];
    } });
  var L5b = reverse(M.scm.l2b, { id: '5b', n: 5, part: 2, title: 'Final term: thefts', tools: PANEL_ALL, newTools: [], pilot: { cost: 5, weeks: 4, max: 1 } });
  var L5c = rct(M.scm.l4b, { id: '5c', n: 5, part: 3, title: 'Final term: empty classrooms', tools: PANEL_ALL, newTools: [] });
  L5c.pilot = { cost: 5, weeks: 4, max: 1 };
  [L5a, L5b, L5c].forEach(function (L) { L.shared = true; L.partBudget = 30; });
  var s5b = L5b.story;
  L5b.story = function (world) { var s = s5b(world); s[0] = 'Problem 2 of 3. ' + s[0]; return s; };
  var s5c = L5c.story;
  L5c.story = function (world) { var s = s5c(world); s[0] = 'Problem 3 of 3. ' + s[0]; s[2] = 'A full roll-out costs ₹30 lakh from the shared term budget. A pilot costs ₹5 lakh and 4 weeks.'; return s; };

  M.levels = [L1, L2, L3, L4, L5a, L5b, L5c];
  M.levelTools = TOOLS;
  M.TERM_BUDGET = 90;
})(globalThis.Mayor = globalThis.Mayor || {});
