// backend/routes/orders.js
import express from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const router = express.Router();

function noStore(res) {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
}

// ---- create order
router.post('/', authRequired, async (req, res) => {
  noStore(res);

  const { listing_id, qty = 1 } = req.body || {};
  if (!listing_id) return res.status(400).json({ ok: false, error: 'MISSING_LISTING_ID' });

  const q = Math.max(1, Number(qty) || 1);
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [L] = await conn.query(
      `SELECT id, seller_id, title, price_minor, currency
         FROM listings
        WHERE id = ? AND (status IS NULL OR status <> 'deleted')
        LIMIT 1`,
      [listing_id]
    );
    if (!L.length) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: 'LISTING_NOT_FOUND' });
    }

    const listing   = L[0];
    const buyerId   = req.user.id;
    const sellerId  = listing.seller_id;
    const unitMinor = Number(listing.price_minor) || 0;
    const currency  = listing.currency || 'TRY';

    if (unitMinor <= 0) {
      await conn.rollback();
      return res.status(400).json({ ok: false, error: 'INVALID_PRICE' });
    }

    const allowSelf = String(process.env.ALLOW_SELF_PURCHASE || '').toLowerCase() === 'true';
    if (buyerId === sellerId && !allowSelf) {
      await conn.rollback();
      return res.status(400).json({ ok: false, error: 'SELF_BUY_FORBIDDEN' });
    }

    const [D] = await conn.query(
      `SELECT id FROM orders
        WHERE buyer_id = ? AND listing_id = ? AND status = 'pending'
        LIMIT 1`,
      [buyerId, listing_id]
    );
    if (D.length) {
      await conn.commit();
      return res.json({ ok: true, order_id: D[0].id, status: 'pending', duplicate: true });
    }

    const subtotal_minor = unitMinor * q;
    const shipping_minor = 0;
    const total_minor    = subtotal_minor + shipping_minor;

    const [ins] = await conn.query(
      `INSERT INTO orders
         (buyer_id, seller_id, listing_id, qty,
          unit_price_minor, currency, subtotal_minor, shipping_minor, total_minor, status)
       VALUES (?,?,?,?, ?,?,?,?,?,'pending')`,
      [buyerId, sellerId, listing_id, q,
       unitMinor, currency, subtotal_minor, shipping_minor, total_minor]
    );

    await conn.commit();
    return res.json({ ok: true, order_id: ins.insertId, status: 'pending' });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error('[orders:create]', e);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  } finally {
    conn.release();
  }
});

// ---- cancel order (BUYER; only pending)
router.post('/:id/cancel', authRequired, async (req, res) => {
  noStore(res);
  const orderId = Number(req.params.id || 0);
  if (!orderId) return res.status(400).json({ ok: false, error: 'INVALID_ID' });

  try {
    const [rows] = await pool.query(
      `SELECT id, buyer_id, status
         FROM orders
        WHERE id = ?
        LIMIT 1`,
      [orderId]
    );
    if (!rows.length) return res.status(404).json({ ok:false, error:'ORDER_NOT_FOUND' });

    const o = rows[0];
    if (o.buyer_id !== req.user.id) {
      return res.status(403).json({ ok:false, error:'FORBIDDEN' });
    }
    if (o.status !== 'pending') {
      return res.status(409).json({ ok:false, error:'NOT_CANCELABLE' });
    }

    await pool.query(
      `UPDATE orders
          SET status = 'cancelled', updated_at = NOW()
        WHERE id = ? AND status = 'pending'`,
      [orderId]
    );

    return res.json({ ok:true, order_id: orderId, status:'cancelled' });
  } catch (e) {
    console.error('[orders:cancel]', e);
    return res.status(500).json({ ok:false, error:'SERVER_ERROR' });
  }
});

// ---- my purchases (buyer side)
router.get('/mine', authRequired, async (req, res) => {
  noStore(res);
  const includeCancelled = String(req.query.include_cancelled||'').trim() === '1';
  const statusClause = includeCancelled ? '' : `AND o.status <> 'cancelled'`;

  try {
    const [rows] = await pool.query(
      `
      SELECT
        o.id, o.listing_id, o.qty,
        o.unit_price_minor, o.currency,
        o.subtotal_minor, o.shipping_minor, o.total_minor,
        o.status, o.created_at,
        l.title, l.slug,
        li.file_url AS thumb_url
      FROM orders o
      JOIN listings l ON l.id = o.listing_id
      LEFT JOIN (
        SELECT li1.listing_id, li1.file_url
        FROM listing_images li1
        JOIN (
          SELECT listing_id, MIN(id) AS first_id
          FROM listing_images
          GROUP BY listing_id
        ) t ON t.first_id = li1.id
      ) li ON li.listing_id = o.listing_id
      WHERE o.buyer_id = ?
        ${statusClause}
      ORDER BY o.id DESC
      LIMIT 100
      `,
      [req.user.id]
    );

    return res.json({ ok: true, orders: rows });
  } catch (e) {
    console.error('[orders:mine]', e);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// ---- my sales (seller side)
router.get('/sold', authRequired, async (req, res) => {
  noStore(res);
  const includeCancelled = String(req.query.include_cancelled||'').trim() === '1';
  const statusClause = includeCancelled ? '' : `AND o.status <> 'cancelled'`;

  try {
    const [rows] = await pool.query(
      `
      SELECT
        o.id, o.listing_id, o.qty,
        o.unit_price_minor, o.currency,
        o.subtotal_minor, o.shipping_minor, o.total_minor,
        o.status, o.created_at,
        l.title, l.slug,
        li.file_url AS thumb_url
      FROM orders o
      JOIN listings l ON l.id = o.listing_id
      LEFT JOIN (
        SELECT li1.listing_id, li1.file_url
        FROM listing_images li1
        JOIN (
          SELECT listing_id, MIN(id) AS first_id
          FROM listing_images
          GROUP BY listing_id
        ) t ON t.first_id = li1.id
      ) li ON li.listing_id = o.listing_id
      WHERE o.seller_id = ?
        ${statusClause}
      ORDER BY o.id DESC
      LIMIT 100
      `,
      [req.user.id]
    );

    return res.json({ ok: true, orders: rows });
  } catch (e) {
    console.error('[orders:sold]', e);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

export default router;
