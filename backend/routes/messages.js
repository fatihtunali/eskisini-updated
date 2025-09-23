// backend/routes/messages.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

/* ---------- Sabitler ---------- */
const PREVIEW_LEN = 140;

/* ---------- Thread (Conversation) listem ---------- */
/**
 * GET /api/messages/threads
 * Opsiyonel: ?limit=200
 * Not: N+1'i önlemek için son mesaj ve karsi tarafin ismini tek sorguda çekiyoruz.
 */
r.get('/threads', authRequired, async (req, res, next) => {
  try {
    const uid = req.user.id;
    const limitNum = parseInt(req.query.limit ?? '200', 10);
    const limit = Math.min(200, Math.max(1, Number.isFinite(limitNum) ? limitNum : 200));

    const [rows] = await pool.query(
      `
      SELECT
        c.id,
        c.listing_id,
        c.buyer_id,
        c.seller_id,
        c.last_msg_at,
        l.title AS listing_title,
        -- son mesaj gövdesi ve zamani
        (
          SELECT m.body
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.id DESC
          LIMIT 1
        ) AS last_body,
        (
          SELECT m.created_at
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.id DESC
          LIMIT 1
        ) AS last_created_at,
        -- karsi tarafin adi
        CASE
          WHEN ? = c.buyer_id THEN u_s.full_name
          ELSE u_b.full_name
        END AS other_user_name,
        -- kapak görseli
        (
          SELECT li.file_url
          FROM listing_images li
          WHERE li.listing_id = c.listing_id
          ORDER BY li.sort_order, li.id
          LIMIT 1
        ) AS cover_url
      FROM conversations c
      LEFT JOIN listings l ON l.id = c.listing_id
      JOIN users u_b ON u_b.id = c.buyer_id
      JOIN users u_s ON u_s.id = c.seller_id
      WHERE c.buyer_id = ? OR c.seller_id = ?
      ORDER BY c.last_msg_at DESC
      LIMIT ?
      `,
      [uid, uid, uid, limit]
    );

    const threads = rows.map(c => ({
      id: c.id,
      listing_id: c.listing_id,
      listing_title: c.listing_title,
      updated_at: c.last_msg_at,
      last_message_preview: (c.last_body || '').slice(0, PREVIEW_LEN),
      other_user_name: c.other_user_name || 'Kullanici',
      cover_url: c.cover_url || null,
      last_message_at: c.last_created_at || c.last_msg_at
    }));

    res.json({ ok: true, threads });
  } catch (e) {
    next(e);
  }
});

/* ---------- Bir thread'in mesajlari ---------- */
/**
 * GET /api/messages/thread/:id
 */
r.get('/thread/:id', authRequired, async (req, res, next) => {
  try {
    const uid = req.user.id;
    const convoId = Number(req.params.id || 0);
    if (!Number.isFinite(convoId) || convoId <= 0) {
      return res.status(400).json({ ok: false, error: 'bad_id' });
    }

    const [[c]] = await pool.query(
      `SELECT buyer_id, seller_id FROM conversations WHERE id=? LIMIT 1`,
      [convoId]
    );
    if (!c || (c.buyer_id !== uid && c.seller_id !== uid)) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }

    const [msgs] = await pool.query(
      `SELECT id, sender_id, body, created_at
         FROM messages
        WHERE conversation_id=?
        ORDER BY id ASC`,
      [convoId]
    );

    const [participants] = await pool.query(
      `SELECT id, full_name FROM users WHERE id IN (?, ?)`
      , [c.buyer_id, c.seller_id]
    );
    const nameById = Object.fromEntries(participants.map(u => [u.id, u.full_name]));

    res.json({
      ok: true,
      conversation: {
        buyer_id: c.buyer_id,
        buyer_name: nameById[c.buyer_id] || null,
        seller_id: c.seller_id,
        seller_name: nameById[c.seller_id] || null
      },
      messages: msgs
    });
  } catch (e) {
    next(e);
  }
});

/* ---------- Mesaj gönder ---------- */
/**
 * POST /api/messages/thread/:id
 * body: { body: string }
 */
r.post('/thread/:id', authRequired, async (req, res, next) => {
  try {
    const uid = req.user.id;
    const convoId = Number(req.params.id || 0);
    const body = String(req.body?.body || '').trim();
    if (!Number.isFinite(convoId) || convoId <= 0) {
      return res.status(400).json({ ok: false, error: 'bad_id' });
    }
    if (!body) {
      return res.status(400).json({ ok: false, error: 'empty_body' });
    }

    const [[c]] = await pool.query(
      `SELECT buyer_id, seller_id FROM conversations WHERE id=? LIMIT 1`,
      [convoId]
    );
    if (!c || (c.buyer_id !== uid && c.seller_id !== uid)) {
      return res.status(404).json({ ok: false, error: 'not_found' });
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

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

/* ---------- Konusma baslat (varsa getir) ---------- */
/**
 * POST /api/messages/start
 * body: { listing_id, to_user_id? }
 *
 * KURAL:
 *  - Roller listing'e göre belirlenir.
 *  - Ayni (listing_id, buyer_id, seller_id) için tek konusma tutulur (uq_conv).
 *  - Varsa ID döner, yoksa olusturulur.
 *  - "aktif" ilan üzerinden mesajlasma kurali uygulanir.
 *  - Kendi kendine mesaj (buyer_id === seller_id) engellenir.
 */
r.post('/start', authRequired, async (req, res) => {
  const uid = req.user.id;
  const listing_id = Number(req.body?.listing_id || 0);
  const to_user_id = req.body?.to_user_id ? Number(req.body.to_user_id) : null;

  if (!Number.isFinite(listing_id) || listing_id <= 0) {
    return res.status(400).json({ ok: false, error: 'missing_listing_id' });
  }

  try {
    // Ilan & satici -> sadece aktif ilanlar
    const [[l]] = await pool.query(
      `SELECT id, seller_id, status
         FROM listings
        WHERE id=? AND status='active'
        LIMIT 1`,
      [listing_id]
    );
    if (!l) return res.status(404).json({ ok: false, error: 'listing_not_found_or_inactive' });

    // Roller
    let buyer_id, seller_id;
    if (uid === l.seller_id) {
      // Satici ise konusacagi kisi alici olmali
      if (!Number.isFinite(to_user_id) || to_user_id <= 0) {
        return res.status(400).json({ ok: false, error: 'missing_to_user_id' });
      }
      buyer_id = to_user_id;
      seller_id = uid;
    } else {
      buyer_id = uid;
      seller_id = l.seller_id;
    }

    // Kendi kendine mesaji engelle
    if (buyer_id === seller_id) {
      return res.status(409).json({ ok: false, error: 'cannot_message_self' });
    }

    // Var mi?
    const [[existing]] = await pool.query(
      `SELECT id FROM conversations
        WHERE listing_id=? AND buyer_id=? AND seller_id=?
        LIMIT 1`,
      [listing_id, buyer_id, seller_id]
    );
    if (existing) {
      return res.json({ ok: true, conversation_id: existing.id, existed: true });
    }

    // Yoksa olustur (dupe yakalanirsa tekrar select ile döndür)
    try {
      const [ins] = await pool.query(
        `INSERT INTO conversations (listing_id, buyer_id, seller_id, last_msg_at, created_at)
         VALUES (?, ?, ?, NOW(), NOW())`,
        [listing_id, buyer_id, seller_id]
      );
      return res.json({ ok: true, conversation_id: ins.insertId, existed: false });
    } catch (e) {
      if (e?.code === 'ER_DUP_ENTRY') {
        const [[again]] = await pool.query(
          `SELECT id FROM conversations
            WHERE listing_id=? AND buyer_id=? AND seller_id=?
            LIMIT 1`,
          [listing_id, buyer_id, seller_id]
        );
        if (again) {
          return res.json({ ok: true, conversation_id: again.id, existed: true });
        }
      }
      throw e;
    }
  } catch (err) {
    console.error('[messages:start]', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default r;
