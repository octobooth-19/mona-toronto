import { createGame, startGame, position, STEP, MAX_EXPANSIONS, setDirection, stepGame, pauseGame, resumeGame } from './game.mjs';

const $ = selector => document.querySelector(selector);
const canvas = $('#board');
const ctx = canvas.getContext('2d');
let game = createGame();
let username = '';
let runId = '';
let pendingRun = null;
let saving = false;
let saveMessage = '';
let lastFrame = 0;
let accumulator = 0;
let lastDisplay = '';
const dialog = $('#start-dialog');
const infoDrawer = $('.info-drawer');
const narrowScreen = matchMedia('(max-width: 850px)');
function fitInfoDrawer() {
  infoDrawer.open = !narrowScreen.matches;
}
fitInfoDrawer();
narrowScreen.addEventListener('change', fitInfoDrawer);
infoDrawer.addEventListener('toggle', () => {
  if (narrowScreen.matches && infoDrawer.open) {
    pauseGame(game);
    accumulator = 0;
    updateScreen();
  }
});
const background = document.createElement('canvas');
background.width = canvas.width;
background.height = canvas.height;
const bg = background.getContext('2d');
let drawnMap;

function fitMap(context, map) {
  const scale = canvas.width / map.width;
  context.setTransform(scale, 0, 0, scale, -map.x * scale, -map.y * scale);
}

function text(context, value, x, y, color = '#91a7bc', size = 10) {
  context.fillStyle = color;
  context.font = `${size}px ui-monospace,monospace`;
  context.fillText(value, x, y);
}

function drawBackground(map) {
  fitMap(bg, map);
  const { x, y, width, height } = map;
  bg.fillStyle = '#0c141e';
  bg.fillRect(x, y, width, height);
  bg.strokeStyle = '#172737';
  bg.lineWidth = .4;
  bg.beginPath();
  for (let column = Math.ceil(x / 23) * 23; column < x + width; column += 23) {
    bg.moveTo(column, y); bg.lineTo(column, y + height);
  }
  for (let row = Math.ceil(y / 23) * 23; row < y + height; row += 23) {
    bg.moveTo(x, row); bg.lineTo(x + width, row);
  }
  bg.stroke();
  const xs = [57, 199, 347, 538, 705], widths = [103, 108, 151, 125, 145];
  for (const y of [93, 196, 298, 403]) for (let i = 0; i < xs.length; i++) {
    bg.fillStyle = '#14202c'; bg.strokeStyle = '#203244'; bg.lineWidth = 1;
    bg.beginPath(); bg.roundRect(xs[i], y, widths[i], 60, 8); bg.fill(); bg.stroke();
  }
  bg.lineCap = 'round';
  for (const width of [29, 1]) {
    bg.lineWidth = width; bg.strokeStyle = width === 29 ? '#1d3845' : '#446c77';
    bg.beginPath();
    for (const s of map.segments) { bg.moveTo(s.x1, s.y1); bg.lineTo(s.x2, s.y2); }
    bg.stroke();
  }
  [
    ['QUEEN ST W', 40, 51], ['QUEEN ST E', 741, 51],
    ['RICHMOND ST W', 40, 154], ['ADELAIDE ST W', 40, 256],
    ['KING ST W', 40, 361], ['WELLINGTON ST W', 40, 466],
    ['FRONT ST W', 42, 594], ['FRONT ST E', 740, 542],
  ].forEach(([name, x, y]) => text(bg, name, x, y));
  for (const [name, x, y] of [['UNIVERSITY AVE', 157, 347], ['BAY ST', 305, 241], ['YONGE ST', 496, 244], ['CHURCH ST', 662, 354]]) {
    bg.save(); bg.translate(x, y); bg.rotate(-Math.PI / 2);
    text(bg, name, 0, 0, name === 'BAY ST' ? '#c6a9ff' : '#91a7bc'); bg.restore();
  }
  [
    ['OLD CITY HALL', 209, 127], ['FINANCIAL DISTRICT', 359, 333],
    ['ST. LAWRENCE', 729, 331], ['HOCKEY HALL', 549, 429], ['OF FAME', 549, 445],
    ['UNION STATION', 692, 592],
  ].forEach(([name, x, y]) => text(bg, name, x, y, '#6d869d', 10));
  text(bg, 'N', x + width - 58, y + 24); text(bg, '^', x + width - 58, y + 39);
}

function drawMona(x, y) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#c6a9ff18'; ctx.beginPath(); ctx.arc(0, 0, 27, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c6a9ff'; ctx.strokeStyle = '#c6a9ff'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-16, -6); ctx.lineTo(-18, -22); ctx.lineTo(-7, -16);
  ctx.quadraticCurveTo(0, -19, 8, -16); ctx.lineTo(18, -22); ctx.lineTo(16, -6);
  ctx.bezierCurveTo(25, 12, 9, 20, 0, 16); ctx.bezierCurveTo(-13, 20, -23, 8, -16, -6); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath();
  ctx.moveTo(-9, 14); ctx.quadraticCurveTo(-23, 26, -27, 15);
  ctx.moveTo(-3, 16); ctx.lineTo(-3, 24); ctx.moveTo(4, 16); ctx.lineTo(4, 24);
  ctx.moveTo(10, 15); ctx.quadraticCurveTo(20, 25, 22, 17); ctx.stroke();
  ctx.fillStyle = '#f2ddcf'; ctx.beginPath(); ctx.ellipse(0, 1, 15, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#211e33';
  for (const eye of [-6, 6]) { ctx.beginPath(); ctx.ellipse(eye, 0, 2.4, 3.8, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#503c52'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-3, 6); ctx.quadraticCurveTo(0, 10, 3, 6); ctx.stroke();
  ctx.restore();
}

function drawBug(bug, index) {
  const { x, y } = position(bug, game.map);
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = index % 2 ? '#ffb28c' : '#ff8885'; ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  ctx.beginPath();
  for (const side of [-1, 1]) for (const dy of [-7, 0, 7]) {
    ctx.moveTo(side * 8, dy); ctx.lineTo(side * 16, dy * 1.55);
  }
  ctx.moveTo(-4, -10); ctx.lineTo(-8, -17); ctx.moveTo(4, -10); ctx.lineTo(8, -17); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(-8, -11, 16, 24, 8); ctx.fill();
  ctx.strokeStyle = '#40242b'; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 8); ctx.stroke();
  ctx.restore();
}

function render() {
  const { map } = game;
  if (drawnMap !== map) {
    drawBackground(map);
    drawnMap = map;
  }
  ctx.resetTransform();
  ctx.drawImage(background, 0, 0);
  fitMap(ctx, map);
  ctx.strokeStyle = '#a4f6b6'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const id of game.commits) {
    const { x, y } = map.nodes[id];
    ctx.moveTo(x - 7, y); ctx.lineTo(x - 3, y); ctx.moveTo(x + 3, y); ctx.lineTo(x + 7, y);
    ctx.moveTo(x + 3, y); ctx.arc(x, y, 3, 0, Math.PI * 2);
  }
  ctx.stroke();
  game.bugs.forEach(drawBug);
  const player = position(game.player, map);
  drawMona(player.x, player.y);
  if (game.state === 'ready') {
    ctx.fillStyle = '#241f37'; ctx.strokeStyle = '#60537e'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(365, 407, 132, 45, 7); ctx.fill(); ctx.stroke();
    text(ctx, 'Design Exchange', 374, 425, '#e1d3ff', 11);
    text(ctx, 'MONA STARTS HERE', 374, 442, '#b9a2dd', 9);
    ctx.beginPath(); ctx.moveTo(351, 430); ctx.lineTo(365, 430); ctx.stroke();
  }
  const seconds = Math.floor(game.ticks * STEP);
  $('#score').textContent = String(game.score).padStart(3, '0');
  $('#time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('#bugs').textContent = String(game.bugs.length).padStart(2, '0');
  $('#spawn-clock').textContent = `Next bug in ${Math.max(0, (game.nextSpawnTick - game.ticks) * STEP).toFixed(1)}s`;
}

function updateScreen() {
  const expansions = game.map.expansions;
  const stateKey = `${game.state}:${expansions}:${saving}:${saveMessage}`;
  if (lastDisplay === stateKey) return;
  lastDisplay = stateKey;
  const overlay = $('#overlay');
  overlay.hidden = game.state === 'playing';
  overlay.dataset.state = game.state;
  $('#pause').disabled = !['playing', 'paused'].includes(game.state);
  $('#pause').textContent = game.state === 'playing' ? 'PAUSE [ESC]' : game.state === 'paused' ? 'RESUME [ESC]' : game.state === 'gameover' ? 'RUN COMPLETE' : 'READY TO EXPLORE';
  $('#new-game').disabled = Boolean(pendingRun);
  $('#overlay-action').disabled = saving;
  if (game.state === 'paused') {
    $('#overlay-tag').textContent = 'Taking a breather';
    $('#overlay-title').textContent = 'City on pause.';
    $('#overlay-copy').textContent = 'Your score and spawn timer are frozen.\nResume when you are ready.';
    $('#overlay-action').textContent = 'Resume run';
    $('#run-status').textContent = 'Paused. Press Esc or Resume to continue.';
  } else if (game.state === 'gameover') {
    $('#overlay-tag').textContent = 'Caught a runtime bug';
    $('#overlay-title').textContent = `${game.score} commits shipped.`;
    $('#overlay-copy').textContent = saveMessage;
    $('#overlay-action').textContent = saving ? 'Saving locally...' : pendingRun ? 'Retry score save' : 'New game';
    $('#run-status').textContent = saveMessage;
  } else if (game.state === 'playing') {
    $('#run-status').textContent = expansions === 0
      ? 'Reach a street end to expand Toronto.'
      : `Map expanded (${expansions}/${MAX_EXPANSIONS}). ${expansions === MAX_EXPANSIONS ? 'Outer edges are solid.' : 'The board zoomed out.'}`;
  }
}

function openNewGame() {
  if (pendingRun) return;
  if (narrowScreen.matches) infoDrawer.open = false;
  pauseGame(game);
  accumulator = 0;
  updateScreen();
  $('#name-error').textContent = '';
  $('#replace-notice').hidden = !['playing', 'paused'].includes(game.state);
  dialog.showModal();
  $('#username').focus();
}

function togglePause() {
  if (dialog.open || document.hidden) return;
  if (narrowScreen.matches) infoDrawer.open = false;
  if (game.state === 'playing') pauseGame(game);
  else resumeGame(game);
  accumulator = 0;
  updateScreen();
  if (game.state === 'playing') canvas.focus({ preventScroll: true });
}

$('#new-game').addEventListener('click', openNewGame);
$('#pause').addEventListener('click', togglePause);
$('#overlay-action').addEventListener('click', () => {
  if (game.state === 'paused') togglePause();
  else if (pendingRun) saveRun();
  else openNewGame();
});
$('#cancel-start').addEventListener('click', () => dialog.close());
$('#start-form').addEventListener('submit', event => {
  event.preventDefault();
  const value = $('#username').value.trim();
  if (!value || [...value].length > 24 || /[\p{Cc}\p{Cf}]/u.test(value) || /^[=+\-@]/.test(value)) {
    $('#name-error').textContent = 'Use 1-24 characters with no control characters or leading = + - @.';
    $('#username').focus();
    return;
  }
  username = value;
  runId = crypto.randomUUID();
  game = startGame();
  accumulator = 0;
  lastFrame = 0;
  saveMessage = '';
  $('#player-label').textContent = `PLAYING AS / ${username}`;
  dialog.close();
  canvas.focus({ preventScroll: true });
  updateScreen();
  render();
});

const keys = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
};
document.addEventListener('keydown', event => {
  if (dialog.open || ['INPUT', 'TEXTAREA'].includes(event.target.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    if (narrowScreen.matches && infoDrawer.open) {
      infoDrawer.open = false;
      return;
    }
    if (!event.repeat) togglePause();
    return;
  }
  const direction = keys[event.key] ?? keys[event.key.toLowerCase()];
  if (direction && game.state === 'playing') {
    event.preventDefault();
    setDirection(game, direction);
  }
});
document.querySelectorAll('[data-direction]').forEach(button => button.addEventListener('pointerdown', event => {
  event.preventDefault();
  setDirection(game, button.dataset.direction);
}));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseGame(game);
    accumulator = 0;
    updateScreen();
  }
  lastFrame = 0;
});
window.addEventListener('blur', () => {
  pauseGame(game);
  accumulator = 0;
  updateScreen();
});
window.addEventListener('beforeunload', event => {
  if (pendingRun) { event.preventDefault(); event.returnValue = ''; }
});

async function requestJSON(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Local server returned ${response.status}.`);
  return data;
}

async function loadScores() {
  $('#reload-scores').hidden = true;
  $('#leaderboard-status').textContent = 'Reading local scores...';
  try {
    const { leaderboard } = await requestJSON('/api/scores');
    $('#leaderboard').replaceChildren(...leaderboard.map((run, index) => {
      const row = document.createElement('li');
      for (const [className, value] of [['rank', String(index + 1).padStart(2, '0')], ['player', run.username], ['score', run.score]]) {
        const span = document.createElement('span');
        span.className = className; span.textContent = value; row.append(span);
      }
      return row;
    }));
    $('#leaderboard-status').textContent = leaderboard.length ? 'Top 10 personal bests. Earlier scores win ties.' : 'No runs yet. Be the first local legend.';
  } catch (error) {
    $('#leaderboard-status').textContent = `Cannot read local leaderboard: ${error.message}`;
    $('#reload-scores').hidden = false;
  }
}
$('#reload-scores').addEventListener('click', loadScores);

async function saveRun() {
  if (!pendingRun || saving) return;
  saving = true;
  saveMessage = 'Saving your completed run to this computer...';
  updateScreen();
  try {
    await requestJSON('/api/scores', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pendingRun),
    });
    pendingRun = null;
    saveMessage = `Nice run, ${username}. Your score is saved in scores.csv.`;
    await loadScores();
  } catch (error) {
    saveMessage = `Score NOT saved: ${error.message}\nKeep this page open and retry.`;
  } finally {
    saving = false;
    updateScreen();
  }
}

function finishRun() {
  pendingRun = {
    run_id: runId, username, score: game.score, duration_ms: Math.round(game.ticks * STEP * 1000),
  };
  saveRun();
}

function frame(timestamp) {
  if (!lastFrame) lastFrame = timestamp;
  if (game.state === 'playing' && !document.hidden && !dialog.open) {
    accumulator += Math.min((timestamp - lastFrame) / 1000, .1);
    while (accumulator >= STEP && game.state === 'playing') {
      stepGame(game);
      accumulator -= STEP;
      if (game.state === 'gameover') finishRun();
    }
  } else accumulator = 0;
  lastFrame = timestamp;
  render();
  updateScreen();
  requestAnimationFrame(frame);
}
loadScores();
requestAnimationFrame(frame);
