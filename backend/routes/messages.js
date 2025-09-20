// backend/routes/messages.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

/**
 * Sohbet başlat (aynı ilan + buyer + seller için tek kayıt)
 * body: { listing_id, buyer_id, seller_id, body }
 * buyer_id/seller_id güvenlik için istersen req.user.id’den de türetebilirsin.
 */
r.post('/start', authRequired, async (req, res) => {
  try {
    let { listing_id, buyer_id, seller_id, body } = req.body || {};
    listing_id = Number(listing_id);
    if (!listing_id || !buyer_id || !seller_id || !body) {
      return res.status(400).json({ ok:false, error:'Eksik' });
    }

    // Tekil tut (unique key varsa ON DUPLICATE ile güncelle)
    await pool.query(
      `INSERT INTO conversations (listing_id, buyer_id, seller_id, last_msg_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE last_msg_at=NOW()`,
      [listing_id, buyer_id, seller_id]
    );

    const [[conv]] = await pool.query(
      `SELECT id FROM conversations WHERE listing_id=? AND buyer_id=? AND seller_id=? LIMIT 1`,
      [listing_id, buyer_id, seller_id]
    );

    // İlk mesajı ekle + preview’ı güncelle
    await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, body, created_at)
       VALUES (?, ?, ?, NOW())`,
      [conv.id, buyer_id, body]
    );
    await pool.query(
      `UPDATE conversations
          SET last_message_preview = ?, last_msg_at=NOW()
        WHERE id=?`,
      [body.slice(0, 200), conv.id]
    );

    res.json({ ok:true, conversation_id: conv.id });
  } catch (e) {
    console.error('POST /messages/start', e);
    res.status(500).json({ ok:false, error:'server_error' });
  }
});

/**
 * Sohbet listem (thread list)
 * Dönüş: id, other_user_name, updated_at, last_message_preview
 */
r.get('/threads', authRequired, async (req, res) => {
  try {
    const myId = req.user.id;
    const [rows] = await pool.query(
      `SELECT c.id,
              CASE
                WHEN c.buyer_id=? THEN u_seller.full_name
                ELSE u_buyer.full_name
              END AS other_user_name,
              c.last_msg_at      AS updated_at,
              c.last_message_preview
         FROM conversations c
         JOIN users u_buyer  ON u_buyer.id  = c.buyer_id
         JOIN users u_seller ON u_seller.id = c.seller_id
        WHERE c.buyer_id=? OR c.seller_id=?
        ORDER BY c.last_msg_at DESC
        LIMIT 200`,
      [myId, myId, myId]
    );
    res.json({ ok:true, threads: rows });
  } catch (e) {
    console.error('GET /messages/threads', e);
    res.status(500).json({ ok:false, error:'server_error' });
  }
});

/**
 * Bir sohbetin mesajlarını getir
 * path: /api/messages/thread/:id
 * return: { messages: [{id,sender_id,body,created_at}, ...] }
 */
r.get('/thread/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok:false, error:'bad_id' });

    // Yetki kontrolü: bu konuşmanın tarafı mıyım?
    const [[conv]] = await pool.query(
      `SELECT id, buyer_id, seller_id FROM conversations WHERE id=? LIMIT 1`, [id]
    );
    if (!conv) return res.status(404).json({ ok:false, error:'not_found' });
    if (conv.buyer_id !== req.user.id && conv.seller_id !== req.user.id) {
      return res.status(403).json({ ok:false, error:'forbidden' });
    }

    const [msgs] = await pool.query(
      `SELECT id, sender_id, body, created_at
         FROM messages
        WHERE conversation_id=?
        ORDER BY id`,
      [id]
    );
    res.json({ ok:true, messages: msgs });
  } catch (e) {
    console.error('GET /messages/thread/:id', e);
    res.status(500).json({ ok:false, error:'server_error' });
  }
});

/**
 * Sohbete yeni mesaj ekle
 * path: /api/messages/thread/:id
 * body: { body }
 */
r.post('/thread/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const text = (req.body?.body || '').toString().trim();
    if (!id || !text) return res.status(400).json({ ok:false, error:'bad_request' });

    // Yetki kontrolü
    const [[conv]] = await pool.query(
      `SELECT id, buyer_id, seller_id FROM conversations WHERE id=? LIMIT 1`, [id]
    );
    if (!conv) return res.status(404).json({ ok:false, error:'not_found' });
    if (conv.buyer_id !== req.user.id && conv.seller_id !== req.user.id) {
      return res.status(403).json({ ok:false, error:'forbidden' });
    }

    await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, body, created_at)
       VALUES (?, ?, ?, NOW())`,
      [id, req.user.id, text]
    );
    await pool.query(
      `UPDATE conversations
          SET last_message_preview=?, last_msg_at=NOW()
        WHERE id=?`,
      [text.slice(0,200), id]
    );

    res.json({ ok:true });
  } catch (e) {
    console.error('POST /messages/thread/:id', e);
    res.status(500).json({ ok:false, error:'server_error' });
  }
});

export default r;
