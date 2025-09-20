// backend/routes/messages.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

/** Thread listesi (Mesajlarım) */
r.get('/threads', authRequired, async (req,res)=>{
  const uid = req.user.id;
  const [rows] = await pool.query(
    `SELECT t.id,
            CASE WHEN t.user1_id=? THEN u2.full_name ELSE u1.full_name END AS other_user_name,
            t.updated_at,
            t.last_message_preview
       FROM threads t
       JOIN users u1 ON u1.id=t.user1_id
       JOIN users u2 ON u2.id=t.user2_id
      WHERE t.user1_id=? OR t.user2_id=?
      ORDER BY t.updated_at DESC
      LIMIT 200`,
    [uid, uid, uid]
  );
  res.json({ threads: rows });
});

/** Thread içi mesajları getir */
r.get('/thread/:id', authRequired, async (req,res)=>{
  const uid = req.user.id;
  const threadId = Number(req.params.id);
  // Kullanıcının bu thread’e erişimi var mı?
  const [[thr]] = await pool.query(`SELECT user1_id,user2_id FROM threads WHERE id=?`, [threadId]);
  if (!thr || (thr.user1_id !== uid && thr.user2_id !== uid)) {
    return res.status(404).json({ ok:false, error:'not_found' });
  }
  const [msgs] = await pool.query(
    `SELECT id, sender_id, body, created_at
       FROM messages WHERE thread_id=?
      ORDER BY id ASC`,
    [threadId]
  );
  res.json({ ok:true, messages: msgs });
});

/** Thread’e mesaj ekle */
r.post('/thread/:id', authRequired, async (req,res)=>{
  const uid = req.user.id;
  const threadId = Number(req.params.id);
  const body = (req.body?.body||'').toString().trim();
  if (!body) return res.status(400).json({ ok:false, error:'empty_body' });

  const [[thr]] = await pool.query(`SELECT user1_id,user2_id FROM threads WHERE id=?`, [threadId]);
  if (!thr || (thr.user1_id !== uid && thr.user2_id !== uid)) {
    return res.status(404).json({ ok:false, error:'not_found' });
  }

  await pool.query(`INSERT INTO messages (thread_id, sender_id, body) VALUES (?,?,?)`, [threadId, uid, body]);
  await pool.query(
    `UPDATE threads SET last_message_preview=?, updated_at=NOW() WHERE id=?`,
    [body.slice(0,140), threadId]
  );
  res.json({ ok:true });
});

export default r;
