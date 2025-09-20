import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, 'public');

const contentType = (file) =>
  file.endsWith('.css') ? 'text/css' :
  file.endsWith('.js')  ? 'application/javascript' :
  file.endsWith('.json')? 'application/json' :
  file.endsWith('.svg') ? 'image/svg+xml' :
  file.endsWith('.png') ? 'image/png' :
  file.endsWith('.jpg') || file.endsWith('.jpeg') ? 'image/jpeg' :
  'text/html';

http.createServer((req, res) => {
  const urlObj = new URL(req.url, 'http://localhost');
  let pathname = urlObj.pathname;
  if (pathname === '/') pathname = '/index.html';

  let filePath = path.join(root, pathname);
  if (!filePath.startsWith(root)) { res.statusCode = 403; return res.end('forbidden'); }

  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.statusCode = 404;
      return res.end('not found');
    }
    res.setHeader('Content-Type', contentType(filePath));
    res.end(buf);
  });
}).listen(5500, () => console.log('Frontend on http://localhost:5500'));
