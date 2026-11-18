import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMap, startGame, createGame, position, makeEntity, stepGame,
  setDirection, pauseGame, resumeGame, tracesCollide, STEP, MAX_EXPANSIONS,
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

function approachGate(game, direction) {
  const reverse = { left: 'right', right: 'left', up: 'down', down: 'up' }[direction];
  const gate = [...game.map.gates].map(id => game.map.nodes[id]).find(node => Object.hasOwn(node.neighbors, reverse));
  const previous = game.map.nodes[gate.neighbors[reverse]];
  Object.assign(game.player, {
    ...makeEntity(previous.id), target: gate.id, direction, desired: direction,
    progress: Math.hypot(previous.x - gate.x, previous.y - gate.y) - .5,
  });
  return gate;
}

test('all four playable edges expand on arrival into a connected, centered map without moving existing streets', () => {
  for (const direction of ['left', 'right', 'up', 'down']) {
    const game = startGame();
    const { width, height } = game.map;
    for (let level = 1; level <= MAX_EXPANSIONS; level++) {
      const old = game.map;
      const gate = approachGate(game, direction);
      stepGame(game);
      const { map } = game;
      assert.equal(map.expansions, level);
      assert.equal(map.width, old.width * 1.5);
      assert.equal(map.height, old.height * 1.5);
      assert.equal(map.x + map.width / 2, width / 2);
      assert.equal(map.y + map.height / 2, height / 2);
      assert.equal(game.player.node, gate.id);
      assert.ok(game.player.target >= old.nodes.length, 'continues outward in the same tick');
      assert.deepEqual(map.segments.slice(0, old.segments.length), old.segments);
      for (const { id, x, y, neighbors } of old.nodes) {
        assert.deepEqual([map.nodes[id].x, map.nodes[id].y], [x, y]);
        for (const [turn, next] of Object.entries(neighbors)) assert.equal(map.nodes[id].neighbors[turn], next);
      }
      const visited = new Set([map.spawn]);
      for (const id of visited) {
        for (const next of Object.values(map.nodes[id].neighbors)) visited.add(next);
      }
      assert.equal(visited.size, map.nodes.length);
    }
    const finalMap = game.map;
    const wall = approachGate(game, direction);
    tick(game, 2);
    assert.equal(game.map, finalMap);
    assert.deepEqual(position(game.player, game.map), { x: wall.x, y: wall.y });
  }
});

test('only Mona triggers growth; normal growth preserves remaining pickups, pursuit and spawn cadence', () => {
  const game = startGame();
  const old = game.map;
  const gate = approachGate(game, 'left');
  const mona = { ...game.player };
  const bug = { ...mona };
  game.player = makeEntity(old.spawn);
  game.bugs = [bug];
  stepGame(game);
  assert.equal(bug.node, gate.id);
  assert.equal(game.map, old);

  const bugTarget = old.nodes[old.bugSpawn].neighbors.right;
  Object.assign(bug, makeEntity(old.bugSpawn), { target: bugTarget, direction: 'right', progress: 4 });
  game.player = mona;
  const kept = old.nodes[old.spawn].neighbors.down;
  game.commits = new Set([kept, gate.id]);
  game.score = 12;
  game.round = 2;
  game.ticks = game.nextSpawnTick - 1;
  const distances = game.pursuitDistances;
  stepGame(game);
  assert.equal(game.state, 'playing');
  assert.equal(game.score, 13);
  assert.equal(game.round, 2);
  assert.deepEqual([...game.commits].filter(id => id < old.nodes.length), [kept]);
  assert.equal(game.commits.size, 1 + game.map.nodes.length - old.nodes.length);
  assert.equal(game.ticks, 600);
  assert.equal(game.nextSpawnTick, 1200);
  assert.equal(game.bugs.length, 2);
  assert.equal(game.bugs[0], bug);
  assert.equal(bug.node, old.bugSpawn);
  assert.equal(bug.target, bugTarget);
  assert.ok(bug.progress > 4);
  assert.notEqual(game.pursuitDistances, distances);
  assert.equal(game.pursuitDistances.length, game.map.nodes.length);

  const fresh = startGame();
  assert.equal(fresh.map.expansions, 0);
  assert.equal(fresh.map.nodes.length, old.nodes.length);
  assert.deepEqual([...fresh.commits], old.pickupNodes);
});

test('the last commit at a boundary scores once and refills the newly expanded map', () => {
  const game = startGame();
  const gate = approachGate(game, 'down');
  game.commits = new Set([gate.id]);
  stepGame(game);
  assert.equal(game.score, 1);
  assert.equal(game.round, 2);
  assert.equal(game.map.expansions, 1);
  assert.deepEqual([...game.commits], game.map.pickupNodes.filter(id => id !== gate.id));
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
