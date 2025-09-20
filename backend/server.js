import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import auth from './routes/auth.js';
import categories from './routes/categories.js';
import listings from './routes/listings.js';
import favorites from './routes/favorites.js';
import messages from './routes/messages.js';
import trade from './routes/trade.js';
import orders from './routes/orders.js';

const app = express();
app.use(express.json());
app.use(morgan('dev'));
app.use(cors({ origin: (process.env.CORS_ORIGIN || '*').split(','), credentials: true }));

app.get('/api/health', (req,res)=>res.json({ok:true}));

app.use('/api/auth', auth);
app.use('/api/categories', categories);
app.use('/api/listings', listings);
app.use('/api/favorites', favorites);
app.use('/api/messages', messages);
app.use('/api/trade', trade);
app.use('/api/orders', orders);

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('API listening on', PORT));
