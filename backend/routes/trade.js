// backend/routes/trade.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

/** Teklif oluştur */
r.post('/offer', authRequired, async (req, res) => {
  try {
    const uid = req.user.id;
    const listing_id = Number(req.body?.listing_id || 0);
    const offered_text = (req.body?.offered_text || '').toString().trim() || null;
    const cash_adjust_minor = Number(req.body?.cash_adjust_minor || 0);

    if (!listing_id) return res.status(400).json({ ok:false, error:'bad_listing_id' });
    if (!Number.isFinite(cash_adjust_minor)) {
      return res.status(400).json({ ok:false, error:'bad_cash' });
    }

    // İlanı al, satıcı kim?
    const [[l]] = await pool.query(
      `SELECT id, seller_id, status FROM listings WHERE id=? LIMIT 1`,
      [listing_id]
    );
    if (!l) return res.status(404).json({ ok:false, error:'listing_not_found' });
    if (l.status !== 'active') return res.status(409).json({ ok:false, error:'listing_not_active' });
    if (l.seller_id === uid) return res.status(400).json({ ok:false, error:'cant_offer_own_listing' });

    // Aynı ilanda bekleyen teklifin varsa yeniden oluşturma (isteğe bağlı koruma)
    const [[exists]] = await pool.query(
      `SELECT id FROM trade_offers
        WHERE listing_id=? AND offerer_id=? AND status='pending' LIMIT 1`,
      [listing_id, uid]
    );
    if (exists) return res.status(409).json({ ok:false, error:'offer_already_pending', offer_id: exists.id });

    // >>> DÜZELTME: seller_id'yi tabloya yazmıyoruz <<<
    const [ins] = await pool.query(
      `INSERT INTO trade_offers
         (listing_id, offerer_id, offered_text, cash_adjust_minor, status, created_at, updated_at)
       VALUES (?,?,?,?, 'pending', NOW(), NOW())`,
      [listing_id, uid, offered_text, cash_adjust_minor]
    );

    res.json({ ok:true, id: ins.insertId });
  } catch (e) {
    console.error('POST /trade/offer error =>', e);
    res.status(500).json({ ok:false, error:'server_error' });
  }
});

/** Benim tekliflerim (gönderdiğim / aldığım) */
r.get('/my', authRequired, async (req, res) => {
  const uid = req.user.id;
  const role = (req.query.role || 'sent'); // 'sent' veya 'received'

  if (role === 'received') {
    // Satıcı olduğum ilanlara gelen teklifler
    const [rows] = await pool.query(
      `SELECT o.id, o.listing_id, o.offerer_id, o.offered_text, o.cash_adjust_minor, o.status, o.created_at,
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
    `SELECT o.id, o.listing_id, o.offerer_id, o.offered_text, o.cash_adjust_minor, o.status, o.created_at,
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
  res.json({ ok:true, items: rows, role: 'sent' });
});

export default r;
