/** Serve only the generated static preview; the game API and local database are never exposed. */
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {promisify} = require('node:util');
const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);
const ROOT = path.resolve(__dirname, '../web/dist');
const MIME = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.jpg':'image/jpeg',
  '.wasm':'application/wasm', '.json':'application/json; charset=utf-8', '.txt':'text/plain; charset=utf-8'};
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
function createServer() {
  const cache = new Map();
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Vary', 'Accept-Encoding');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, {Allow: 'GET, HEAD'}); res.end(); return; }
    let address;
    try { address = decodeURIComponent(new URL(req.url, 'http://preview.local').pathname); }
    catch (_) { res.writeHead(400); res.end('Invalid address'); return; }
    if (address === '/health') { res.writeHead(200, {'Content-Type': 'application/json'}); res.end('{"ok":true,"preview":true}'); return; }
    if (address === '/') address = '/index.html';
    const file = path.resolve(ROOT, '.' + address);
    const extension = path.extname(file);
    if (!file.startsWith(ROOT + path.sep) || !MIME[extension]) { res.writeHead(404); res.end('Not found'); return; }
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile()) throw new Error('Not a file');
      let entry = cache.get(file);
      if (!entry || entry.mtime !== stat.mtimeMs) {
        const raw = await fs.readFile(file);
        entry = {mtime: stat.mtimeMs, raw, etag: '"' + crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24) + '"'};
        cache.set(file, entry);
      }
      res.setHeader('Content-Type', MIME[extension]);
      res.setHeader('ETag', entry.etag);
      if (req.headers['if-none-match'] === entry.etag) { res.writeHead(304); res.end(); return; }
      let body = entry.raw;
      if (extension !== '.jpg' && body.length > 1024) {
        const accepted = req.headers['accept-encoding'] || '';
        if (accepted.includes('br')) {
          if (!entry.br) entry.br = brotli(entry.raw, {params:{[zlib.constants.BROTLI_PARAM_QUALITY]: 5}});
          body = await entry.br; res.setHeader('Content-Encoding', 'br');
        } else if (accepted.includes('gzip')) {
          if (!entry.gzip) entry.gzip = gzip(entry.raw);
          body = await entry.gzip; res.setHeader('Content-Encoding', 'gzip');
        }
      }
      res.setHeader('Content-Length', body.length);
      res.writeHead(200);
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Preview static file unavailable:', path.relative(ROOT, file));
      if (!res.headersSent) res.writeHead(404);
      res.end('Not found');
    }
  });
}
function start() {
  const port = Number(process.env.WEB_PREVIEW_PORT || 4173);
  const host = process.env.WEB_PREVIEW_HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid WEB_PREVIEW_PORT');
  const server = createServer();
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, host, () => console.log('Roles Web preview: http://' + host + ':' + port));
  return server;
}
if (require.main === module) start();
module.exports = {createServer, start};
