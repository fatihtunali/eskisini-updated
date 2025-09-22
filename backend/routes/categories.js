// backend/routes/categories.js
import { Router } from 'express';
import { pool } from '../db.js';

const r = Router();

/**
 * Tüm kategoriler (tam liste)
 * GET /api/categories
 */
r.get('/', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT id, parent_id, name, slug, description, sort_order
       FROM categories
      ORDER BY sort_order, name`
  );
  res.json({ ok: true, categories: rows });
});

/**
 * Üst (ana) kategoriler — limit parametresi destekli
 * GET /api/categories/main?limit=20
 */
r.get('/main', async (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
  const [rows] = await pool.query(
    `SELECT id, name, slug, description, sort_order
       FROM categories
      WHERE parent_id IS NULL
      ORDER BY sort_order, name
      LIMIT ?`,
    [limit]
  );
  res.json({ ok: true, categories: rows });
});


/** ALT KATEGORİLER — /api/categories/children/:slug */
r.get('/children/:slug', async (req, res, next) => {
  try {
    const slug = req.params.slug;
    const [[parent]] = await pool.query(
      `SELECT id, name, slug FROM categories WHERE slug=? LIMIT 1`, [slug]
    );
    if (!parent) return res.status(404).json({ ok:false, error:'parent_not_found' });
    const [children] = await pool.query(
      `SELECT id, name, slug
         FROM categories
        WHERE parent_id=?
        ORDER BY sort_order, name`, [parent.id]
    );
    res.json({ ok:true, parent, children });
  } catch (e) { next(e); }
});

export default r;
