const key = 'mona-toronto-scores-v1';

export function createBrowserScores(storage) {
  function load() {
    const text = storage.getItem(key);
    if (text === null) return [];
    const runs = JSON.parse(text);
    if (!Array.isArray(runs) || runs.some(run =>
      !run || typeof run.run_id !== 'string' || typeof run.username !== 'string' ||
      !Number.isSafeInteger(run.score) || run.score < 0 ||
      !Number.isSafeInteger(run.duration_ms) || run.duration_ms < 0 ||
      typeof run.completed_at !== 'string' || !Number.isFinite(Date.parse(run.completed_at)))) {
      throw new Error('Browser scores are invalid; existing data was not changed.');
    }
    return runs;
  }
  return {
    list() {
      const sorted = load().sort((a, b) => b.score - a.score ||
        a.completed_at.localeCompare(b.completed_at));
      const players = new Map();
      for (const run of sorted) {
        const name = run.username.toLowerCase();
        if (!players.has(name)) players.set(name, run);
      }
      return [...players.values()].slice(0, 10);
    },
    save(run) {
      const runs = load();
      const existing = runs.find(row => row.run_id === run.run_id);
      if (existing) {
        if (['username', 'score', 'duration_ms'].some(field => existing[field] !== run[field])) {
          throw new Error('That run ID already belongs to a different result.');
        }
        return;
      }
      runs.push({ ...run, completed_at: new Date().toISOString() });
      storage.setItem(key, JSON.stringify(runs));
    },
  };
}
