// backend/routes/listings.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

/** Arama & listeleme (fulltext + kategori) */
r.get('/search', async (req, res) => {
  const { q = '', cat = '', limit = 24, offset = 0 } = req.query;

  const where = ['l.status="active"'];
  const params = [];
  let catJoin = 'JOIN categories c ON c.id = l.category_id';

  if (cat) {
    const [[catRow]] = await pool.query(
      'SELECT id FROM categories WHERE slug=? OR name=? LIMIT 1',
      [cat, cat]
    );
    if (catRow) {
      where.push('l.category_id IN (SELECT id FROM categories WHERE id=? OR parent_id=?)');
      params.push(catRow.id, catRow.id);
    } else {
      where.push('(c.slug=? OR c.name=?)'); params.push(cat, cat);
    }
  }

  let matchSql = '';
  if (q && q.trim().length) {
    matchSql = 'AND MATCH(l.title,l.description_md) AGAINST (? IN BOOLEAN MODE)';
    params.push(`${q}*`);
  }

  const sql = `
    SELECT
      l.id, l.title, l.slug,
      l.price_minor, l.currency, l.location_city,
      (SELECT file_url FROM listing_images WHERE listing_id=l.id ORDER BY sort_order,id LIMIT 1) AS cover
    FROM listings l
    ${catJoin}
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ${matchSql}
    ORDER BY l.created_at DESC
    LIMIT ? OFFSET ?`;

  params.push(Number(limit), Number(offset));
  const [rows] = await pool.query(sql, params);
  res.json({ ok: true, listings: rows });
});

/** Detay */
r.get('/:slug', async (req, res) => {
  const { slug } = req.params;
  const [[row]] = await pool.query(
    `SELECT l.*, c.name AS category_name, c.slug AS category_slug
       FROM listings l
       JOIN categories c ON c.id = l.category_id
      WHERE l.slug=?`,
    [slug]
  );
  if (!row) return res.status(404).json({ ok: false, error: 'İlan yok' });

  const [imgs] = await pool.query(
    'SELECT id,file_url,thumb_url,sort_order FROM listing_images WHERE listing_id=? ORDER BY sort_order,id',
    [row.id]
  );
  res.json({ ok: true, listing: row, images: imgs });
});

/** Ekleme (auth’lu) – görseller URL */
r.post('/', authRequired, async (req, res) => {
  try {
    const seller_id = req.user.id; // güvenli kaynak
    const {
      category_slug, title, slug, description_md,
      price_minor, currency = 'TRY', condition_grade = 'good',
      location_city, image_urls = []
    } = req.body;

    if (!seller_id || !category_slug || !title || !slug || !price_minor) {
      return res.status(400).json({ ok: false, error: 'Eksik alan' });
    }

    const [[cat]] = await pool.query('SELECT id FROM categories WHERE slug=?', [category_slug]);
    if (!cat) return res.status(400).json({ ok: false, error: 'Kategori yok' });

    const [rs] = await pool.query(
      `INSERT INTO listings
         (seller_id,category_id,title,slug,description_md,price_minor,currency,condition_grade,location_city,allow_trade,status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?, 1, 'active', NOW(), NOW())`,
      [seller_id, cat.id, title, slug, description_md || '', price_minor, currency, condition_grade, location_city || null]
    );

    const listingId = rs.insertId;

    if (Array.isArray(image_urls) && image_urls.length) {
      const values = image_urls.map((u, i) => [listingId, u, null, i + 1]);
      await pool.query(
        'INSERT INTO listing_images (listing_id,file_url,thumb_url,sort_order) VALUES ?',
        [values]
      );
    }

    res.json({ ok: true, id: listingId });
  } catch (e) {
    console.error('POST /listings error =>', e);
    res.status(400).json({ ok: false, error: e.message });
  }
});

/** İlanlarım – profil menüsü ile uyumlu */
r.get('/my', authRequired, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const size = Math.min(50, Math.max(1, parseInt(req.query.size || '12', 10)));
  const off = (page - 1) * size;

  // Satıcı alanı şemada seller_id
  const [[{ cnt }]] = await pool.query(
    `SELECT COUNT(*) cnt FROM listings WHERE seller_id = ?`,
    [req.user.id]
  );

  const [rows] = await pool.query(
    `SELECT
        l.id,
        l.title,
        l.slug,
        l.price_minor AS price,            -- frontend (x.price/100) için alias
        l.currency,
        c.name AS category_name,
        (SELECT file_url FROM listing_images WHERE listing_id=l.id ORDER BY sort_order,id LIMIT 1) AS thumb_url,
        l.created_at
     FROM listings l
     JOIN categories c ON c.id = l.category_id
     WHERE l.seller_id = ?
     ORDER BY l.id DESC
     LIMIT ? OFFSET ?`,
    [req.user.id, size, off]
  );

  res.json({ total: cnt, page, size, items: rows });
});

export default r;
