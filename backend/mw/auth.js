// backend/mw/auth.js
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function getTokenFromReq(req) {
  const header = req.headers.authorization || req.get?.('authorization');
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies?.token) return req.cookies.token;
  if (req.cookies?.jwt) return req.cookies.jwt;
  return null;
}

async function loadUser(userId) {
  const [rows] = await pool.query(
    `SELECT id, email, full_name, kyc_status, is_kyc_verified, status
       FROM users WHERE id=? LIMIT 1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, role: 'user' };
}

export async function authRequired(req, res, next) {
  const token = getTokenFromReq(req);
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const data = jwt.verify(token, JWT_SECRET);
    const user = await loadUser(data.id);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

export async function authOptional(req, _res, next) {
  const token = getTokenFromReq(req);
  if (!token) return next();
  try {
    const data = jwt.verify(token, JWT_SECRET);
    const user = await loadUser(data.id);
    if (user) req.user = user;
  } catch {
    // ignore optional auth errors
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user?.role || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}
