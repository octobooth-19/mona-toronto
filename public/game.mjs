export const STEP = 1 / 120;
export const SPAWN_SECONDS = 5;
const MONA_SPEED = 125;
const BUG_SPEED = 68;
const opposite = { left: 'right', right: 'left', up: 'down', down: 'up' };

export function createMap() {
  const nodes = [], segments = [];
  const locations = new Map();
  function node(x, y) {
    const key = `${x.toFixed(5)},${y.toFixed(5)}`;
    if (locations.has(key)) return locations.get(key);
    const id = nodes.length;
    nodes.push({ id, x, y, neighbors: {} });
    locations.set(key, id);
    return id;
  }
  function segment(x1, y1, x2, y2, direction) {
    segments.push({ x1, y1, x2, y2 });
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 25);
    let prev = node(x1, y1);
    for (let i = 1; i <= steps; i++) {
      const next = node(x1 + (x2 - x1) * i / steps, y1 + (y2 - y1) * i / steps);
      nodes[prev].neighbors[direction] = next;
      nodes[next].neighbors[opposite[direction]] = prev;
      prev = next;
    }
  }
  const xs = [45, 179, 327, 518, 684, 870];
  const ys = [72, 175, 277, 382, 487];
  for (const y of ys) for (let i = 1; i < xs.length; i++) {
    segment(xs[i - 1], y, xs[i], y, 'right');
  }
  const frontY = x => 560 - (x - 45) * .065;
  for (let i = 1; i < xs.length; i++) {
    segment(xs[i - 1], frontY(xs[i - 1]), xs[i], frontY(xs[i]), 'right');
  }
  for (const x of xs.slice(1, -1)) {
    const stops = [...ys, frontY(x), ...(x === 327 ? [430] : [])].sort((a, b) => a - b);
    for (let i = 1; i < stops.length; i++) segment(x, stops[i - 1], x, stops[i], 'down');
  }
  return {
    nodes, segments, width: 920, height: 610,
    spawn: node(327, 430),
    bugSpawn: node(684, 72),
    pickupNodes: nodes.filter(n => n.id !== locations.get('327.00000,430.00000')).map(n => n.id),
  };
}

export function position(entity, map) {
  const a = map.nodes[entity.node];
  if (entity.target === null) return { x: a.x, y: a.y };
  const b = map.nodes[entity.target];
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const fraction = entity.progress / length;
  return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
}

export function makeEntity(node) {
  return { node, target: null, progress: 0, direction: null, desired: null };
}

export function createGame(map = createMap()) {
  return {
    map, state: 'ready', player: makeEntity(map.spawn), bugs: [makeEntity(map.bugSpawn)],
    commits: new Set(map.pickupNodes), score: 0, ticks: 0, nextSpawnTick: 600, round: 1,
  };
}

export function startGame(map) {
  const game = createGame(map);
  game.state = 'playing';
  return game;
}

export function pauseGame(game) {
  if (game.state === 'playing') game.state = 'paused';
}

export function resumeGame(game) {
  if (game.state === 'paused') game.state = 'playing';
}

export function setDirection(game, direction) {
  if (game.state === 'playing' && direction in opposite) game.player.desired = direction;
}

function distancesTo(map, destination) {
  const distances = new Int32Array(map.nodes.length).fill(-1);
  const queue = [destination];
  distances[destination] = 0;
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const next of Object.values(map.nodes[id].neighbors)) {
      if (distances[next] !== -1) continue;
      distances[next] = distances[id] + 1;
      queue.push(next);
    }
  }
  return distances;
}

function move(entity, speed, map, choose, arrived = () => {}) {
  let remaining = speed * STEP;
  const start = position(entity, map);
  // Every tick travels less than the shortest edge. Record each portion for swept collisions.
  const trace = [{ ...start, t: 0 }];
  const budget = remaining;
  while (remaining > 1e-8) {
    if (entity.target === null) {
      const direction = choose(entity, map.nodes[entity.node].neighbors);
      const next = map.nodes[entity.node].neighbors[direction];
      if (next === undefined) break;
      entity.direction = direction;
      entity.target = next;
      entity.progress = 0;
    }
    const a = map.nodes[entity.node], b = map.nodes[entity.target];
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const amount = Math.min(remaining, distance - entity.progress);
    entity.progress += amount;
    remaining -= amount;
    if (entity.progress >= distance - 1e-8) {
      entity.node = entity.target;
      entity.target = null;
      entity.progress = 0;
      arrived(entity.node);
    }
    trace.push({ ...position(entity, map), t: (budget - remaining) / budget });
  }
  trace.push({ ...position(entity, map), t: 1 });
  return trace;
}

function atTime(trace, t) {
  for (let i = 1; i < trace.length; i++) {
    const a = trace[i - 1], b = trace[i];
    if (t <= b.t) {
      const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
  }
  return trace.at(-1);
}

export function tracesCollide(a, b, radius = 19) {
  const times = [...new Set([...a, ...b].map(point => point.t))].sort((x, y) => x - y);
  for (let i = 1; i < times.length; i++) {
    const p0 = atTime(a, times[i - 1]), p1 = atTime(a, times[i]);
    const q0 = atTime(b, times[i - 1]), q1 = atTime(b, times[i]);
    const x = p0.x - q0.x, y = p0.y - q0.y;
    const dx = (p1.x - q1.x) - x, dy = (p1.y - q1.y) - y;
    const length = dx * dx + dy * dy;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(x * dx + y * dy) / length));
    if (Math.hypot(x + dx * t, y + dy * t) <= radius) return true;
  }
  return false;
}

function collect(game, node) {
  if (!game.commits.delete(node)) return;
  game.score++;
  if (game.commits.size === 0) {
    game.commits = new Set(game.map.pickupNodes);
    game.commits.delete(node);
    game.round++;
  }
}

function spawnBug(game) {
  const here = position(game.player, game.map);
  let farthest = game.map.bugSpawn, best = -1;
  const occupied = new Set(game.bugs.map(bug => bug.target ?? bug.node));
  for (const node of game.map.nodes) {
    const distance = Math.hypot(node.x - here.x, node.y - here.y);
    const score = distance - (occupied.has(node.id) ? 80 : 0);
    if (score > best) { best = score; farthest = node.id; }
  }
  game.bugs.push(makeEntity(farthest));
}

export function stepGame(game) {
  if (game.state !== 'playing') return;
  game.ticks++;
  const { player, map } = game;
  if (player.target !== null && player.desired === opposite[player.direction]) {
    const a = map.nodes[player.node], b = map.nodes[player.target];
    player.progress = Math.hypot(b.x - a.x, b.y - a.y) - player.progress;
    [player.node, player.target] = [player.target, player.node];
    player.direction = player.desired;
  }
  if (player.target === null) collect(game, player.node);
  const playerTrace = move(player, MONA_SPEED, map, (entity, neighbors) => {
    if (neighbors[entity.desired] !== undefined) return entity.desired;
    return entity.direction;
  }, node => collect(game, node));
  const destination = player.target ?? player.node;
  if (game.pursuitDestination !== destination) {
    game.pursuitDestination = destination;
    game.pursuitDistances = distancesTo(map, destination);
  }
  for (let i = 0; i < game.bugs.length; i++) {
    const bugTrace = move(game.bugs[i], BUG_SPEED, map, (entity, neighbors) => {
      let choices = Object.entries(neighbors);
      if (choices.length > 1) choices = choices.filter(([direction]) => direction !== opposite[entity.direction]);
      choices.sort((a, b) => game.pursuitDistances[a[1]] - game.pursuitDistances[b[1]]);
      // Some bugs take the second-best turn at intersections so the pack can split.
      return choices[(choices.length > 1 && (i + game.round) % 4 === 0) ? 1 : 0]?.[0];
    });
    if (tracesCollide(playerTrace, bugTrace)) game.state = 'gameover';
  }
  if (game.state === 'playing' && game.ticks >= game.nextSpawnTick) {
    spawnBug(game);
    game.nextSpawnTick += SPAWN_SECONDS / STEP;
  }
}
