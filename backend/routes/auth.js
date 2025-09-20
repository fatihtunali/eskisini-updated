console.log('[ROUTER] auth routes loaded');


// backend/routes/auth.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { signToken, authRequired } from '../mw/auth.js';

const router = Router();

// REGISTER (sağlamlaştırılmış, Türkçe hata mesajları)
router.post('/register', async (req, res) => {
  try {
    // --- Geçici debug: gelen body'yi gör ---
    console.log('REGISTER body =>', req.body);

    let { email, password, full_name, username, phone_e164, tc_no } = req.body || {};

    // Zorunlu alan denetimi
    const missing = [];
    if (!email)    missing.push('email');
    if (!password) missing.push('password');
    // full_name boş bırakılabilir; biz üreteceğiz
    if (missing.length) {
      return res.status(400).json({ error: 'eksik_alan', fields: missing });
    }

    // Normalize
    email = String(email).trim().toLowerCase();
    full_name = (full_name && String(full_name).trim()) || email.split('@')[0];

    // Email benzersiz mi?
    const [eExists] = await pool.query(`SELECT id FROM users WHERE email=? LIMIT 1`, [email]);
    if (eExists.length) return res.status(400).json({ error: 'email_kayitli' });

    // Username opsiyonel
    if (username) {
      username = String(username).trim().toLowerCase();
      if (username.length < 3) return res.status(400).json({ error: 'kullanici_adi_kisa' });
      const [uExists] = await pool.query(`SELECT id FROM users WHERE username=? LIMIT 1`, [username]);
      if (uExists.length) return res.status(400).json({ error: 'kullanici_adi_kayitli' });
    } else {
      username = null;
    }

    // Telefon opsiyonel (basit E.164)
    if (phone_e164) {
      let raw = String(phone_e164).replace(/[^\d+]/g, '');
      if (/^0\d{10}$/.test(raw)) raw = '+9' + raw;   // 0xxxxxxxxxx -> +90xxxxxxxxxx (TR pratik)
      if (/^90\d{10}$/.test(raw)) raw = '+' + raw;   // 90xxxxxxxxxx -> +90xxxxxxxxxx
      if (!/^\+\d{8,15}$/.test(raw)) return res.status(400).json({ error: 'telefon_gecersiz' });
      phone_e164 = raw;
      const [pExists] = await pool.query(`SELECT id FROM users WHERE phone_e164=? LIMIT 1`, [phone_e164]);
      if (pExists.length) return res.status(400).json({ error: 'telefon_kayitli' });
    } else {
      phone_e164 = null;
    }

    // TC opsiyonel
    if (tc_no) {
      const digits = String(tc_no).replace(/\D/g, '');
      if (digits.length !== 11) return res.status(400).json({ error: 'tc_gecersiz' });
      const [tExists] = await pool.query(`SELECT id FROM users WHERE tc_no=? LIMIT 1`, [digits]);
      if (tExists.length) return res.status(400).json({ error: 'tc_kayitli' });
      tc_no = digits;
    } else {
      tc_no = null;
    }

    // Şifrele ve kaydet
    const hash = await bcrypt.hash(String(password), 12);
    const [r] = await pool.query(
      `INSERT INTO users
        (email, password_hash, full_name, username, phone_e164, tc_no, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [email, hash, full_name, username, phone_e164, tc_no]
    );

const id = r.insertId;
const token = signToken({ id });

// Cookie ayarları
const cookieOpts = {
  httpOnly: true,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000
};
// Prod’da ayrı origin kullanıyorsan .env’den yönet:
if (process.env.COOKIE_DOMAIN) cookieOpts.domain = process.env.COOKIE_DOMAIN;
if (process.env.COOKIE_SECURE === 'true') cookieOpts.secure = true;
if (process.env.COOKIE_SAMESITE) cookieOpts.sameSite = process.env.COOKIE_SAMESITE;
else cookieOpts.sameSite = process.env.COOKIE_SECURE === 'true' ? 'none' : 'lax';

res.cookie('token', token, cookieOpts);
res.json({
  ok: true,
  token,
  user: { id, email, full_name, username, phone_e164, kyc_status: 'none' }
});

  } catch (e) {
    console.error('REGISTER error =>', e);
    res.status(500).json({ error: 'sunucu_hatasi' });
  }
});


/* ========== LOGIN ========== */
router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body || {};
    if(!email || !password) return res.status(400).json({ error: 'email_and_password_required' });
    email = String(email).trim().toLowerCase();

    const [rows] = await pool.query(
      `SELECT id, email, full_name, password_hash, kyc_status, is_kyc_verified
         FROM users WHERE email=? LIMIT 1`,
      [email]
    );
    const user = rows[0];
    if(!user) return res.status(400).json({ error:'invalid_credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if(!ok) return res.status(400).json({ error:'invalid_credentials' });

const token = signToken({ id:user.id });

// Cookie ayarları
const cookieOpts = {
  httpOnly: true,
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000
};
if (process.env.COOKIE_DOMAIN) cookieOpts.domain = process.env.COOKIE_DOMAIN;
if (process.env.COOKIE_SECURE === 'true') cookieOpts.secure = true;
if (process.env.COOKIE_SAMESITE) cookieOpts.sameSite = process.env.COOKIE_SAMESITE;
else cookieOpts.sameSite = process.env.COOKIE_SECURE === 'true' ? 'none' : 'lax';

res.cookie('token', token, cookieOpts);
res.json({
  ok:true,
  token,
  user: {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    kyc_status: user.kyc_status,
    is_kyc_verified: !!user.is_kyc_verified
  }
});

  } catch (e) {
    console.error(e);
    res.status(500).json({ error:'server_error' });
  }
});

// LOGOUT — token cookie'yi temizle
router.post('/logout', (req, res) => {
  console.log('[ROUTER] LOGOUT hit', req.method, req.originalUrl);

  const cookieOpts = { path: '/' };
  if (process.env.COOKIE_DOMAIN) cookieOpts.domain = process.env.COOKIE_DOMAIN;
  res.clearCookie('token', cookieOpts);
  return res.json({ ok: true });
});

router.get('/logout', (req, res) => {
  console.log('[ROUTER] LOGOUT hit', req.method, req.originalUrl);

  const cookieOpts = { path: '/' };
  if (process.env.COOKIE_DOMAIN) cookieOpts.domain = process.env.COOKIE_DOMAIN;
  res.clearCookie('token', cookieOpts);
  return res.json({ ok: true });
});

/* ========== ME ========== */
router.get('/me', authRequired, async (req, res) => {
  res.json({ ok:true, user: req.user });
});

/* ========== KYC (TC 11 hane) ========== */
router.post('/kyc', authRequired, async (req, res) => {
  try {
    const tc_raw = (req.body?.tc_no ?? '').toString();
    const digits = tc_raw.replace(/\D/g,'');
    if(digits.length !== 11){
      return res.status(400).json({ error:'tc_invalid', reason:'TC must be 11 digits' });
    }
    // aynı TC başka kullanıcıda olmasın
    const [dupe] = await pool.query(`SELECT id FROM users WHERE tc_no=? AND id<>? LIMIT 1`, [digits, req.user.id]);
    if(dupe.length) return res.status(400).json({ error: 'tc_taken' });

    await pool.query(
      `UPDATE users
          SET tc_no=?, kyc_status='pending', is_kyc_verified=0, kyc_submitted_at=NOW(), updated_at=NOW()
        WHERE id=?`,
      [digits, req.user.id]
    );
    res.json({ ok:true, kyc_status:'pending' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error:'server_error' });
  }
});

/* ========== ADMIN: KYC verify (test) ========== */
router.post('/admin/kyc/verify', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'] || req.body?.admin_key;
    if(adminKey !== process.env.ADMIN_KEY) return res.status(403).json({ error:'forbidden' });

    const { user_id, result } = req.body || {};
    if(!user_id || !['verified','rejected'].includes(result)){
      return res.status(400).json({ error:'bad_request' });
    }

    if(result === 'verified'){
      await pool.query(
        `UPDATE users
           SET kyc_status='verified', is_kyc_verified=1, kyc_verified_at=NOW(), updated_at=NOW()
         WHERE id=?`, [user_id]
      );
    } else {
      await pool.query(
        `UPDATE users
           SET kyc_status='rejected', is_kyc_verified=0, updated_at=NOW()
         WHERE id=?`, [user_id]
      );
    }
    res.json({ ok:true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error:'server_error' });
  }
});

export default router;
