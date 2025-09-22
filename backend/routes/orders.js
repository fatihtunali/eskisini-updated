// backend/routes/orders.js
import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const router = express.Router();
const ORDERS_PAGE_SIZE = 100;

// Basit auth guard (JWT cookie -> req.auth.id)
function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.auth = { id: payload.id };
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
  }
}

// POST /api/orders  { listing_id, qty? }
router.post('/', requireAuth, async (req, res) => {
  const { listing_id, qty = 1 } = req.body || {};
  if (!listing_id) return res.status(400).json({ ok: false, error: 'MISSING_LISTING_ID' });

  const q = Math.max(1, Number(qty) || 1);
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // İlanı çek (!!! şemana uygun: seller_id + price_minor + currency)
    // Not: Bazı kurulumlarda title/price alan adları farklı olabilir, gerekirse burayı uyarlarsın.
    const [L] = await conn.query(
      `SELECT id,
              seller_id,            -- şemanda kullanıcı sütunu bu
              title,
              price_minor,          -- kuruş/döviz minor
              currency
         FROM listings
        WHERE id = ? AND (status IS NULL OR status <> 'deleted')
        LIMIT 1`,
      [listing_id]
    );

    if (L.length === 0) {
      await conn.rollback();
      return res.status(404).json({ ok: false, error: 'LISTING_NOT_FOUND' });
    }
    const listing = L[0];

    // Aynı buyer + listing için açık pending sipariş var mı?
    const [D] = await conn.query(
      `SELECT id
         FROM orders
        WHERE buyer_id = ? AND listing_id = ? AND status = 'pending'
        LIMIT 1`,
      [req.auth.id, listing_id]
    );
    if (D.length) {
      await conn.commit();
      return res.json({ ok: true, order_id: D[0].id, status: 'pending', duplicate: true });
    }

    // Fiyat minor ise direkt kullan; değilse emniyetli fallback (round(price*100))
    let unit_price_minor = Number(listing.price_minor);
    if (!Number.isFinite(unit_price_minor) || unit_price_minor <= 0) {
      // fallback: price adında decimal alanın varsa kullanmak için örnek:
      // const [L2] = await conn.query('SELECT price FROM listings WHERE id=? LIMIT 1', [listing_id]);
      // unit_price_minor = Math.round(Number(L2[0]?.price || 0) * 100);
      unit_price_minor = 0; // alan yoksa 0, aşağıda 400 döneceğiz
    }
    if (unit_price_minor <= 0) {
      await conn.rollback();
      return res.status(400).json({ ok: false, error: 'INVALID_PRICE' });
    }

    const currency = listing.currency || 'TRY';
    const subtotal_minor = unit_price_minor * q;
    const shipping_minor = 0;
    const total_minor = subtotal_minor + shipping_minor;

    // Siparişi oluştur
    const [ins] = await conn.query(
      `INSERT INTO orders
       (buyer_id, seller_id, listing_id, qty,
        unit_price_minor, currency, subtotal_minor, shipping_minor, total_minor, status)
       VALUES (?,?,?,?, ?,?,?,?,?,'pending')`,
      [req.auth.id, listing.seller_id, listing_id, q,
       unit_price_minor, currency, subtotal_minor, shipping_minor, total_minor]
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

// GET /api/orders/mine
router.get('/mine', requireAuth, async (req, res) => {
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
      ORDER BY o.id DESC
      LIMIT 100
      `,
      [req.auth.id]
    );

    return res.json({ ok: true, orders: rows });
  } catch (e) {
    console.error('[orders:mine]', e);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});



// POST /api/orders/:id/cancel
router.post('/:id/cancel', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: 'BAD_ID' });

  try {
    const [aff] = await pool.query(
      `UPDATE orders
          SET status='cancelled'
        WHERE id = ? AND buyer_id = ? AND status = 'pending'`,
      [id, req.auth.id]
    );
    if (aff.affectedRows === 0) {
      return res.status(400).json({ ok: false, error: 'NOT_CANCELLABLE' });
    }
    return res.json({ ok: true, id, status: 'cancelled' });
  } catch (e) {
    console.error('[orders:cancel]', e);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

export default router;
