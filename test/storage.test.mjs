import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createStore, decodeRuns, encodeCSV, parseCSV, rankRuns, validateName, validateRun, HEADER,
} from '../storage.mjs';

function run(values = {}) {
  return { run_id: randomUUID(), username: 'octo_local', score: 12, duration_ms: 9000, ...values };
}
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'mona-csv-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, 'data', 'scores.csv');
}

test('CSV supports commas, quotes and multiline fields, and rejects broken quoting', () => {
  const rows = [['plain', 'comma,name', 'quote"name', 'two\r\nlines', '']];
  assert.deepEqual(parseCSV(encodeCSV(rows)), rows);
  for (const invalid of ['"unclosed', '"closed"junk', 'ab"cd']) {
    assert.throws(() => parseCSV(invalid));
  }
});

test('player validation trims names and rejects unsafe or invalid values without changing identity', () => {
  assert.equal(validateName('  Bay, "Street"  '), 'Bay, "Street"');
  assert.equal(validateName('🐙'.repeat(24)), '🐙'.repeat(24));
  for (const value of ['', ' ', '=sum(1)', ' +cmd', '-value', '@name', 'ab\ncd', '\u200Bfoo', 'a'.repeat(25), null]) {
    assert.throws(() => validateName(value));
  }
  for (const invalid of [run({ score: -1 }), run({ duration_ms: 1.5 }), run({ run_id: 'bad' }), run({ score: Infinity })]) {
    assert.throws(() => validateRun(invalid));
  }
});

test('missing CSV initializes; completed runs persist across a new store with safe quoting', async t => {
  const file = await fixture(t);
  const first = createStore(file);
  assert.deepEqual(await first.list(), []);
  const saved = await first.save(run({ username: 'Bay, "Street"' }));
  assert.ok(saved.completed_at.endsWith('Z'));
  const text = await readFile(file, 'utf8');
  assert.match(text, /"Bay, ""Street"""/);
  assert.deepEqual(await createStore(file).list(), [saved]);
});

test('concurrent saves serialize; retry IDs deduplicate and conflicting IDs are rejected', async t => {
  const file = await fixture(t), store = createStore(file);
  const input = run();
  const [a, b] = await Promise.all([store.save(input), store.save(input)]);
  assert.deepEqual(a, b);
  await Promise.all(Array.from({ length: 10 }, (_, i) => store.save(run({ username: `player${i}` }))));
  assert.equal(decodeRuns(await readFile(file, 'utf8')).length, 11);
  await assert.rejects(store.save({ ...input, score: 99 }), { status: 409 });
  await store.save(run({ username: 'after_error' }));
  assert.equal(decodeRuns(await readFile(file, 'utf8')).length, 12);
});

test('ranking selects case-insensitive personal bests, breaks ties by time, and returns top ten', () => {
  const rows = [
    { ...run({ username: 'Mona', score: 9 }), completed_at: '2026-01-01T10:00:00.000Z' },
    { ...run({ username: 'MONA', score: 20 }), completed_at: '2026-01-01T10:00:05.000Z' },
    { ...run({ username: 'Bay', score: 20 }), completed_at: '2026-01-01T10:00:02.000Z' },
  ];
  assert.deepEqual(rankRuns(rows).map(row => row.username), ['Bay', 'MONA']);
  const many = Array.from({ length: 14 }, (_, i) => ({ ...rows[0], username: `user${i}`, score: i }));
  assert.equal(rankRuns(many).length, 10);
  assert.equal(rankRuns(many)[0].score, 13);
});

test('malformed CSV and failed writes surface explicitly without overwriting existing content', async t => {
  const file = await fixture(t), store = createStore(file);
  await store.list();
  await writeFile(file, 'wrong,header\r\n');
  await assert.rejects(store.list(), /header/);
  await assert.rejects(store.save(run()), /header/);
  assert.equal(await readFile(file, 'utf8'), 'wrong,header\r\n');
  const saved = { ...run(), completed_at: '2026-01-01T00:00:00.000Z' };
  assert.throws(() => decodeRuns(encodeCSV([HEADER, HEADER.map(key => saved[key]), HEADER.map(key => saved[key])])), /duplicate/);
  const impossiblePath = join(file, 'scores.csv');
  await assert.rejects(createStore(impossiblePath).save(run()));
});
