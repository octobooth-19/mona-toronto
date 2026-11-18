import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const HEADER = ['run_id', 'username', 'score', 'duration_ms', 'completed_at'];

export class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function validateName(value) {
  if (typeof value !== 'string') throw new InputError('Enter a player name.');
  const name = value.trim();
  if (!name || [...name].length > 24) throw new InputError('Use a name with 1 to 24 characters.');
  if (/[\p{Cc}\p{Cf}]/u.test(name) || /^[=+\-@]/.test(name)) {
    throw new InputError('Names cannot contain control characters or start with =, +, -, or @.');
  }
  return name;
}

export function validateRun(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InputError('Invalid run.');
  if (typeof input.run_id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.run_id)) {
    throw new InputError('Invalid run ID.');
  }
  if (!Number.isSafeInteger(input.score) || input.score < 0 ||
      !Number.isSafeInteger(input.duration_ms) || input.duration_ms < 0) {
    throw new InputError('Score and duration must be non-negative whole numbers.');
  }
  return {
    run_id: input.run_id.toLowerCase(),
    username: validateName(input.username),
    score: input.score,
    duration_ms: input.duration_ms,
  };
}

export function encodeCSV(rows) {
  return rows.map(row => row.map(value => {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(',')).join('\r\n') + '\r\n';
}

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  function finishField() {
    row.push(field);
    field = '';
    closed = false;
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === ',') {
      finishField();
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      finishField();
      rows.push(row);
      row = [];
    } else if (c === '"' && field === '' && !closed) {
      quoted = true;
    } else {
      if (closed || c === '"') throw new Error('Malformed CSV quoting.');
      field += c;
    }
  }
  if (quoted) throw new Error('Unterminated CSV field.');
  if (field !== '' || closed || row.length) {
    finishField();
    rows.push(row);
  }
  return rows;
}

export function decodeRuns(text) {
  const [header, ...rows] = parseCSV(text);
  if (!header || header.join(',') !== HEADER.join(',')) throw new Error('Invalid scores.csv header.');
  const ids = new Set();
  return rows.map((row, index) => {
    try {
      if (row.length !== HEADER.length || !/^\d+$/.test(row[2]) || !/^\d+$/.test(row[3])) {
        throw new Error('Invalid columns.');
      }
      const run = validateRun({
        run_id: row[0], username: row[1], score: Number(row[2]), duration_ms: Number(row[3]),
      });
      if (run.username !== row[1] || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row[4]) ||
          !Number.isFinite(Date.parse(row[4])) || new Date(row[4]).toISOString() !== row[4] ||
          ids.has(run.run_id)) throw new Error('Invalid or duplicate saved run.');
      ids.add(run.run_id);
      return { ...run, completed_at: row[4] };
    } catch (error) {
      throw new Error(`Invalid scores.csv row ${index + 2}: ${error.message}`, { cause: error });
    }
  });
}

export function rankRuns(runs) {
  const sorted = [...runs].sort((a, b) => b.score - a.score ||
    a.completed_at.localeCompare(b.completed_at));
  const players = new Map();
  for (const run of sorted) {
    const key = run.username.toLowerCase();
    if (!players.has(key)) players.set(key, run);
  }
  return [...players.values()].slice(0, 10);
}

export function createStore(file) {
  let pending = Promise.resolve();
  async function load() {
    await mkdir(dirname(file), { recursive: true });
    try {
      return decodeRuns(await readFile(file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try {
        await writeFile(file, encodeCSV([HEADER]), { flag: 'wx' });
        return [];
      } catch (createError) {
        if (createError.code !== 'EEXIST') throw createError;
        return decodeRuns(await readFile(file, 'utf8'));
      }
    }
  }
  return {
    async list() {
      await pending;
      return rankRuns(await load());
    },
    save(input) {
      const operation = pending.then(async () => {
        const run = validateRun(input);
        const runs = await load();
        const existing = runs.find(row => row.run_id === run.run_id);
        if (existing) {
          if (['username', 'score', 'duration_ms'].some(key => existing[key] !== run[key])) {
            throw new InputError('That run ID already belongs to a different result.', 409);
          }
          return existing;
        }
        const completed = { ...run, completed_at: new Date().toISOString() };
        runs.push(completed);
        const temp = `${file}.${randomUUID()}.tmp`;
        try {
          await writeFile(temp, encodeCSV([HEADER, ...runs.map(row => HEADER.map(key => row[key]))]),
            { flag: 'wx', flush: true });
          await rename(temp, file);
        } catch (error) {
          await rm(temp, { force: true });
          throw error;
        }
        return completed;
      });
      // Keep later saves usable after a failed write; the caller still receives the rejection.
      pending = operation.catch(error => console.error(`Score save failed: ${error.message}`));
      return operation;
    },
  };
}
