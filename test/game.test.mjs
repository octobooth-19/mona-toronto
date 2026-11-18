import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMap, startGame, createGame, position, makeEntity, stepGame,
  setDirection, pauseGame, resumeGame, tracesCollide, STEP,
} from '../public/game.mjs';

function tick(game, count) {
  for (let i = 0; i < count; i++) stepGame(game);
}

test('street graph is connected and Design Exchange is on Bay between King and Wellington', () => {
  const map = createMap();
  assert.deepEqual({ x: map.nodes[map.spawn].x, y: map.nodes[map.spawn].y }, { x: 327, y: 430 });
  assert.equal(map.nodes[map.spawn].neighbors.left, undefined);
  assert.equal(map.nodes[map.spawn].neighbors.right, undefined);
  assert.notEqual(map.nodes[map.spawn].neighbors.up, undefined);
  assert.notEqual(map.nodes[map.spawn].neighbors.down, undefined);
  const visited = new Set([map.spawn]), queue = [map.spawn];
  for (let i = 0; i < queue.length; i++) {
    for (const id of Object.values(map.nodes[queue[i]].neighbors)) {
      if (!visited.has(id)) { visited.add(id); queue.push(id); }
    }
  }
  assert.equal(visited.size, map.nodes.length);
});

test('ready screen does not move or run its clock', () => {
  const game = createGame();
  setDirection(game, 'up');
  tick(game, 700);
  assert.equal(game.ticks, 0);
  assert.equal(game.score, 0);
  assert.equal(game.bugs.length, 1);
});

test('Mona moves on streets and buffers a turn until a junction', () => {
  const game = startGame();
  game.bugs = [];
  setDirection(game, 'down');
  tick(game, 10);
  assert.equal(position(game.player, game.map).x, 327);
  setDirection(game, 'right');
  tick(game, 65);
  const point = position(game.player, game.map);
  assert.ok(point.x > 327);
  assert.equal(point.y, 487);
  assert.ok(game.score > 0);
});

test('reversing mid-edge does not collect an unvisited commit', () => {
  const game = startGame();
  game.bugs = [];
  setDirection(game, 'down');
  tick(game, 5);
  setDirection(game, 'up');
  stepGame(game);
  assert.equal(game.score, 0);
  assert.ok(position(game.player, game.map).y > 430);
});

test('picking up the last commit adds exactly one point and refills the city', () => {
  const game = startGame();
  game.bugs = [];
  const next = game.map.nodes[game.player.node].neighbors.down;
  game.commits = new Set([next]);
  setDirection(game, 'down');
  tick(game, 20);
  assert.equal(game.score, 1);
  assert.equal(game.round, 2);
  assert.equal(game.commits.size, game.map.pickupNodes.length - 1);
});

test('bugs spawn at exactly five active seconds and pausing freezes all state', () => {
  const game = startGame();
  tick(game, 599);
  assert.equal(game.bugs.length, 1);
  assert.equal(game.ticks * STEP, 599 / 120);
  pauseGame(game);
  const before = structuredClone(game);
  tick(game, 1200);
  assert.deepEqual(game, before);
  resumeGame(game);
  stepGame(game);
  assert.equal(game.ticks * STEP, 5);
  assert.equal(game.bugs.length, 2);
  const mona = position(game.player, game.map);
  const spawned = position(game.bugs[1], game.map);
  assert.ok(Math.hypot(mona.x - spawned.x, mona.y - spawned.y) > 200);
});

test('enemy addition continues without a cap', () => {
  const game = startGame();
  for (let interval = 0; interval < 15; interval++) {
    // Keep enemies distant to isolate spawning from the separate collision behavior.
    for (const bug of game.bugs) Object.assign(bug, makeEntity(game.map.bugSpawn));
    tick(game, 600);
    assert.equal(game.state, 'playing');
    assert.equal(game.bugs.length, interval + 2);
  }
});

test('bug contact ends the run and game-over state cannot advance', () => {
  const game = startGame();
  game.bugs = [makeEntity(game.map.spawn)];
  stepGame(game);
  assert.equal(game.state, 'gameover');
  const ticks = game.ticks;
  resumeGame(game);
  tick(game, 1000);
  assert.equal(game.ticks, ticks);
});

test('swept collisions detect crossing enemies without confusing different-time crossings', () => {
  const a = [{ x: 0, y: 0, t: 0 }, { x: 100, y: 0, t: 1 }];
  const b = [{ x: 100, y: 0, t: 0 }, { x: 0, y: 0, t: 1 }];
  assert.equal(tracesCollide(a, b, 1), true);
  const c = [{ x: 50, y: -100, t: 0 }, { x: 50, y: 0, t: 1 }];
  assert.equal(tracesCollide(a, c, 1), false);
});
