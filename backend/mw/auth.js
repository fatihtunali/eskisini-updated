import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

export function signToken(payload) {
  // Require at minimum an id on payload so downstream lookups succeed
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
    `SELECT id, email, full_name, kyc_status, is_kyc_verified, status, username
       FROM users
      WHERE id=? LIMIT 1`,
    [userId]
  );

  const user = rows[0] || null;
  if (!user) return null;

  const email = (user.email || '').toLowerCase();
  user.role = ADMIN_EMAILS.includes(email) ? 'admin' : 'user';

  return user;
}

export async function authRequired(req, res, next) {
  const token = getTokenFromReq(req);
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    const data = jwt.verify(token, JWT_SECRET);
    const user = await loadUser(data.id);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    if (user.status && user.status !== 'active') {
      return res.status(403).json({ error: 'account_inactive' });
    }
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
    if (user && (!user.status || user.status === 'active')) {
      req.user = user;
    }
  } catch {
    // ignore optional auth errors
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}
