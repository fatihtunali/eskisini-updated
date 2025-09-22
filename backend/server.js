console.log('[BOOT] server starting…');

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import auth from './routes/auth.js';
import categories from './routes/categories.js';
import listings from './routes/listings.js';   // DİKKAT: listings.js
import favorites from './routes/favorites.js';
import messages from './routes/messages.js';
import trade from './routes/trade.js';
import orders from './routes/orders.js';
import billing from './routes/billing.js';
// en üstte importlar arasına
import users from './routes/users.js';
import messagesRouter from './routes/messages.js';

import { pingDb } from './db.js';
await pingDb();



const app = express();

// ETag'ı kapatmak (opsiyonel ama pratik)
app.set('etag', false);

// Sadece API altında cache'i kapat
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store'); // her zaman taze JSON
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});


// --- güvenli CORS köken listesi ---
const ORIGINS = 'http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000'
  .split(',').map(s=>s.trim()).filter(Boolean);


// Prod’da proxy arkası için (secure cookie/SameSite=None senaryosu)
if (process.env.COOKIE_SECURE === 'true') {
  app.set('trust proxy', 1);
}

// --- middleware sırası ---
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.use(cors({
  origin: ORIGINS,           // '*' KULLANMA
  credentials: true
}));
// Preflight yanıtı
app.options('*', cors({ origin: ORIGINS, credentials: true }));

// --- health ---
app.get('/api/health', (req, res) => res.json({ ok: true }));

// --- routes ---
app.use('/api/auth', auth);
app.use('/api/billing', billing);
app.use('/api/categories', categories);
app.use('/api/favorites', favorites);
app.use('/api/listings', listings);
app.use('/api/messages', messages);
app.use('/api/orders', orders);
app.use('/api/trade', trade);
app.use('/api/users', users);
app.use('/api/messages', messagesRouter);



// --- 404 ve hata yakalayıcı (opsiyonel ama faydalı) ---
app.use((req, res) => res.status(404).json({ ok: false, error: 'not_found' }));
app.use((err, req, res, next) => {
  console.error('UNCAUGHT', err);
  res.status(500).json({ ok: false, error: 'server_error' });
});

// --- start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('API listening on', PORT));
