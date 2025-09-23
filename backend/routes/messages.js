// backend/routes/messages.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

/* ---------- Helpers ---------- */
const PREVIEW_LEN = 140;

async function getOtherUserName(myId, buyerId, sellerId) {
  const otherId = (myId === buyerId) ? sellerId : buyerId;
  const [[u]] = await pool.query(`SELECT full_name FROM users WHERE id=?`, [otherId]);
  return u?.full_name || 'Kullanıcı';
}

/* ---------- Thread (Conversation) listem ---------- */
r.get('/threads', authRequired, async (req, res) => {
  const uid = req.user.id;

  const [rows] = await pool.query(
    `SELECT c.id, c.listing_id, c.buyer_id, c.seller_id, c.last_msg_at,
            l.title AS listing_title
       FROM conversations c
  LEFT JOIN listings l ON l.id = c.listing_id
      WHERE c.buyer_id = ? OR c.seller_id = ?
      ORDER BY c.last_msg_at DESC
      LIMIT 200`,
    [uid, uid]
  );

  const threads = [];
  for (const c of rows) {
    const [[last]] = await pool.query(
      `SELECT body, created_at
         FROM messages
        WHERE conversation_id=?
        ORDER BY id DESC
        LIMIT 1`,
      [c.id]
    );
    threads.push({
      id: c.id,
      listing_id: c.listing_id,
      listing_title: c.listing_title,
      updated_at: c.last_msg_at,
      last_message_preview: (last?.body || '').slice(0, PREVIEW_LEN),
      other_user_name: await getOtherUserName(uid, c.buyer_id, c.seller_id),
    });
  }

  res.json({ ok:true, threads });
});

/* ---------- Bir thread’in mesajları ---------- */
r.get('/thread/:id', authRequired, async (req, res) => {
  const uid = req.user.id;
  const convoId = Number(req.params.id || 0);
  if (!convoId) return res.status(400).json({ ok:false, error:'bad_id' });

  const [[c]] = await pool.query(
    `SELECT buyer_id, seller_id FROM conversations WHERE id=?`,
    [convoId]
  );
  if (!c || (c.buyer_id !== uid && c.seller_id !== uid)) {
    return res.status(404).json({ ok:false, error:'not_found' });
  }

  const [msgs] = await pool.query(
    `SELECT id, sender_id, body, created_at
       FROM messages
      WHERE conversation_id=?
      ORDER BY id ASC`,
    [convoId]
  );

  const [participants] = await pool.query(
    `SELECT id, full_name FROM users WHERE id IN (?, ?)`,
    [c.buyer_id, c.seller_id]
  );
  const nameById = Object.fromEntries(participants.map(u => [u.id, u.full_name]));

  res.json({
    ok:true,
    conversation: {
      buyer_id: c.buyer_id,
      buyer_name: nameById[c.buyer_id] || null,
      seller_id: c.seller_id,
      seller_name: nameById[c.seller_id] || null
    },
    messages: msgs
  });
});

/* ---------- Mesaj gönder ---------- */
r.post('/thread/:id', authRequired, async (req, res) => {
  const uid = req.user.id;
  const convoId = Number(req.params.id || 0);
  const body = String(req.body?.body || '').trim();
  if (!convoId) return res.status(400).json({ ok:false, error:'bad_id' });
  if (!body)    return res.status(400).json({ ok:false, error:'empty_body' });

  const [[c]] = await pool.query(
    `SELECT buyer_id, seller_id FROM conversations WHERE id=?`,
    [convoId]
  );
  if (!c || (c.buyer_id !== uid && c.seller_id !== uid)) {
    return res.status(404).json({ ok:false, error:'not_found' });
  }

  await pool.query(
    `INSERT INTO messages (conversation_id, sender_id, body, created_at)
     VALUES (?,?,?, NOW())`,
    [convoId, uid, body]
  );

  await pool.query(
    `UPDATE conversations
        SET last_msg_at = NOW()
      WHERE id = ?`,
    [convoId]
  );

  res.json({ ok:true });
});

/* ---------- Konuşma başlat (varsa getir) ---------- */
/**
 * POST /api/messages/start
 * body: { listing_id, to_user_id? }
 *
 * KURAL:
 *  - Roller listing’e göre belirlenir.
 *  - Aynı (listing_id, buyer_id, seller_id) için tek konuşma tutulur.
 *  - Varsa ID döner, yoksa oluşturulur.
 */
r.post('/start', authRequired, async (req, res) => {
  const uid = req.user.id;
  const listing_id = Number(req.body?.listing_id || 0);
  const to_user_id = req.body?.to_user_id ? Number(req.body.to_user_id) : null;

  if (!listing_id) {
    return res.status(400).json({ ok:false, error:'missing_listing_id' });
  }

  try {
    // İlan & gerçek satıcıyı al
    const [[l]] = await pool.query(
      `SELECT id, seller_id FROM listings WHERE id=? AND (status IS NULL OR status <> 'deleted') LIMIT 1`,
      [listing_id]
    );
    if (!l) return res.status(404).json({ ok:false, error:'listing_not_found' });

    // Roller: giriş yapan kişi satıcıysa karşı taraf "buyer"dır; değilse giriş yapan "buyer"dır
    let buyer_id, seller_id;
    if (uid === l.seller_id) {
      // Satıcı kendisi yazıyorsa, konuşacağı kişi alıcı olmalı:
      if (!to_user_id) return res.status(400).json({ ok:false, error:'missing_to_user_id' });
      buyer_id = to_user_id;
      seller_id = uid;
    } else {
      buyer_id = uid;
      seller_id = l.seller_id;
    }

    // Önce var mı bak
    const [[existing]] = await pool.query(
      `SELECT id FROM conversations
        WHERE listing_id=? AND buyer_id=? AND seller_id=?
        LIMIT 1`,
      [listing_id, buyer_id, seller_id]
    );

    if (existing) {
      return res.json({ ok:true, conversation_id: existing.id, existed: true });
    }

    // Yoksa oluştur (duplicate olursa yakala → ID’yi getir)
    try {
      const [ins] = await pool.query(
        `INSERT INTO conversations (listing_id, buyer_id, seller_id, last_msg_at, created_at)
         VALUES (?, ?, ?, NOW(), NOW())`,
        [listing_id, buyer_id, seller_id]
      );
      return res.json({ ok:true, conversation_id: ins.insertId, existed: false });
    } catch (e) {
      if (e?.code === 'ER_DUP_ENTRY') {
        const [[again]] = await pool.query(
          `SELECT id FROM conversations
            WHERE listing_id=? AND buyer_id=? AND seller_id=?
            LIMIT 1`,
          [listing_id, buyer_id, seller_id]
        );
        if (again) {
          return res.json({ ok:true, conversation_id: again.id, existed: true });
        }
      }
      // başka hata ise ileri fırlat
      throw e;
    }
  } catch (err) {
    console.error('[messages:start]', err);
    return res.status(500).json({ ok:false, error:'server_error' });
  }
});

export default r;
