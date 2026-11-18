import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserScores } from '../public/browser-scores.mjs';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

test('browser scores persist, deduplicate retries, and rank personal bests', () => {
  const storage = memoryStorage();
  const scores = createBrowserScores(storage);
  const run = { run_id: 'one', username: 'Mona', score: 5, duration_ms: 1000 };
  scores.save(run);
  scores.save(run);
  scores.save({ ...run, run_id: 'two', username: 'MONA', score: 10 });
  scores.save({ ...run, run_id: 'three', username: 'Bay', score: 7 });
  assert.deepEqual(createBrowserScores(storage).list().map(row => [row.username, row.score]),
    [['MONA', 10], ['Bay', 7]]);
  assert.throws(() => scores.save({ ...run, score: 99 }), /different result/);
});

test('browser storage failures and malformed saved data do not report success', () => {
  const storage = memoryStorage();
  storage.setItem('mona-toronto-scores-v1', '{"invalid":true}');
  const scores = createBrowserScores(storage);
  assert.throws(() => scores.list(), /invalid/);
  assert.throws(() => scores.save({}), /invalid/);
  assert.equal(storage.getItem('mona-toronto-scores-v1'), '{"invalid":true}');
  assert.throws(() => createBrowserScores({
    getItem: () => null,
    setItem: () => { throw new Error('Storage blocked'); },
  }).save({ run_id: 'one' }), /Storage blocked/);
});
