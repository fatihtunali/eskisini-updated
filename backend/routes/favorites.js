// backend/routes/favorites.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

/**
 * Favori API
 *  - POST    /api/favorites            { listing_id }  => ekle (body)
 *  - POST    /api/favorites/:id                       => ekle (path)
 *  - DELETE  /api/favorites/:id                       => sil
 *  - GET     /api/favorites/my?page=&size=            => favorilerim
 *
 * Not: favorites INSERT/DELETE sonrası sayaçlar tetikleyiciler (trg_favorites_ai/ad) ile güncellenir.
 */

// BODY ile ekle
r.post('/', authRequired, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const listingId = Number(req.body?.listing_id || 0);
    if (!Number.isFinite(listingId) || listingId <= 0) {
      return res.status(400).json({ ok: false, error: 'bad_listing_id' });
    }

    // İlan kontrolü (aktif ve mevcut mu)
    const [[listing]] = await pool.query(
      `SELECT id, seller_id, status FROM listings WHERE id=? LIMIT 1`,
      [listingId]
    );
    if (!listing) return res.status(404).json({ ok:false, error:'listing_not_found' });
    if (listing.status !== 'active') {
      return res.status(409).json({ ok:false, error:'listing_inactive' });
    }
    if (listing.seller_id === userId) {
      return res.status(409).json({ ok:false, error:'cannot_favorite_own_listing' });
    }

    await pool.query(
      `INSERT IGNORE INTO favorites (user_id, listing_id, created_at) VALUES (?, ?, NOW())`,
      [userId, listingId]
    );
    // Sayaç tetikleyiciyle güncelleniyor
    res.json({ ok:true });
  } catch (e) { next(e); }
});

// PATH ile ekle
r.post('/:listing_id', authRequired, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const listingId = Number(req.params.listing_id || 0);
    if (!Number.isFinite(listingId) || listingId <= 0) {
      return res.status(400).json({ ok:false, error:'bad_listing_id' });
    }

    // İlan kontrolü (aktif ve mevcut mu)
    const [[listing]] = await pool.query(
      `SELECT id, seller_id, status FROM listings WHERE id=? LIMIT 1`,
      [listingId]
    );
    if (!listing) return res.status(404).json({ ok:false, error:'listing_not_found' });
    if (listing.status !== 'active') {
      return res.status(409).json({ ok:false, error:'listing_inactive' });
    }
    if (listing.seller_id === userId) {
      return res.status(409).json({ ok:false, error:'cannot_favorite_own_listing' });
    }

    await pool.query(
      `INSERT IGNORE INTO favorites (user_id, listing_id, created_at) VALUES (?, ?, NOW())`,
      [userId, listingId]
    );
    res.json({ ok:true });
  } catch (e) { next(e); }
});

// Sil
r.delete('/:listing_id', authRequired, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const listingId = Number(req.params.listing_id || 0);
    if (!Number.isFinite(listingId) || listingId <= 0) {
      return res.status(400).json({ ok:false, error:'bad_listing_id' });
    }

    await pool.query(
      `DELETE FROM favorites WHERE user_id=? AND listing_id=?`,
      [userId, listingId]
    );
    // Sayaç tetikleyiciyle güncelleniyor
    res.json({ ok:true });
  } catch (e) { next(e); }
});

// Favorilerim
r.get('/my', authRequired, async (req, res, next) => {
  try {
    const pageNum = parseInt(req.query.page ?? '1', 10);
    const sizeNum = parseInt(req.query.size ?? '12', 10);
    const page = Math.max(1, Number.isFinite(pageNum) ? pageNum : 1);
    const size = Math.min(50, Math.max(1, Number.isFinite(sizeNum) ? sizeNum : 12));
    const off  = (page - 1) * size;

    // Toplam sadece aktif ilanlar üzerinden sayılabilir; tercihen favori bağımsız da sayılabilir
    const [[{ cnt }]] = await pool.query(
      `SELECT COUNT(*) cnt
         FROM favorites f
         JOIN listings  l ON l.id = f.listing_id
        WHERE f.user_id=? AND l.status='active'`,
      [req.user.id]
    );

    const [rows] = await pool.query(
      `SELECT
          f.listing_id,
          l.title, l.slug,
          l.price_minor, l.currency,
          l.favorites_count,
          (SELECT file_url FROM listing_images
            WHERE listing_id=l.id ORDER BY sort_order,id LIMIT 1) AS thumb_url,
          f.created_at
       FROM favorites f
       JOIN listings  l ON l.id = f.listing_id
      WHERE f.user_id=? AND l.status='active'
      ORDER BY f.id DESC
      LIMIT ? OFFSET ?`,
      [req.user.id, size, off]
    );

    res.json({ ok:true, total: cnt, page, size, items: rows });
  } catch (e) { next(e); }
});

export default r;
