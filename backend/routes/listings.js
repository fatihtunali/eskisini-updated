// backend/routes/listings.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

/* -------- helpers -------- */
function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/ç/g,'c').replace(/ğ/g,'g').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ş/g,'s').replace(/ü/g,'u')
    .replace(/[^a-z0-9\s-]/g,'')
    .replace(/\s+/g,'-')
    .replace(/-+/g,'-')
    .slice(0, 180);
}

/** Arama & listeleme (fulltext + kategori + fiyat + sıralama) */
r.get('/search', async (req, res) => {
  const { q = '', cat = '', limit = 24, offset = 0, min_price, max_price, sort = 'newest' } = req.query;

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

  if (q && q.trim()) {
    where.push('MATCH(l.title,l.description_md) AGAINST (? IN BOOLEAN MODE)');
    params.push(`${q}*`);
  }

  // fiyat aralığı (minor = kuruş)
  const min = Number.isFinite(+min_price) ? Math.max(0, parseInt(min_price,10)) : null;
  const max = Number.isFinite(+max_price) ? Math.max(0, parseInt(max_price,10)) : null;
  if (min != null) { where.push('l.price_minor >= ?'); params.push(min); }
  if (max != null) { where.push('l.price_minor <= ?'); params.push(max); }

  // sıralama
  let orderBy = 'l.created_at DESC';
  switch (String(sort)) {
    case 'price_asc':  orderBy = 'l.price_minor ASC'; break;
    case 'price_desc': orderBy = 'l.price_minor DESC'; break;
    case 'popular':    orderBy = 'l.views_count DESC'; break;
    default:           orderBy = 'l.created_at DESC'; // newest
  }

  const sql = `
    SELECT
      l.id, l.title, l.slug,
      l.price_minor, l.currency, l.location_city,
      l.favorites_count, l.premium_level, l.premium_until, l.highlight,
      (SELECT file_url FROM listing_images WHERE listing_id=l.id ORDER BY sort_order,id LIMIT 1) AS cover
    FROM listings l
    ${catJoin}
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?`;

  params.push(Math.min(100, Number(limit)), Math.max(0, Number(offset)));
  const [rows] = await pool.query(sql, params);
  res.json({ ok: true, listings: rows });
});

/* -------- my listings (auth) -------- */
/** GET /api/listings/my?page=&size= */
r.get('/my', authRequired, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const size = Math.min(50, Math.max(1, parseInt(req.query.size || '12', 10)));
  const off  = (page - 1) * size;

  const [[{ cnt }]] = await pool.query(
    `SELECT COUNT(*) cnt FROM listings WHERE seller_id = ?`,
    [req.user.id]
  );

  const [rows] = await pool.query(
    `SELECT
        l.id, l.title, l.slug,
        l.price_minor AS price, l.currency,
        l.premium_level, l.premium_until, l.bumped_at, l.highlight,
        c.name AS category_name,
        (SELECT file_url FROM listing_images WHERE listing_id=l.id ORDER BY sort_order,id LIMIT 1) AS thumb_url,
        l.created_at
     FROM listings l
     JOIN categories c ON c.id = l.category_id
     WHERE l.seller_id = ?
     ORDER BY
      (l.premium_level='sponsor'  AND (l.premium_until IS NULL OR l.premium_until>NOW())) DESC,
      (l.premium_level='featured' AND (l.premium_until IS NULL OR l.premium_until>NOW())) DESC,
      COALESCE(l.bumped_at, l.created_at) DESC
     LIMIT ? OFFSET ?`,
    [req.user.id, size, off]
  );

  res.json({ total: cnt, page, size, items: rows });
});

/* -------- create (auth) -------- */
/** POST /api/listings  Body: { category_slug, title, slug?, description_md?, price_minor, currency?, condition_grade?, location_city?, image_urls?[] } */
r.post('/', authRequired, async (req, res) => {
  try {
    const seller_id = req.user.id;
    let {
      category_slug, title, slug,
      description_md,
      price_minor,
      currency = 'TRY',
      condition_grade = 'good',
      location_city,
      image_urls = []
    } = req.body || {};

    if (!seller_id || !category_slug || !title || price_minor == null) {
      return res.status(400).json({ ok: false, error: 'Eksik alan' });
    }

    price_minor = Number(price_minor);
    if (!Number.isFinite(price_minor) || price_minor < 0) {
      return res.status(400).json({ ok:false, error:'price_minor_invalid' });
    }

    const [[cat]] = await pool.query('SELECT id FROM categories WHERE slug=? LIMIT 1', [category_slug]);
    if (!cat) return res.status(400).json({ ok: false, error: 'Kategori yok' });

    slug = (slug && String(slug).trim()) || slugify(title);
    if (!slug) return res.status(400).json({ ok:false, error:'slug_generate_failed' });

    const [rs] = await pool.query(
      `INSERT INTO listings
         (seller_id,category_id,title,slug,description_md,price_minor,currency,condition_grade,location_city,allow_trade,status,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?, 1, 'active', NOW(), NOW())`,
      [
        seller_id,
        cat.id,
        String(title).trim(),
        slug,
        description_md || '',
        price_minor,
        String(currency || 'TRY').toUpperCase(),
        condition_grade,
        location_city || null
      ]
    );

    const listingId = rs.insertId;

    if (Array.isArray(image_urls) && image_urls.length) {
      const values = image_urls.map((u, i) => [listingId, String(u), null, i + 1]);
      await pool.query(
        'INSERT INTO listing_images (listing_id,file_url,thumb_url,sort_order) VALUES ?',
        [values]
      );
    }

    res.json({ ok: true, id: listingId, slug });
  } catch (e) {
    console.error('POST /listings error =>', e);
    res.status(400).json({ ok: false, error: e.message });
  }
});

/* -------- detail -------- */
/** GET /api/listings/:slug */
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

export default r;
