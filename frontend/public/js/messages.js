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
/** GET /api/messages/threads */
r.get('/threads', authRequired, async (req, res) => {
  const uid = req.user.id;

  // Kullanıcının taraf olduğu tüm konuşmalar
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

  // Son mesaj önizlemesi ve karşı taraf adı
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
/** GET /api/messages/thread/:id */
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
  res.json({ ok:true, messages: msgs });
});

/* ---------- Mesaj gönder ---------- */
/** POST /api/messages/thread/:id  body:{ body } */
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
/** POST /api/messages/start  body:{ listing_id, to_user_id } */
r.post('/start', authRequired, async (req, res) => {
  const uid = req.user.id;
  const listing_id = Number(req.body?.listing_id || 0);
  const to_user_id = Number(req.body?.to_user_id || 0);
  if (!listing_id || !to_user_id) {
    return res.status(400).json({ ok:false, error:'missing_params' });
  }
  if (to_user_id === uid) {
    return res.status(400).json({ ok:false, error:'cant_message_self' });
  }

  // İlan ve satıcıyı al
  const [[l]] = await pool.query(`SELECT id, seller_id FROM listings WHERE id=?`, [listing_id]);
  if (!l) return res.status(404).json({ ok:false, error:'listing_not_found' });

  // Buyer/Seller rolünü belirle
  let buyer_id, seller_id;
  if (uid === l.seller_id) {
    buyer_id = to_user_id;
    seller_id = uid;
  } else {
    buyer_id = uid;
    seller_id = l.seller_id;
  }

  // Mevcut konuşma var mı?
  const [[existing]] = await pool.query(
    `SELECT id FROM conversations
      WHERE listing_id=? AND buyer_id=? AND seller_id=? LIMIT 1`,
    [listing_id, buyer_id, seller_id]
  );

  if (existing) {
    return res.json({ ok:true, conversation_id: existing.id, existed: true });
  }

  // Yoksa oluştur
  const [ins] = await pool.query(
    `INSERT INTO conversations (listing_id, buyer_id, seller_id, last_msg_at, created_at)
     VALUES (?, ?, ?, NOW(), NOW())`,
    [listing_id, buyer_id, seller_id]
  );

  res.json({ ok:true, conversation_id: ins.insertId, existed: false });
});

export default r;
