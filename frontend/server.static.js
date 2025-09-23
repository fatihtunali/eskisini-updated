// server.front.js  (frontend)  =>  node server.front.js
// Basit ama üretime yakın statik sunucu + /api proxy + akıllı cache + (br/gz) sıkıştırma
import http from 'http';
import httpProxy from 'http-proxy';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, 'public');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 5500);
const API_TARGET = process.env.API_TARGET || 'http://localhost:3000';

// --- proxy ---
const proxy = httpProxy.createProxyServer({
  target: API_TARGET,
  changeOrigin: true,
  xfwd: true,
  proxyTimeout: 30_000,
  timeout: 30_000,
});

// proxy hatası tek noktadan
proxy.on('error', (err, req, res) => {
  if (!res.headersSent) {
    res.writeHead(502, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    });
  }
  res.end('proxy error');
});

// --- MIME ---
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
  '.gif' : 'image/gif',
  '.ico' : 'image/x-icon',
  '.map' : 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf' : 'font/ttf',
  '.otf' : 'font/otf',
  '.txt' : 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm'
};

// --- helpers ---
const resType = (p) => MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
const isUnderRoot = (p) => {
  const full = path.resolve(p);
  const base = path.resolve(root);
  return full === base || full.startsWith(base + path.sep);
};
const etagFor = (st) =>
  `"${crypto.createHash('sha1').update(`${st.ino || ''}-${st.size}-${st.mtimeMs}`).digest('hex')}"`;

const isLongCache = (p) =>
  p.includes(`${path.sep}assets${path.sep}`) ||
  /\.(css|js|woff2?|png|jpe?g|gif|webp|svg|ico|map)$/i.test(p);

const cacheControl = (p) =>
  p.endsWith('.html') ? 'no-cache'
  : isLongCache(p)    ? (p.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable'
                                                                     : 'public, max-age=86400')
                      : 'no-cache';

// İçerik güvenliği (çok sıkı değil; geliştirme için makul)
const baseHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// İçerik sıkıştırma uygun mu? (yalnızca metin içerikler)
const isCompressible = (ctype) =>
  /^(text\/|application\/(javascript|json|xml|wasm))/.test(ctype);

// Precompressed dosyayı kullan (filename.br / filename.gz)
async function tryPrecompressed(filePath, acceptEncoding) {
  // .br tercih, yoksa .gz
  if (/\bbr\b/.test(acceptEncoding)) {
    try {
      const p = filePath + '.br';
      const st = await fs.promises.stat(p);
      return { path: p, encoding: 'br', stats: st };
    } catch {}
  }
  if (/\bgzip\b/.test(acceptEncoding)) {
    try {
      const p = filePath + '.gz';
      const st = await fs.promises.stat(p);
      return { path: p, encoding: 'gzip', stats: st };
    } catch {}
  }
  return null;
}

function send304(res, etag, p) {
  res.writeHead(304, {
    'ETag': etag,
    'Cache-Control': cacheControl(p),
    ...baseHeaders,
  });
  res.end();
}

function send500(res, msg = 'server error') {
  if (!res.headersSent) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8', ...baseHeaders });
  }
  res.end(msg);
}

function send404(res, msg = 'not found') {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...baseHeaders });
  res.end(msg);
}

const server = http.createServer(async (req, res) => {
  // Basit CORS (sadece statikler için gerekmez; /api proxy zaten backend'e gider)
  // OPTIONS isteklerine 200 dön (özellikle fetch preflight için)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      ...baseHeaders,
    });
    return res.end();
  }

  // 1) /api → backend proxy
  if (req.url.startsWith('/api/')) {
    return proxy.web(req, res);
  }

  try {
    // URL çöz
    const urlObj = new URL(req.url, `http://${HOST}:${PORT}`);
    let pathname = decodeURIComponent(urlObj.pathname);

    // Dizin kökü → /index.html
    if (pathname === '/') pathname = '/index.html';

    // Fiziksel yol
    let filePath = path.join(root, pathname);
    // İstemeden dizinse → index.html dene
    let stats;
    try {
      stats = await fs.promises.stat(filePath);
      if (stats.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
        stats = await fs.promises.stat(filePath);
      }
    } catch {
      // SPA değiliz; doğrudan 404
      return send404(res);
    }

    // Güvenlik: kök altı
    if (!isUnderRoot(filePath)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', ...baseHeaders });
      return res.end('forbidden');
    }

    // İçerik türü
    const type = resType(filePath);
    const longCache = cacheControl(filePath);

    // ETag
    const etag = etagFor(stats);
    if (req.headers['if-none-match'] === etag) {
      return send304(res, etag, filePath);
    }

    // HEAD ise sadece header
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': stats.size,
        'ETag': etag,
        'Cache-Control': longCache,
        ...baseHeaders,
      });
      return res.end();
    }

    // Precompressed kullan (yalnızca sıkıştırılabilir içerik)
    const acceptEncoding = req.headers['accept-encoding'] || '';
    let useCompressed = null;
    if (isCompressible(type)) {
      useCompressed = await tryPrecompressed(filePath, acceptEncoding);
    }

    // Stream hazırla
    let streamPath = filePath;
    let headers = {
      'Content-Type': type,
      'ETag': etag,
      'Cache-Control': longCache,
      ...baseHeaders,
    };

    if (useCompressed) {
      // .br/.gz dosyanın kendi boyutu
      headers['Content-Encoding'] = useCompressed.encoding;
      headers['Vary'] = 'Accept-Encoding';
      headers['Content-Length'] = useCompressed.stats.size;
      streamPath = useCompressed.path;

      const stream = fs.createReadStream(streamPath);
      res.writeHead(200, headers);
      stream.pipe(res);
      stream.on('error', () => send500(res));
      return;
    }

    // Dinamik sıkıştırma (yalnızca metin içerikler)
    const canZip = isCompressible(type);
    const wantsBr = canZip && /\bbr\b/.test(acceptEncoding);
    const wantsGz = canZip && /\bgzip\b/.test(acceptEncoding);

    // Sıkıştırmasız akış (ikincil seçenek)
    const raw = fs.createReadStream(streamPath);

    if (wantsBr) {
      headers['Content-Encoding'] = 'br';
      headers['Vary'] = 'Accept-Encoding';
      // Content-Length yok (stream, chunked gider)
      res.writeHead(200, headers);
      raw.pipe(zlib.createBrotliCompress()).pipe(res);
    } else if (wantsGz) {
      headers['Content-Encoding'] = 'gzip';
      headers['Vary'] = 'Accept-Encoding';
      res.writeHead(200, headers);
      raw.pipe(zlib.createGzip({ level: zlib.constants.Z_BEST_SPEED })).pipe(res);
    } else {
      headers['Content-Length'] = stats.size;
      res.writeHead(200, headers);
      raw.pipe(res);
    }

    raw.on('error', () => send500(res));
  } catch (e) {
    send500(res);
  }
});

// (Opsiyonel) WebSocket /api için upgrade desteği
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/api/')) {
    proxy.ws(req, socket, head);
  } else {
    socket.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Frontend on http://${HOST}:${PORT}  (proxy /api -> ${API_TARGET})`);
});
