// backend/routes/categories.js
import { Router } from 'express';
import { pool } from '../db.js';

const r = Router();

/**
 * Tüm kategoriler (düz liste)
 * GET /api/categories
 */
r.get('/', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT id, parent_id, name, slug, description, sort_order
       FROM categories
     ORDER BY sort_order ASC, name ASC`
  );
  res.json({ ok: true, categories: rows });
});

/**
 * Ana (üst seviye) kategoriler + aktif ilan sayısı
 * GET /api/categories/main?limit=12
 * Alias: /api/categories/top
 */
async function mainCategories(req, res) {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '12', 10)));

  const [rows] = await pool.query(
    `SELECT
        c.id,
        c.name,
        c.slug,
        c.sort_order,
        COALESCE(x.cnt, 0) AS active_count,
        NULL AS sample_image
     FROM categories c
     LEFT JOIN (
       SELECT category_id, COUNT(*) AS cnt
         FROM listings
        WHERE status='active'
        GROUP BY category_id
     ) x ON x.category_id = c.id
     WHERE c.parent_id IS NULL
     ORDER BY c.sort_order ASC, c.name ASC
     LIMIT ?`,
    [limit]
  );

  res.json({ ok: true, categories: rows });
}

r.get('/main', mainCategories);
r.get('/top',  mainCategories);

/**
 * (İsteğe bağlı) Ağaç görünüm
 * GET /api/categories/tree
 */
r.get('/tree', async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT id, parent_id, name, slug, description, sort_order
       FROM categories
     ORDER BY parent_id IS NULL DESC, sort_order ASC, name ASC`
  );
  const map = new Map(rows.map(x => [x.id, { ...x, children: [] }]));
  const roots = [];
  for (const cat of map.values()) {
    if (cat.parent_id && map.has(cat.parent_id)) {
      map.get(cat.parent_id).children.push(cat);
    } else {
      roots.push(cat);
    }
  }
  res.json({ ok: true, tree: roots });
});

export default r;
