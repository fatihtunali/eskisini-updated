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
 * Not: favorites INSERT/DELETE sonrası sayacı tetikleyiciler (trg_favorites_ai/ad) günceller.
 */

// BODY ile ekle
r.post('/', authRequired, async (req, res) => {
  const userId = req.user.id;
  const listingId = Number(req.body?.listing_id || 0);
  if (!listingId) return res.status(400).json({ ok:false, error:'bad_listing_id' });

  const [[exists]] = await pool.query(
    `SELECT id FROM listings WHERE id=? LIMIT 1`,
    [listingId]
  );
  if (!exists) return res.status(404).json({ ok:false, error:'listing_not_found' });

  await pool.query(
    `INSERT IGNORE INTO favorites (user_id, listing_id, created_at) VALUES (?, ?, NOW())`,
    [userId, listingId]
  );
  // Sayaç tetikleyiciyle güncelleniyor
  res.json({ ok:true });
});

// PATH ile ekle
r.post('/:listing_id', authRequired, async (req, res) => {
  const userId = req.user.id;
  const listingId = Number(req.params.listing_id || 0);
  if (!listingId) return res.status(400).json({ ok:false, error:'bad_listing_id' });

  const [[exists]] = await pool.query(
    `SELECT id FROM listings WHERE id=? LIMIT 1`,
    [listingId]
  );
  if (!exists) return res.status(404).json({ ok:false, error:'listing_not_found' });

  await pool.query(
    `INSERT IGNORE INTO favorites (user_id, listing_id, created_at) VALUES (?, ?, NOW())`,
    [userId, listingId]
  );
  res.json({ ok:true });
});

// Sil
r.delete('/:listing_id', authRequired, async (req, res) => {
  const userId = req.user.id;
  const listingId = Number(req.params.listing_id || 0);
  if (!listingId) return res.status(400).json({ ok:false, error:'bad_listing_id' });

  await pool.query(
    `DELETE FROM favorites WHERE user_id=? AND listing_id=?`,
    [userId, listingId]
  );
  // Sayaç tetikleyiciyle güncelleniyor
  res.json({ ok:true });
});

// Favorilerim
r.get('/my', authRequired, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const size = Math.min(50, Math.max(1, parseInt(req.query.size || '12', 10)));
  const off  = (page - 1) * size;

  const [[{ cnt }]] = await pool.query(
    `SELECT COUNT(*) cnt FROM favorites WHERE user_id=?`,
    [req.user.id]
  );

  const [rows] = await pool.query(
    `SELECT
        f.listing_id,
        l.title, l.slug,
        l.price_minor, l.currency,
        l.favorites_count,
        (SELECT file_url FROM listing_images WHERE listing_id=l.id ORDER BY sort_order,id LIMIT 1) AS thumb_url,
        f.created_at
     FROM favorites f
     JOIN listings  l ON l.id = f.listing_id
     WHERE f.user_id=?
     ORDER BY f.id DESC
     LIMIT ? OFFSET ?`,
    [req.user.id, size, off]
  );

  res.json({ ok:true, total: cnt, page, size, items: rows });
});

export default r;
