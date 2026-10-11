/**
 * Minimal static file server for the test runs (Playwright `webServer`).
 * Serves the repository root with correct MIME types and NO compression, so the
 * first-view budget test can compute gzip sizes itself (spec 4.6 / 4.11).
 * Dev tooling only; not part of the shipped site.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const PORT = Number(process.env.PORT || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let rel = normalize(decodeURIComponent(url.pathname));
    if (rel.endsWith(sep) || rel === '/') rel = join(rel, 'index.html');
    const file = join(ROOT, rel);
    // Path traversal guard + keep tooling directories out of reach.
    if (!file.startsWith(ROOT + sep) || /(^|[\\/])(node_modules|\.git)([\\/]|$)/.test(rel)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) throw Object.assign(new Error('not a file'), { code: 'ENOENT' });
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (err) {
    res.writeHead(err && err.code === 'ENOENT' ? 404 : 500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(err && err.code === 'ENOENT' ? 'not found' : 'server error');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`static server on http://127.0.0.1:${PORT} (root ${ROOT})`);
});
