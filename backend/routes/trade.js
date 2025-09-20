// backend/routes/trade.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

// Yardımcı
function clampInt(v, min, max) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/**
 * Teklif oluştur
 * POST /api/trade/offer
 * body: { listing_id, offered_text, cash_adjust_minor=0 }
 * offerer_id = req.user.id
 * Kurallar:
 *  - İlan var olmalı
 *  - Kendi ilanına teklif verilemez
 *  - cash_adjust_minor >= 0 (ör: 0 = başa baş takas)
 */
r.post('/offer', authRequired, async (req, res) => {
  try {
    const offerer_id = req.user.id;
    const { listing_id, offered_text = null, cash_adjust_minor = 0 } = req.body || {};
    if (!listing_id) return res.status(400).json({ ok: false, error: 'listing_id gerekli' });

    const [[lst]] = await pool.query(
      'SELECT id, seller_id FROM listings WHERE id=? LIMIT 1',
      [listing_id]
    );
    if (!lst) return res.status(404).json({ ok: false, error: 'İlan bulunamadı' });
    if (Number(lst.seller_id) === Number(offerer_id)) {
      return res.status(400).json({ ok: false, error: 'Kendi ilanınıza teklif veremezsiniz' });
    }

    const cashAdj = Math.max(0, clampInt(cash_adjust_minor, 0, 2_000_000_000)); // 0..2B

    const [rs] = await pool.query(
      `INSERT INTO trade_offers
         (listing_id, seller_id, offerer_id, offered_text, cash_adjust_minor, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
      [listing_id, lst.seller_id, offerer_id, offered_text, cashAdj]
    );

    return res.json({ ok: true, id: rs.insertId });
  } catch (e) {
    console.error('POST /trade/offer error =>', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/**
 * Teklife cevap ver / geri çek
 * POST /api/trade/respond
 * body: { offer_id, action }  // 'accept' | 'reject' | 'withdraw'
 * Kurallar:
 *  - 'accept'/'reject' sadece SATICI yapabilir
 *  - 'withdraw' sadece TEKLİF SAHİBİ yapabilir
 *  - Sadece 'pending' teklifler güncellenir
 */
r.post('/respond', authRequired, async (req, res) => {
  try {
    const user_id = req.user.id;
    const { offer_id, action } = req.body || {};
    const allowed = ['accept', 'reject', 'withdraw'];
    if (!offer_id || !allowed.includes(action)) {
      return res.status(400).json({ ok: false, error: 'Geçersiz istek' });
    }

    const [[ofr]] = await pool.query(
      `SELECT id, listing_id, seller_id, offerer_id, status
         FROM trade_offers WHERE id=? LIMIT 1`,
      [offer_id]
    );
    if (!ofr) return res.status(404).json({ ok: false, error: 'Teklif bulunamadı' });
    if (ofr.status !== 'pending') {
      return res.status(400).json({ ok: false, error: 'Bu teklif artık güncellenemez' });
    }

    if (action === 'withdraw') {
      // sadece teklif sahibi
      if (Number(ofr.offerer_id) !== Number(user_id)) {
        return res.status(403).json({ ok: false, error: 'forbidden' });
      }
      await pool.query(
        `UPDATE trade_offers SET status='withdrawn', updated_at=NOW() WHERE id=?`,
        [offer_id]
      );
      return res.json({ ok: true, status: 'withdrawn' });
    }

    // accept/reject sadece satıcı
    if (Number(ofr.seller_id) !== Number(user_id)) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }

    const newStatus = action === 'accept' ? 'accepted' : 'rejected';
    await pool.query(
      `UPDATE trade_offers SET status=?, updated_at=NOW() WHERE id=?`,
      [newStatus, offer_id]
    );
    return res.json({ ok: true, status: newStatus });
  } catch (e) {
    console.error('POST /trade/respond error =>', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/**
 * Benim gönderdiğim teklifler
 * GET /api/trade/my-offers
 */
r.get('/my-offers', authRequired, async (req, res) => {
  try {
    const uid = req.user.id;
    const [rows] = await pool.query(
      `SELECT t.id, t.listing_id, t.offered_text, t.cash_adjust_minor, t.status,
              t.created_at, t.updated_at,
              l.title AS listing_title, l.slug AS listing_slug
         FROM trade_offers t
         JOIN listings l ON l.id = t.listing_id
        WHERE t.offerer_id = ?
        ORDER BY t.updated_at DESC
        LIMIT 200`,
      [uid]
    );
    return res.json({ ok: true, offers: rows });
  } catch (e) {
    console.error('GET /trade/my-offers error =>', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/**
 * Benim ilanlarıma gelen teklifler (satıcı görünümü)
 * GET /api/trade/incoming
 */
r.get('/incoming', authRequired, async (req, res) => {
  try {
    const uid = req.user.id;
    const [rows] = await pool.query(
      `SELECT t.id, t.listing_id, t.offered_text, t.cash_adjust_minor, t.status,
              t.created_at, t.updated_at,
              l.title AS listing_title, l.slug AS listing_slug,
              u.full_name AS offerer_name, u.email AS offerer_email
         FROM trade_offers t
         JOIN listings l ON l.id = t.listing_id
         JOIN users    u ON u.id = t.offerer_id
        WHERE t.seller_id = ?
        ORDER BY t.updated_at DESC
        LIMIT 200`,
      [uid]
    );
    return res.json({ ok: true, offers: rows });
  } catch (e) {
    console.error('GET /trade/incoming error =>', e);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default r;
