// server.static.js
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, 'public');
const PORT = 5500;

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

function guessType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function etagFor(stats) {
  const data = `${stats.ino || ''}-${stats.size}-${stats.mtimeMs}`;
  return `"${crypto.createHash('sha1').update(data).digest('hex')}"`;
}

function cacheHeaders(filePath) {
  // /assets/ altı dosyalara uzun cache, HTML’lere kısa
  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    return 'public, max-age=31536000, immutable';
  }
  if (/\.(css|js|woff2|png|jpe?g|webp|svg|ico|map)$/i.test(filePath)) {
    return 'public, max-age=86400';
  }
  return 'no-cache';
}

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(urlObj.pathname);

    // varsayılan: / -> /index.html
    if (pathname === '/') pathname = '/index.html';

    let filePath = path.join(root, pathname);

    // Dizin ise index.html dene
    if (filePath.endsWith(path.sep)) filePath = path.join(filePath, 'index.html');

    // Güvenlik: kök dışında erişim engeli
    if (!isUnderRoot(filePath)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('forbidden');
    }

    // Dosya oku (stat ile başla)
    let stats;
    try {
      stats = await fs.promises.stat(filePath);
      if (stats.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
        stats = await fs.promises.stat(filePath);
      }
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('not found');
    }

    const type = guessType(filePath);
    const etag = etagFor(stats);

    // Koşullu GET
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, {
        'ETag': etag,
        'Cache-Control': cacheHeaders(filePath)
      });
      return res.end();
    }

    // HEAD desteği
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': stats.size,
        'ETag': etag,
        'Cache-Control': cacheHeaders(filePath),
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
      });
      return res.end();
    }

    const stream = fs.createReadStream(filePath);
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stats.size,
      'ETag': etag,
      'Cache-Control': cacheHeaders(filePath),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    });
    stream.pipe(res);
    stream.on('error', () => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('server error');
    });
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('server error');
  }
});

server.listen(PORT, () =>
  console.log(`Frontend on http://localhost:${PORT}`)
);
