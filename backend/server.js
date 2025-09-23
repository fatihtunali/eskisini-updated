// backend/server.js
console.log('[BOOT] server starting…');

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import auth from './routes/auth.js';
import categories from './routes/categories.js';
import listings from './routes/listings.js';
import favorites from './routes/favorites.js';
import messages from './routes/messages.js';
import trade from './routes/trade.js';
import orders from './routes/orders.js';
import billing from './routes/billing.js';
import users from './routes/users.js';
import notifications from './routes/notifications.js';

import { pingDb } from './db.js';
await pingDb();

const app = express();

// ETag'ı kapat
app.set('etag', false);

// API altında cache kapat
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// CORS whitelist
const ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (process.env.COOKIE_SECURE === 'true') {
  app.set('trust proxy', 1);
}

// middleware sırası
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.use(cors({
  origin: ORIGINS,
  credentials: true
}));
app.options('*', cors({ origin: ORIGINS, credentials: true }));

// health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// routes
app.use('/api/auth', auth);
app.use('/api/billing', billing);
app.use('/api/categories', categories);
app.use('/api/favorites', favorites);
app.use('/api/listings', listings);
app.use('/api/messages', messages);
app.use('/api/orders', orders);
app.use('/api/trade', trade);
app.use('/api/users', users);
app.use('/api/notifications', notifications);

// 404 & error
app.use((req, res) => res.status(404).json({ ok: false, error: 'not_found' }));
app.use((err, req, res, next) => {
  console.error('UNCAUGHT', err);
  res.status(500).json({ ok: false, error: 'server_error' });
});

// start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('API listening on', PORT));
