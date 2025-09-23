// backend/routes/orders.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const router = Router();

/* ------------ cache helpers ------------ */
function noStore(res) {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
}

/* ------------ CREATE ORDER ------------ */
/**
 * POST /api/orders
 * body: { listing_id, qty? }
 * - Sadece status='active' ilanlardan olusturur.
 * - Ayni alici + ilan için 'pending' siparisi varsa tekrar kullanir (dupe engeli).
 * - Self purchase ENV ile kontrol edilir: ALLOW_SELF_PURCHASE=true ise izin.
 */
router.post('/', authRequired, async (req, res) => {
  noStore(res);

  const { listing_id, qty = 1 } = req.body || {};
  const listingId = Number(listing_id);
  const q = Math.max(1, Number(qty) || 1);
  if (!Number.isFinite(listingId) || listingId <= 0) {
    return res.status(400).json({ ok: false, error: 'MISSING_LISTING_ID' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Yalnizca aktif ilan
    const [L] = await conn.query(
      `SELECT id, seller_id, title, price_minor, currency
         FROM listings
        WHERE id = ? AND status = 'active'
        LIMIT 1`,
      [listingId]
    );
    if (!L.length) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: 'LISTING_NOT_FOUND_OR_INACTIVE' });
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

    // Self purchase kurali
    const allowSelf = String(process.env.ALLOW_SELF_PURCHASE || '').toLowerCase() === 'true';
    if (buyerId === sellerId && !allowSelf) {
      await conn.rollback();
      return res.status(400).json({ ok: false, error: 'SELF_BUY_FORBIDDEN' });
    }

    // Ayni alici + ilan için pending siparis var mi?
    const [D] = await conn.query(
      `SELECT id FROM orders
        WHERE buyer_id = ? AND listing_id = ? AND status = 'pending'
        LIMIT 1`,
      [buyerId, listingId]
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
          unit_price_minor, currency, subtotal_minor, shipping_minor, total_minor, status, created_at, updated_at)
       VALUES (?,?,?,?, ?,?,?,?,?,'pending', NOW(), NOW())`,
      [buyerId, sellerId, listingId, q,
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

/* ------------ CANCEL ORDER (buyer, only pending) ------------ */
/**
 * POST /api/orders/:id/cancel
 */
router.post('/:id/cancel', authRequired, async (req, res) => {
  noStore(res);
  const orderId = Number(req.params.id || 0);
  if (!Number.isFinite(orderId) || orderId <= 0) {
    return res.status(400).json({ ok: false, error: 'INVALID_ID' });
  }

  try {
    const [[o]] = await pool.query(
      `SELECT id, buyer_id, status
         FROM orders
        WHERE id = ?
        LIMIT 1`,
      [orderId]
    );
    if (!o) return res.status(404).json({ ok:false, error:'ORDER_NOT_FOUND' });
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

/* ------------ MY PURCHASES (buyer side) ------------ */
/**
 * GET /api/orders/mine?include_cancelled=1
 */
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
        (
          SELECT li.file_url
          FROM listing_images li
          WHERE li.listing_id = o.listing_id
          ORDER BY li.sort_order, li.id
          LIMIT 1
        ) AS thumb_url
      FROM orders o
      JOIN listings l ON l.id = o.listing_id
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

/* ------------ MY SALES (seller side) ------------ */
/**
 * GET /api/orders/sold?include_cancelled=1
 */
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
        (
          SELECT li.file_url
          FROM listing_images li
          WHERE li.listing_id = o.listing_id
          ORDER BY li.sort_order, li.id
          LIMIT 1
        ) AS thumb_url
      FROM orders o
      JOIN listings l ON l.id = o.listing_id
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
