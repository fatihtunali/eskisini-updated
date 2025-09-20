// backend/mw/auth.js
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(payload){
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function getTokenFromReq(req){
  // Önce Authorization: Bearer, sonra cookie: token
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
}

export async function authRequired(req, res, next){
  const token = getTokenFromReq(req);
  if(!token) return res.status(401).json({ error: 'unauthorized' });
  try{
    const data = jwt.verify(token, JWT_SECRET);
    const [rows] = await pool.query(
      `SELECT id, email, full_name, kyc_status, is_kyc_verified
       FROM users WHERE id=? LIMIT 1`, [data.id]
    );
    if(!rows[0]) return res.status(401).json({ error: 'unauthorized' });
    req.user = rows[0];
    next();
  }catch{
    return res.status(401).json({ error: 'unauthorized' });
  }
}
