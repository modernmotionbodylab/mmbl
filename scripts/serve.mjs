import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try { loadEnvFile(resolve(project, '.env')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const root = resolve(project, 'dist');
const host = process.env.HOST || 'localhost';
const port = Number(process.env.PORT || 4200);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }); res.end('Method not allowed'); return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const segments = pathname.split('/');
    if (segments.some(segment => segment.startsWith('.'))) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const file = resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Content-Length': data.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    const code = error instanceof URIError ? 400 : error.code === 'ENOENT' || error.code === 'ENOTDIR' ? 404 : 500;
    res.writeHead(code); res.end(code === 404 ? 'Not found' : code === 400 ? 'Bad request' : 'Unable to serve file');
  }
});
server.on('error', error => { console.error(`Cannot start preview: ${error.message}`); process.exitCode = 1; });
server.listen(port, host, () => console.log(`Modern Motion Body Lab: http://${host}:${port}\nRefresh your browser after editing dist/. Press Ctrl+C to stop.`));
