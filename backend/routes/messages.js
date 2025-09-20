// backend/routes/messages.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

/**
 * Konuşma başlat + ilk mesaj
 * body: { listing_id, buyer_id?, seller_id, body }
 * buyer_id gönderilmezse auth’tan alınır.
 */
r.post('/start', authRequired, async (req, res) => {
  try {
    const { listing_id, seller_id, body } = req.body || {};
    const buyer_id = req.user?.id || req.body?.buyer_id;

    if (!listing_id || !seller_id || !buyer_id || !body) {
      return res.status(400).json({ ok: false, error: 'Eksik alan' });
    }

    // konuşmayı (listing_id + buyer + seller) benzersizleştir
    await pool.query(
      `INSERT INTO conversations (listing_id, buyer_id, seller_id, last_msg_at)
       VALUES (?,?,?,NOW())
       ON DUPLICATE KEY UPDATE last_msg_at=NOW()`,
      [listing_id, buyer_id, seller_id]
    );

    const [[conv]] = await pool.query(
      `SELECT id FROM conversations WHERE listing_id=? AND buyer_id=? AND seller_id=? LIMIT 1`,
      [listing_id, buyer_id, seller_id]
    );

    // ilk mesaj
    await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, body, created_at)
       VALUES (?,?,?,NOW())`,
      [conv.id, buyer_id, String(body).slice(0, 2000)]
    );

    res.json({ ok: true, conversation_id: conv.id });
  } catch (e) {
    console.error('POST /messages/start error =>', e);
    res.status(400).json({ ok: false, error: e.message });
  }
});

/**
 * Thread listesi (kullanıcının taraf olduğu konuşmalar)
 * GET /api/messages/threads
 * Dönen alanlar: id, other_user_name, updated_at, last_message_preview
 */
r.get('/threads', authRequired, async (req, res) => {
  try {
    const uid = req.user.id;
    // Son mesajın metnini almak için CONCAT(created_at, '\t', body) hilesi
    const [rows] = await pool.query(
      `
      SELECT
        c.id,
        CASE WHEN c.buyer_id=? THEN u2.full_name ELSE u1.full_name END AS other_user_name,
        COALESCE(MAX(m.created_at), c.last_msg_at) AS updated_at,
        SUBSTRING_INDEX(
          MAX(CONCAT(IFNULL(m.created_at, c.last_msg_at), '\t', IFNULL(m.body, ''))),
          '\t', -1
        ) AS last_message_preview
      FROM conversations c
      JOIN users u1 ON u1.id = c.buyer_id
      JOIN users u2 ON u2.id = c.seller_id
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.buyer_id=? OR c.seller_id=?
      GROUP BY c.id
      ORDER BY updated_at DESC
      LIMIT 200
      `,
      [uid, uid, uid]
    );

    res.json({ threads: rows });
  } catch (e) {
    console.error('GET /messages/threads error =>', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/**
 * Bir thread’in mesajlarını getir
 * GET /api/messages/thread/:id
 * Kullanıcı konuşmanın tarafı olmalı
 */
r.get('/thread/:id', authRequired, async (req, res) => {
  try {
    const uid = req.user.id;
    const convId = Number(req.params.id);

    // yetki kontrolü: konuşmanın tarafı mı?
    const [[conv]] = await pool.query(
      `SELECT id FROM conversations WHERE id=? AND (buyer_id=? OR seller_id=?) LIMIT 1`,
      [convId, uid, uid]
    );
    if (!conv) return res.status(403).json({ ok: false, error: 'forbidden' });

    const [rows] = await pool.query(
      `SELECT id, sender_id, body, created_at
         FROM messages
        WHERE conversation_id=?
        ORDER BY id`,
      [convId]
    );

    res.json({ ok: true, messages: rows });
  } catch (e) {
    console.error('GET /messages/thread/:id error =>', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

/**
 * Mesaj gönder
 * POST /api/messages/thread/:id
 * body: { body }
 */
r.post('/thread/:id', authRequired, async (req, res) => {
  try {
    const uid = req.user.id;
    const convId = Number(req.params.id);
    const text = (req.body?.body ?? '').toString().trim();
    if (!text) return res.status(400).json({ ok: false, error: 'empty_body' });

    const [[conv]] = await pool.query(
      `SELECT id FROM conversations WHERE id=? AND (buyer_id=? OR seller_id=?) LIMIT 1`,
      [convId, uid, uid]
    );
    if (!conv) return res.status(403).json({ ok: false, error: 'forbidden' });

    await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, body, created_at)
       VALUES (?,?,?,NOW())`,
      [convId, uid, text.slice(0, 2000)]
    );
    await pool.query(`UPDATE conversations SET last_msg_at=NOW() WHERE id=?`, [convId]);

    res.json({ ok: true });
  } catch (e) {
    console.error('POST /messages/thread/:id error =>', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default r;
