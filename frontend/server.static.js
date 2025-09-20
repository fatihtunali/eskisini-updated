// server.front.js  (frontend)  =>  node server.front.js
import http from 'http';
import httpProxy from 'http-proxy';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, 'public');
const PORT = 5500;
const API_TARGET = 'http://localhost:3000';

const proxy = httpProxy.createProxyServer({ target: API_TARGET, changeOrigin: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm' : 'text/html; charset=utf-8',
  '.css' : 'text/css; charset=utf-8',
  '.js'  : 'application/javascript; charset=utf-8',
  '.mjs' : 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg' : 'image/svg+xml',
  '.png' : 'image/png',
  '.jpg' : 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico' : 'image/x-icon',
  '.map' : 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ttf' : 'font/ttf'
};

const isUnderRoot = (p) => path.resolve(p).startsWith(path.resolve(root));
const guessType = (p) => MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
const etagFor = (st) => `"${crypto.createHash('sha1').update(`${st.ino||''}-${st.size}-${st.mtimeMs}`).digest('hex')}"`;
const cacheHeaders = (p) =>
  p.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable'
  : /\.(css|js|woff2|png|jpe?g|webp|svg|ico|map)$/i.test(p) ? 'public, max-age=86400'
  : 'no-cache';

http.createServer(async (req, res) => {
  // 1) /api isteklerini backend'e geçir
  if (req.url.startsWith('/api/')) {
    proxy.web(req, res, {}, (err) => {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('proxy error');
    });
    return;
  }

  try {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(urlObj.pathname);
    if (pathname === '/') pathname = '/index.html';

    let filePath = path.join(root, pathname);
    if (filePath.endsWith(path.sep)) filePath = path.join(filePath, 'index.html');
    if (!isUnderRoot(filePath)) { res.writeHead(403, {'Content-Type':'text/plain; charset=utf-8'}); return res.end('forbidden'); }

    let stats;
    try {
      stats = await fs.promises.stat(filePath);
      if (stats.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
        stats = await fs.promises.stat(filePath);
      }
    } catch {
      res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
      return res.end('not found');
    }

    const type = guessType(filePath);
    const etag = etagFor(stats);

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { 'ETag': etag, 'Cache-Control': cacheHeaders(filePath) });
      return res.end();
    }

    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': type, 'Content-Length': stats.size, 'ETag': etag,
        'Cache-Control': cacheHeaders(filePath), 'X-Content-Type-Options':'nosniff',
        'Referrer-Policy':'strict-origin-when-cross-origin'
      });
      return res.end();
    }

    const stream = fs.createReadStream(filePath);
    res.writeHead(200, {
      'Content-Type': type, 'Content-Length': stats.size, 'ETag': etag,
      'Cache-Control': cacheHeaders(filePath), 'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'strict-origin-when-cross-origin'
    });
    stream.pipe(res);
    stream.on('error', () => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('server error');
    });
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('server error');
  }
}).listen(PORT, () => console.log(`Frontend on http://localhost:${PORT}  (proxy /api -> ${API_TARGET})`));
