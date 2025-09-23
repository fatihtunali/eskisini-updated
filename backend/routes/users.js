// backend/routes/users.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

// Basit E.164 normalize (TR pratikleri dahil)
function normalizeE164(raw) {
  if (raw == null) return undefined; // alan gelmemişse undefined dön
  let s = String(raw).trim();
  if (s === '') return null;         // boş string => NULL olarak temizle
  // sadece rakam ve + kalsın
  s = s.replace(/[^\d+]/g, '');
  // 0xxxxxxxxxx -> +90xxxxxxxxxx
  if (/^0\d{10}$/.test(s)) s = '+9' + s;     // +90… olacak
  // 90xxxxxxxxxx -> +90xxxxxxxxxx
  if (/^90\d{10}$/.test(s)) s = '+' + s;
  // +90 5xx … (zaten + ile başlıyorsa olduğu gibi bırak)
  if (!/^\+\d{8,15}$/.test(s)) return null;  // geçersiz => null (400 döndüreceğiz)
  return s;
}

/**
 * Profil getir (opsiyonel; /api/auth/me de var)
 * GET /api/users/profile
 */
r.get('/profile', authRequired, async (req, res) => {
  const [[u]] = await pool.query(
    `SELECT id, email, full_name, phone_e164, kyc_status, is_kyc_verified
       FROM users WHERE id=? LIMIT 1`, [req.user.id]
  );
  if (!u) return res.status(404).json({ ok:false, error:'not_found' });
  res.json({ ok:true, user:u });
});

/**
 * Profil güncelle
 * POST /api/users/profile
 * body: { full_name?, phone_e164? }
 *
 * Not:
 *  - Alan gönderilmemişse hiç dokunmayız.
 *  - full_name = "" gönderilirse NULL’a çekilir.
 *  - phone_e164 = "" gönderilirse NULL’a çekilir (telefon temizleme).
 */
r.post('/profile', authRequired, async (req, res) => {
  try {
    const body = req.body || {};
    let { full_name } = body;
    let phone_e164 = body.hasOwnProperty('phone_e164') ? body.phone_e164 : undefined;

    // full_name doğrulama (yalnızca gönderildiyse)
    if (full_name !== undefined) {
      full_name = String(full_name).trim();
      if (full_name === '') full_name = null; // boşsa temizle
      if (full_name && full_name.length > 120) {
        return res.status(400).json({ ok:false, error:'full_name_too_long' });
      }
    }

    // Telefon normalize + benzersizlik (yalnızca gönderildiyse)
    if (phone_e164 !== undefined) {
      const norm = normalizeE164(phone_e164); // undefined|null|'+90…'
      if (norm === null) {
        return res.status(400).json({ ok:false, error:'telefon_gecersiz' });
      }
      if (norm !== undefined) {
        // başka kullanıcıda var mı?
        const [dupe] = await pool.query(
          `SELECT id FROM users WHERE phone_e164=? AND id<>? LIMIT 1`,
          [norm, req.user.id]
        );
        if (dupe.length) {
          return res.status(409).json({ ok:false, error:'telefon_kayitli' });
        }
      }
      phone_e164 = norm; // null (sil) / '+90…' (güncelle) / undefined (dokunma)
    }

    // Dinamik SET kur — yalnız gönderilen alanlar
    const sets = [];
    const params = [];

    if (full_name !== undefined) {
      sets.push('full_name = ?');
      params.push(full_name); // null olabilir
    }
    if (phone_e164 !== undefined) {
      sets.push('phone_e164 = ?');
      params.push(phone_e164); // null olabilir
    }

    if (sets.length === 0) {
      return res.status(400).json({ ok:false, error:'nothing_to_update' });
    }

    sets.push('updated_at = NOW()');

    await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = ?`,
      [...params, req.user.id]
    );

    // Güncellenmiş veriyi döndür
    const [[u]] = await pool.query(
      `SELECT id, email, full_name, phone_e164, kyc_status, is_kyc_verified
         FROM users WHERE id=? LIMIT 1`, [req.user.id]
    );

    return res.json({ ok:true, user:u });
  } catch (e) {
    console.error('POST /users/profile error =>', e);
    return res.status(500).json({ ok:false, error:'server_error' });
  }
});

export default r;
