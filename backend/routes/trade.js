// backend/routes/trade.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

/**
 * NOTLAR
 * - Global exclusivity YOK: aynı ilanda farklı kullanıcılar eşzamanlı "pending" teklif açabilir.
 * - Sadece aynı kullanıcının aynı ilanda ikinci "pending" teklifi INSERT edilmez (kullanıcı bazlı kısıt).
 * - Satıcı, gelen teklifleri /offer/:id/accept veya /offer/:id/reject ile yönetir.
 * - Teklif sahibi pending durumdaki teklifini /offer/:id/withdraw ile geri çekebilir.
 */

/** Teklif oluştur */
r.post('/offer', authRequired, async (req, res) => {
  try {
    const uid = req.user.id;
    const listing_id = Number(req.body?.listing_id || 0);
    const offered_text = (req.body?.offered_text || '').toString().trim() || null;
    const cash_adjust_minor = Number(req.body?.cash_adjust_minor || 0);

    if (!listing_id) {
      return res.status(400).json({ ok:false, error:'bad_listing_id' });
    }
    if (!Number.isFinite(cash_adjust_minor)) {
      return res.status(400).json({ ok:false, error:'bad_cash' });
    }

    // İlanı al
    const [[l]] = await pool.query(
      `SELECT id, seller_id, status FROM listings WHERE id=? LIMIT 1`,
      [listing_id]
    );
    if (!l) return res.status(404).json({ ok:false, error:'listing_not_found' });
    if (l.status !== 'active') return res.status(409).json({ ok:false, error:'listing_not_active' });
    if (l.seller_id === uid) return res.status(400).json({ ok:false, error:'cant_offer_own_listing' });

    // Aynı kullanıcı -> aynı ilanda halihazırda pending teklifi varsa yenisini açma
    const [[exists]] = await pool.query(
      `SELECT id FROM trade_offers
        WHERE listing_id=? AND offerer_id=? AND status='pending'
        LIMIT 1`,
      [listing_id, uid]
    );
    if (exists) {
      return res.status(409).json({ ok:false, error:'offer_already_pending', offer_id: exists.id });
    }

    // INSERT (seller_id tabloya yazmıyoruz; join ile l.seller_id alınır)
    const [ins] = await pool.query(
      `INSERT INTO trade_offers
         (listing_id, offerer_id, offered_text, cash_adjust_minor, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', NOW(), NOW())`,
      [listing_id, uid, offered_text, cash_adjust_minor]
    );

    return res.json({ ok:true, id: ins.insertId });
  } catch (e) {
    console.error('POST /trade/offer error =>', e);
    return res.status(500).json({ ok:false, error:'server_error' });
  }
});

/** Benim tekliflerim (gönderdiğim / aldığım) */
r.get('/my', authRequired, async (req, res) => {
  const uid = req.user.id;
  const role = (req.query.role || 'sent'); // 'sent' | 'received'

  if (role === 'received') {
    // Satıcı olduğum ilanlara gelen teklifler
    const [rows] = await pool.query(
      `SELECT o.id, o.listing_id, o.offerer_id, o.offered_text, o.cash_adjust_minor, o.status, o.created_at, o.updated_at,
              l.title, l.price_minor, l.currency,
              u.full_name AS offerer_name
         FROM trade_offers o
         JOIN listings l ON l.id = o.listing_id
         JOIN users    u ON u.id = o.offerer_id
        WHERE l.seller_id = ?
        ORDER BY o.created_at DESC
        LIMIT 200`,
      [uid]
    );
    return res.json({ ok:true, items: rows, role: 'received' });
  }

  // Gönderdiğim teklifler
  const [rows] = await pool.query(
    `SELECT o.id, o.listing_id, o.offerer_id, o.offered_text, o.cash_adjust_minor, o.status, o.created_at, o.updated_at,
            l.title, l.price_minor, l.currency,
            s.full_name AS seller_name
       FROM trade_offers o
       JOIN listings l ON l.id = o.listing_id
       JOIN users    s ON s.id = l.seller_id
      WHERE o.offerer_id = ?
      ORDER BY o.created_at DESC
      LIMIT 200`,
    [uid]
  );
  return res.json({ ok:true, items: rows, role: 'sent' });
});

/** (Satıcı) Bir ilandaki tüm teklifleri getir */
r.get('/listing/:listing_id/offers', authRequired, async (req, res) => {
  const uid = req.user.id;
  const listing_id = Number(req.params.listing_id || 0);
  if (!listing_id) return res.status(400).json({ ok:false, error:'bad_listing_id' });

  const [[l]] = await pool.query(
    `SELECT id, seller_id FROM listings WHERE id=? LIMIT 1`,
    [listing_id]
  );
  if (!l) return res.status(404).json({ ok:false, error:'listing_not_found' });
  if (l.seller_id !== uid) return res.status(403).json({ ok:false, error:'forbidden' });

  const [rows] = await pool.query(
    `SELECT o.id, o.offerer_id, o.offered_text, o.cash_adjust_minor, o.status, o.created_at, o.updated_at,
            u.full_name AS offerer_name
       FROM trade_offers o
       JOIN users u ON u.id = o.offerer_id
      WHERE o.listing_id = ?
      ORDER BY o.created_at DESC`,
    [listing_id]
  );

  return res.json({ ok:true, listing_id, offers: rows });
});

/** (Satıcı) Teklifi KABUL ET */
r.post('/offer/:id/accept', authRequired, async (req, res) => {
  const uid = req.user.id;
  const offerId = Number(req.params.id || 0);
  if (!offerId) return res.status(400).json({ ok:false, error:'bad_offer_id' });

  // Teklifi ve ilgili ilanı al
  const [[o]] = await pool.query(
    `SELECT o.id, o.status, o.listing_id, l.seller_id
       FROM trade_offers o
       JOIN listings l ON l.id = o.listing_id
      WHERE o.id = ?
      LIMIT 1`,
    [offerId]
  );
  if (!o) return res.status(404).json({ ok:false, error:'offer_not_found' });
  if (o.seller_id !== uid) return res.status(403).json({ ok:false, error:'forbidden' });
  if (o.status !== 'pending') return res.status(409).json({ ok:false, error:'not_pending' });

  await pool.query(
    `UPDATE trade_offers
        SET status='accepted', updated_at=NOW()
      WHERE id=? AND status='pending'`,
    [offerId]
  );

  // Not: diğer pending teklifleri otomatik reddetmiyoruz—satıcı istediğini sonra da kabul/ret edebilir.
  return res.json({ ok:true, offer_id: offerId, status:'accepted' });
});

/** (Satıcı) Teklifi REDDET */
r.post('/offer/:id/reject', authRequired, async (req, res) => {
  const uid = req.user.id;
  const offerId = Number(req.params.id || 0);
  if (!offerId) return res.status(400).json({ ok:false, error:'bad_offer_id' });

  const [[o]] = await pool.query(
    `SELECT o.id, o.status, o.listing_id, l.seller_id
       FROM trade_offers o
       JOIN listings l ON l.id = o.listing_id
      WHERE o.id = ?
      LIMIT 1`,
    [offerId]
  );
  if (!o) return res.status(404).json({ ok:false, error:'offer_not_found' });
  if (o.seller_id !== uid) return res.status(403).json({ ok:false, error:'forbidden' });
  if (o.status !== 'pending') return res.status(409).json({ ok:false, error:'not_pending' });

  await pool.query(
    `UPDATE trade_offers
        SET status='rejected', updated_at=NOW()
      WHERE id=? AND status='pending'`,
    [offerId]
  );

  return res.json({ ok:true, offer_id: offerId, status:'rejected' });
});

/** (Teklif Sahibi) Teklifi GERİ ÇEK (withdraw) */
r.post('/offer/:id/withdraw', authRequired, async (req, res) => {
  const uid = req.user.id;
  const offerId = Number(req.params.id || 0);
  if (!offerId) return res.status(400).json({ ok:false, error:'bad_offer_id' });

  const [[o]] = await pool.query(
    `SELECT id, offerer_id, status FROM trade_offers WHERE id=? LIMIT 1`,
    [offerId]
  );
  if (!o) return res.status(404).json({ ok:false, error:'offer_not_found' });
  if (o.offerer_id !== uid) return res.status(403).json({ ok:false, error:'forbidden' });
  if (o.status !== 'pending') return res.status(409).json({ ok:false, error:'not_pending' });

  await pool.query(
    `UPDATE trade_offers
        SET status='withdrawn', updated_at=NOW()
      WHERE id=? AND status='pending'`,
    [offerId]
  );

  return res.json({ ok:true, offer_id: offerId, status:'withdrawn' });
});

export default r;
