import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { get } from 'node:http';
import { createApp } from '../server.mjs';

async function launch(t, file) {
  const server = createApp({ scoresFile: file });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'mona-http-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, 'scores.csv');
}

test('local HTTP app serves only allowlisted assets and accepts valid score round trips', async t => {
  const { url } = await launch(t, await fixture(t));
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Mona \/ Toronto/);
  assert.equal((await fetch(url, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 200);
  for (const file of ['/styles.css', '/app.mjs', '/game.mjs', '/favicon.svg']) {
    assert.equal((await fetch(url + file)).status, 200);
  }
  for (const file of ['/data/scores.csv', '/storage.mjs', '/README.md', '/%2e%2e/server.mjs']) {
    assert.equal((await fetch(url + file)).status, 404);
  }
  assert.deepEqual(await (await fetch(url + '/api/scores')).json(), { leaderboard: [] });
  const body = { run_id: randomUUID(), username: 'Toronto', score: 24, duration_ms: 5000 };
  const post = () => fetch(url + '/api/scores', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: url }, body: JSON.stringify(body),
  });
  assert.equal((await post()).status, 201);
  assert.equal((await post()).status, 201);
  const { leaderboard } = await (await fetch(url + '/api/scores')).json();
  assert.equal(leaderboard.length, 1);
  assert.equal(leaderboard[0].score, 24);
});

test('score endpoint rejects invalid bodies, nonlocal hosts, and foreign origins', async t => {
  const { url } = await launch(t, await fixture(t));
  const endpoint = url + '/api/scores';
  assert.equal((await fetch(endpoint, { method: 'POST', body: 'name=bad' })).status, 415);
  assert.equal((await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'bad',
  })).status, 400);
  assert.equal((await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'x' }),
  })).status, 400);
  assert.equal((await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(5000),
  })).status, 413);
  assert.equal((await fetch(endpoint, { headers: { Origin: 'https://other.invalid' } })).status, 403);
  assert.equal((await fetch(endpoint, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    get(endpoint, { headers: { Host: 'other.invalid' } }, response => {
      response.resume();
      resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(foreignHostStatus, 403);
});

test('saved scores survive a complete HTTP server restart', async t => {
  const file = await fixture(t);
  const first = await launch(t, file);
  const input = { run_id: randomUUID(), username: 'Restart', score: 48, duration_ms: 9000 };
  await fetch(first.url + '/api/scores', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  await new Promise(resolve => first.server.close(resolve));
  const second = await launch(t, file);
  const { leaderboard } = await (await fetch(second.url + '/api/scores')).json();
  assert.equal(leaderboard[0].username, 'Restart');
  assert.equal(leaderboard[0].score, 48);
});
