// backend/routes/auth.js
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { pool } from '../db.js';
import { signToken, authRequired } from '../mw/auth.js';

const router = Router();

/* ========== REGISTER ========== */
router.post('/register', async (req, res) => {
  try {
    let { email, password, full_name } = req.body || {};
    if(!email || !password) return res.status(400).json({ error: 'email_and_password_required' });

    email = String(email).trim().toLowerCase();
    const [exists] = await pool.query(`SELECT id FROM users WHERE email=? LIMIT 1`, [email]);
    if(exists.length) return res.status(400).json({ error: 'email_exists' });

    // full_name NOT NULL (tablon böyle): boşsa email'in local-part'ını kullan
    if(!full_name || !String(full_name).trim()){
      full_name = email.split('@')[0];
    }

    const hash = await bcrypt.hash(password, 12);
    const [r] = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, created_at, updated_at)
       VALUES (?, ?, ?, NOW(), NOW())`,
      [email, hash, full_name]
    );
    const id = r.insertId;
    const token = signToken({ id });
    res.json({ ok:true, token, user: { id, email, full_name, kyc_status:'none' } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error:'server_error' });
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
