// backend/routes/orders.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

/**
 * Sipariş oluştur (ödeme entegrasyonu sonra)
 * POST /api/orders
 * body: { listing_id, qty=1, shipping_minor=0 }
 * buyer_id: req.user.id (cookie'den)
 */
r.post('/', authRequired, async (req, res) => {
  try {
    const buyer_id = req.user.id;
    const { listing_id, qty = 1, shipping_minor = 0 } = req.body || {};

    if (!listing_id) return res.status(400).json({ ok: false, error: 'listing_id gerekli' });
    const qtyNum = Math.max(1, parseInt(qty, 10) || 1);
    const shipMinor = Math.max(0, parseInt(shipping_minor, 10) || 0);

    const [[l]] = await pool.query(
      'SELECT id, seller_id, price_minor, currency FROM listings WHERE id=? LIMIT 1',
      [listing_id]
    );
    if (!l) return res.status(404).json({ ok: false, error: 'İlan yok' });
    if (Number(l.seller_id) === Number(buyer_id)) {
      return res.status(400).json({ ok: false, error: 'Kendi ilanınızı satın alamazsınız' });
    }

    const subtotal = Number(l.price_minor) * qtyNum;
    const total = subtotal + shipMinor;

    const [rs] = await pool.query(
      `INSERT INTO orders
         (buyer_id, seller_id, listing_id, qty, unit_price_minor, currency,
          subtotal_minor, shipping_minor, total_minor, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,'pending', NOW(), NOW())`,
      [buyer_id, l.seller_id, listing_id, qtyNum, l.price_minor, l.currency, subtotal, shipMinor, total]
    );

    return res.json({ ok: true, order_id: rs.insertId });
  } catch (e) {
    console.error('POST /orders error =>', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/**
 * Kullanıcının siparişleri
 * GET /api/orders/my
 * Not: frontend ile uyum için total_minor'u total_amount alias'ı ile döndürüyoruz.
 */
r.get('/my', authRequired, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
          id,
          total_minor AS total_amount,
          status,
          created_at
        FROM orders
        WHERE buyer_id = ?
        ORDER BY id DESC
        LIMIT 200`,
      [req.user.id]
    );
    return res.json({ orders: rows });
  } catch (e) {
    console.error('GET /orders/my error =>', e);
    return res.status(500).json({ error: 'server_error' });
  }
});

// backend/routes/orders.js (dosyanın SONUNA ekleyin)
import { authRequired } from '../mw/auth.js';

// GET /api/orders/my
r.get('/my', authRequired, async (req,res)=>{
  const [rows] = await pool.query(
    `SELECT id, total_minor, status, created_at
       FROM orders
      WHERE buyer_id=? ORDER BY id DESC LIMIT 200`, [req.user.id]
  );
  res.json({ orders: rows });
});


export default r;
