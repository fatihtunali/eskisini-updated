// backend/routes/orders.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

/** Sipariş oluştur (auth zorunlu) */
r.post('/', authRequired, async (req, res) => {
  try {
    const buyer_id = req.user.id;
    const { listing_id, qty = 1, shipping_minor = 0 } = req.body || {};

    if (!listing_id || !qty) {
      return res.status(400).json({ ok: false, error: 'Eksik' });
    }

    const [[l]] = await pool.query(
      'SELECT seller_id, price_minor, currency FROM listings WHERE id=? LIMIT 1',
      [listing_id]
    );
    if (!l) return res.status(404).json({ ok: false, error: 'İlan yok' });

    const unit = Number(l.price_minor) || 0;
    const subtotal = unit * Number(qty);
    const shipping = Number(shipping_minor) || 0;
    const total = subtotal + shipping;

    const [rs] = await pool.query(
      `INSERT INTO orders
        (buyer_id, seller_id, listing_id, qty,
         unit_price_minor, currency,
         subtotal_minor, shipping_minor, total_minor,
         status, created_at, updated_at)
       VALUES (?,?,?,?, ?,?, ?,?, ?, 'pending', NOW(), NOW())`,
      [buyer_id, l.seller_id, listing_id, qty,
       unit, l.currency,
       subtotal, shipping, total]
    );

    res.json({ ok: true, order_id: rs.insertId });
  } catch (e) {
    console.error('POST /orders', e);
    res.status(400).json({ ok: false, error: e.message });
  }
});

/** Siparişlerim (alıcıya göre) */
r.get('/my', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, total_minor, status, created_at
         FROM orders
        WHERE buyer_id=?
        ORDER BY id DESC
        LIMIT 200`,
      [req.user.id]
    );
    res.json({ ok: true, orders: rows });
  } catch (e) {
    console.error('GET /orders/my', e);
    res.status(400).json({ ok: false, error: e.message });
  }
});

export default r;
