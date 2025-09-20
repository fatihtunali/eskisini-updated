// backend/routes/users.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

// Basit E.164 normalize (TR pratikleri dahil)
function normalizeE164(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  // sadece rakam ve + kalsın
  s = s.replace(/[^\d+]/g, '');
  // 0xxxxxxxxxx -> +90xxxxxxxxxx
  if (/^0\d{10}$/.test(s)) s = '+9' + s;        // +90… olacak
  // 90xxxxxxxxxx -> +90xxxxxxxxxx
  if (/^90\d{10}$/.test(s)) s = '+' + s;
  // +90 5xx … (zaten + ile başlıyorsa olduğu gibi bırak)
  if (!/^\+\d{8,15}$/.test(s)) return null;
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
 */
r.post('/profile', authRequired, async (req, res) => {
  try {
    let { full_name, phone_e164 } = req.body || {};

    // full_name doğrulama (opsiyonel alan)
    if (full_name != null) {
      full_name = String(full_name).trim();
      if (full_name.length === 0) full_name = null;
      if (full_name && full_name.length > 120) {
        return res.status(400).json({ ok:false, error:'full_name_too_long' });
      }
    } else {
      full_name = null; // değişmesin istiyorsan bu satırı kaldırabilirsin
    }

    // Telefon normalize + benzersizlik
    if (phone_e164 != null && String(phone_e164).trim() !== '') {
      const norm = normalizeE164(phone_e164);
      if (!norm) return res.status(400).json({ ok:false, error:'telefon_gecersiz' });

      // Başka kullanıcıda var mı?
      const [dupe] = await pool.query(
        `SELECT id FROM users WHERE phone_e164=? AND id<>? LIMIT 1`,
        [norm, req.user.id]
      );
      if (dupe.length) {
        return res.status(409).json({ ok:false, error:'telefon_kayitli' });
      }
      phone_e164 = norm;
    } else {
      phone_e164 = null; // değişmesin istiyorsan bu satırı kaldırabilirsin
    }

    // Güncelle (yalnız değişiklik gelmişse set et)
    await pool.query(
      `UPDATE users
          SET full_name = COALESCE(?, full_name),
              phone_e164 = COALESCE(?, phone_e164),
              updated_at = NOW()
        WHERE id = ?`,
      [full_name, phone_e164, req.user.id]
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
