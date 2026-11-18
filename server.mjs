import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { createStore, InputError } from './storage.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
  ['/game.mjs', ['game.mjs', 'text/javascript; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);

function readJSON(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', chunk => {
      size += chunk.length;
      if (size <= 4096) chunks.push(chunk);
    });
    request.on('error', reject);
    request.on('end', () => {
      if (size > 4096) return reject(new InputError('Request is too large.', 413));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new InputError('Invalid JSON.')); }
    });
  });
}

export function createApp({ scoresFile = join(root, 'data', 'scores.csv') } = {}) {
  const store = createStore(scoresFile);
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const json = (status, data) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(data));
    };
    try {
      const port = server.address().port;
      const host = request.headers.host;
      if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(host)) {
        throw new InputError('Only localhost access is allowed.', 403);
      }
      const url = new URL(request.url, `http://${host}`);
      if (url.pathname === '/api/scores') {
        if ((request.headers.origin && request.headers.origin !== `http://${host}`) ||
            request.headers['sec-fetch-site'] === 'cross-site') {
          throw new InputError('Only same-origin local requests are allowed.', 403);
        }
        if (request.method === 'GET') return json(200, { leaderboard: await store.list() });
        if (request.method === 'POST') {
          if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
            throw new InputError('Send scores as application/json.', 415);
          }
          return json(201, { run: await store.save(await readJSON(request)) });
        }
        response.setHeader('Allow', 'GET, POST');
        throw new InputError('Method not allowed.', 405);
      }
      if (!['GET', 'HEAD'].includes(request.method)) throw new InputError('Method not allowed.', 405);
      const asset = assets.get(url.pathname);
      if (!asset) throw new InputError('Not found.', 404);
      const content = await readFile(join(root, 'public', asset[0]));
      response.writeHead(200, { 'Content-Type': asset[1] });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (error instanceof InputError) json(error.status, { error: error.message });
      else {
        console.error(error);
        json(500, { error: 'Local file access failed. Check the server terminal and CSV permissions, then retry.' });
      }
    }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 4317);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT must be an integer from 1 to 65535.');
    process.exitCode = 1;
  } else {
    const server = createApp();
    server.on('error', error => {
      console.error(`Cannot start local game: ${error.message}`);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => console.log(`Mona / Toronto: http://127.0.0.1:${port}\nCtrl+C to stop. Scores: ${join(root, 'data', 'scores.csv')}`));
  }
}
