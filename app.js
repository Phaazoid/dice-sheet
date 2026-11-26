// Dice Sheet: one player's score sheet. All state lives in `S`, every
// change goes through `act()` (which records an undo step and saves),
// and the whole sheet is redrawn from `S` after each change.

(function () {
  'use strict';

  var ROWS = [
    { key: 'red', asc: true },
    { key: 'yellow', asc: true },
    { key: 'green', asc: false },
    { key: 'blue', asc: false }
  ];
  var LAST = 10;            // index of the final number in a row
  var MARKS_TO_LOCK = 5;
  var PENALTY = 5;
  var MAX_PENALTIES = 4;
  var STORE_KEY = 'dice-sheet-v1';

  var LOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  var OPEN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>';
  var X_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function blank() {
    return {
      marks: [[], [], [], []],             // marked indices per row
      locked: [false, false, false, false], // locked by this player
      closed: [false, false, false, false], // locked by someone else
      pen: 0,
      hist: [],
      hide: false
    };
  }

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY));
      if (raw && Array.isArray(raw.marks) && raw.marks.length === 4) {
        return Object.assign(blank(), raw);
      }
    } catch (e) { /* fall through to a blank sheet */ }
    return blank();
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* private mode */ }
  }

  var S = load();

  // ---- rules ----

  function lastMarked(r) {
    return S.marks[r].length ? Math.max.apply(null, S.marks[r]) : -1;
  }
  function markCount(r) {
    return S.marks[r].length + (S.locked[r] ? 1 : 0);
  }
  function rowScore(r) {
    var n = markCount(r);
    return n * (n + 1) / 2;
  }
  function total() {
    var t = -S.pen * PENALTY;
    for (var r = 0; r < 4; r++) t += rowScore(r);
    return t;
  }
  function gameOver() {
    var shut = 0;
    for (var r = 0; r < 4; r++) if (S.locked[r] || S.closed[r]) shut++;
    return shut >= 2 || S.pen >= MAX_PENALTIES;
  }
  function canMark(r, i) {
    if (gameOver() || S.locked[r] || S.closed[r]) return false;
    if (i <= lastMarked(r)) return false;
    if (i === LAST && S.marks[r].length < MARKS_TO_LOCK) return false;
    return true;
  }
  function canToggleClosed(r) {
    if (S.locked[r]) return false;
    return S.closed[r] || !gameOver();
  }

  // ---- changes ----

  function snapshot() {
    return JSON.stringify({ marks: S.marks, locked: S.locked, closed: S.closed, pen: S.pen });
  }
  function act(change) {
    S.hist.push(snapshot());
    change();
    save();
    draw();
  }
  function undo() {
    if (!S.hist.length) return;
    var prev = JSON.parse(S.hist.pop());
    S.marks = prev.marks; S.locked = prev.locked; S.closed = prev.closed; S.pen = prev.pen;
    save();
    draw();
  }

  // ---- drawing ----

  var rowsEl = document.getElementById('rows');
  var footEl = document.getElementById('foot');
  var sideEl = document.getElementById('side');
  var confirmEl = document.getElementById('confirm');

  function draw() {
    var over = gameOver();
    var h = '';
    ROWS.forEach(function (row, r) {
      h += '<div class="row ' + row.key + '">';
      for (var i = 0; i <= LAST; i++) {
        var n = row.asc ? i + 2 : 12 - i;
        var marked = S.marks[r].indexOf(i) >= 0;
        var ok = canMark(r, i);
        var cls = marked ? 'marked' : ok ? 'open' : 'dead';
        h += '<button type="button" class="cell ' + cls + '" data-r="' + r + '" data-i="' + i + '"' +
          (ok ? '' : ' disabled') + ' aria-label="' + row.key + ' ' + n + (marked ? ', marked' : '') + '">' +
          (marked ? X_SVG : n) + '</button>';
      }
      var shut = S.locked[r] || S.closed[r];
      var lcls = S.locked[r] ? 'marked' : S.closed[r] ? 'dead' : 'open';
      h += '<button type="button" class="cell ' + lcls + '" data-lock="' + r + '"' +
        (canToggleClosed(r) ? '' : ' disabled') + ' aria-label="' +
        (S.locked[r] ? row.key + ' row locked' : S.closed[r] ? 'Reopen ' + row.key + ' row' : 'Close ' + row.key + ' row') +
        '">' + (shut ? LOCK_SVG : OPEN_SVG) + '</button>';
      h += '</div>';
    });
    rowsEl.innerHTML = h;

    var show = !S.hide || over;
    var f = over ? '<span class="over">Game over</span>' : '<span class="label narrow-hide">Penalties</span>';
    for (var p = 0; p < MAX_PENALTIES; p++) {
      var on = p < S.pen;
      var next = p === S.pen && !over;
      f += '<button type="button" class="pen' + (on ? ' on' : '') + (next ? ' next' : '') + '" data-act="pen"' +
        (next ? '' : ' disabled') + ' aria-label="Penalty ' + (p + 1) + (on ? ', marked' : '') + '">' + (on ? '✕' : '') + '</button>';
    }
    f += '<span class="spacer"></span>';
    ROWS.forEach(function (row, r) {
      f += '<span class="box ' + row.key + '" aria-label="' + row.key + ' score">' + (show ? rowScore(r) : '–') + '</span>';
    });
    f += '<span class="box penalty" aria-label="Penalty points">' + (show ? (S.pen ? '−' + S.pen * PENALTY : '0') : '–') + '</span>';
    f += '<span class="box total" aria-label="Total score">' + (show ? total() : '–') + '</span>';
    footEl.innerHTML = f;

    sideEl.innerHTML =
      '<button type="button" class="btn" data-act="undo"' + (S.hist.length ? '' : ' disabled') + '>Undo</button>' +
      '<button type="button" class="btn" data-act="rules">Rules</button>' +
      '<button type="button" class="btn" data-act="scoring">Scoring</button>' +
      '<button type="button" class="btn" data-act="hide">' + (S.hide ? 'Show' : 'Hide') + '</button>' +
      '<button type="button" class="btn" data-act="new">New</button>';
  }

  // ---- input ----

  rowsEl.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.lock !== undefined) {
      var lr = +b.dataset.lock;
      if (canToggleClosed(lr)) act(function () { S.closed[lr] = !S.closed[lr]; });
      return;
    }
    var r = +b.dataset.r, i = +b.dataset.i;
    if (!canMark(r, i)) return;
    act(function () {
      S.marks[r].push(i);
      if (i === LAST) S.locked[r] = true;
    });
  });

  footEl.addEventListener('click', onAction);
  sideEl.addEventListener('click', onAction);
  function onAction(e) {
    var b = e.target.closest('button');
    if (!b || b.disabled) return;
    switch (b.dataset.act) {
      case 'undo': undo(); break;
      case 'pen':
        if (S.pen < MAX_PENALTIES && !gameOver()) act(function () { S.pen++; });
        break;
      case 'hide': S.hide = !S.hide; save(); draw(); break;
      case 'new': confirmEl.hidden = false; break;
      case 'rules': showInfo('Rules', RULES_HTML); break;
      case 'scoring': showInfo('Scoring', scoringHtml()); break;
    }
  }

  // ---- reference panels ----

  var RULES_HTML =
    '<h3>The dice</h3>' +
    '<p>Six dice: two white, and one each of red, yellow, green and blue. Players take turns being the roller.</p>' +
    '<h3>Each roll</h3>' +
    '<ol>' +
    '<li><b>Everyone:</b> add the two white dice. Any player may mark that number in any one row.</li>' +
    '<li><b>Roller only:</b> then add one white die to one coloured die, and mark that number in the row of that colour.</li>' +
    '</ol>' +
    '<p>Both steps are optional, but a roller who marks nothing at all on their own roll takes a penalty.</p>' +
    '<h3>Marking</h3>' +
    '<ul>' +
    '<li>Rows are marked left to right. You may skip numbers, but skipped numbers are gone for good.</li>' +
    '<li>The last number in a row (12 in red and yellow, 2 in green and blue) needs at least ' + MARKS_TO_LOCK + ' marks in that row first.</li>' +
    '<li>Marking the last number locks the row for everyone and earns the lock as a bonus mark. That colour\'s die leaves the game. When someone else locks a row, tap its padlock here.</li>' +
    '</ul>' +
    '<h3>Game end</h3>' +
    '<p>The game ends as soon as two rows are locked, or one player has ' + MAX_PENALTIES + ' penalties. Highest total wins.</p>';

  function scoringHtml() {
    var top = '<tr><td class="head">Marks</td>', bottom = '<tr><td class="head">Points</td>';
    for (var n = 1; n <= 12; n++) {
      top += '<th>' + n + '</th>';
      bottom += '<td>' + (n * (n + 1) / 2) + '</td>';
    }
    return '<p>Each row scores by how many marks it has. A lock counts as one more mark.</p>' +
      '<table class="score-table">' + top + '</tr>' + bottom + '</tr></table>' +
      '<p>Each penalty is −' + PENALTY + ' points.</p>' +
      '<p>Total = red + yellow + green + blue − penalties.</p>';
  }

  var infoEl = document.getElementById('info');
  function showInfo(title, html) {
    document.getElementById('info-title').textContent = title;
    var body = document.getElementById('info-body');
    body.innerHTML = html;
    body.scrollTop = 0;
    infoEl.hidden = false;
  }
  document.getElementById('info-close').addEventListener('click', function () { infoEl.hidden = true; });
  infoEl.addEventListener('click', function (e) { if (e.target === infoEl) infoEl.hidden = true; });

  document.getElementById('confirm-no').addEventListener('click', function () {
    confirmEl.hidden = true;
  });
  document.getElementById('confirm-yes').addEventListener('click', function () {
    var hide = S.hide;
    S = blank();
    S.hide = hide;
    save();
    confirmEl.hidden = true;
    draw();
  });

  // ---- keep the screen on during a game, where the browser allows it ----

  var wake = null;
  function keepAwake() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () {});
  }
  document.addEventListener('visibilitychange', keepAwake);
  keepAwake();

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  draw();
})();
