// backend/routes/listings.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

/** CREATE listing — POST /api/listings */
r.post('/', authRequired, async (req, res, next) => {
  try {
    const uid = req.user?.id;
    if (!uid) return res.status(401).json({ ok:false, error:'unauthorized' });

    let {
      category_slug,
      title,
      slug,
      description_md = null,
      price_minor,
      currency = 'TRY',
      condition_grade = 'good',
      location_city = null,
      allow_trade = false,
      image_urls = []
    } = req.body || {};

    if (!category_slug) return res.status(400).json({ ok:false, error:'missing_category' });
    if (!title) return res.status(400).json({ ok:false, error:'missing_title' });
    price_minor = Number(price_minor);
    if (!Number.isFinite(price_minor) || price_minor <= 0) return res.status(400).json({ ok:false, error:'invalid_price' });

    const [[cat]] = await pool.query(`SELECT id FROM categories WHERE slug=? LIMIT 1`, [category_slug]);
    if (!cat) return res.status(400).json({ ok:false, error:'invalid_category' });

    if (slug) {
      const [[dupe]] = await pool.query(`SELECT id FROM listings WHERE slug=? LIMIT 1`, [slug]);
      if (dupe) return res.status(409).json({ ok:false, error:'slug_conflict' });
    }

    const [ins] = await pool.query(`
      INSERT INTO listings
      (seller_id, category_id, title, slug, description_md, price_minor, currency,
       condition_grade, quantity, allow_trade, status, location_city, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'active', ?, NOW(), NOW())
    `, [uid, cat.id, title, slug || null, description_md, price_minor, String(currency).toUpperCase(), condition_grade, allow_trade ? 1 : 0, location_city]);

    const listingId = ins.insertId;

    if (Array.isArray(image_urls) && image_urls.length) {
      const values = image_urls.map((u, i) => [listingId, u, null, i + 1]);
      await pool.query(
        `INSERT INTO listing_images (listing_id, file_url, thumb_url, sort_order) VALUES ?`,
        [values]
      );
    }

    res.status(201).json({ ok:true, id: listingId });
  } catch (e) { next(e); }
});



/**
 * ARAMA / LİSTELEME
 * GET /api/listings/search
 * q, cat, min_price, max_price, sort, limit, offset,
 * city, district, lat, lng, radius_km, condition (csv)
 */
r.get('/search', async (req, res) => {
  const {
    q = '',
    cat = '',
    min_price,
    max_price,
    sort = 'newest',
    limit = '24',
    offset = '0',
    city = '',
    district = '',
    lat,
    lng,
    radius_km,
    condition = '' // "new,like_new,good"
  } = req.query;

  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));
  const off = Math.max(0, parseInt(offset, 10) || 0);

  const where = ['l.status="active"'];
  const params = [];
  let joinCat = 'JOIN categories c ON c.id = l.category_id';

  // Kategori (slug veya ad + çocukları)
  if (cat) {
    const [[catRow]] = await pool.query(
      'SELECT id FROM categories WHERE slug=? OR name=? LIMIT 1',
      [cat, cat]
    );
    if (catRow) {
      where.push('l.category_id IN (SELECT id FROM categories WHERE id=? OR parent_id=?)');
      params.push(catRow.id, catRow.id);
    } else {
      where.push('(c.slug=? OR c.name=?)');
      params.push(cat, cat);
    }
  }

  // Fiyat aralığı (minor = kuruş)
  if (min_price != null && String(min_price).trim() !== '') {
    where.push('l.price_minor >= ?');
    params.push(parseInt(min_price, 10) || 0);
  }
  if (max_price != null && String(max_price).trim() !== '') {
    where.push('l.price_minor <= ?');
    params.push(parseInt(max_price, 10) || 0);
  }

  // Şehir / ilçe
  if (city) {
    where.push('l.location_city LIKE ?');
    params.push(`%${city}%`);
  }
  if (district) {
    // district alanı yoksa description içinde bir fallback istemiyorsak atlayalım:
    where.push('IFNULL(l.location_city,"") LIKE ?'); // basit yaklaşım
    params.push(`%${district}%`);
  }

  // Koşul (çoklu)
  let condSql = '';
  const conds = String(condition)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (conds.length) {
    condSql = ` AND l.condition_grade IN (${conds.map(()=> '?').join(',')})`;
    params.push(...conds);
  }

  // Fulltext
  let matchSql = '';
  if (q && q.trim()) {
    matchSql = 'AND MATCH(l.title,l.description_md) AGAINST (? IN BOOLEAN MODE)';
    params.push(`${q}*`);
  }

  // Geo (yakınımda)
  const hasGeo = lat != null && lng != null && radius_km != null
    && String(lat).trim() !== '' && String(lng).trim() !== '' && String(radius_km).trim() !== '';

  // Distance hesaplayan SELECT parçası (geo varsa)
  // MySQL Haversine (km)
  const distExpr = hasGeo
    ? `(
        6371 * ACOS(
          COS(RADIANS(?)) * COS(RADIANS(l.location_lat)) *
          COS(RADIANS(l.location_lng) - RADIANS(?)) +
          SIN(RADIANS(?)) * SIN(RADIANS(l.location_lat))
        )
       )`
    : 'NULL';

  // Geo paramlarını SELECT sırasında başa ekleyeceğiz
  if (hasGeo) {
    const latN = parseFloat(lat), lngN = parseFloat(lng);
    params.unshift(latN, lngN, latN); // DİKKAT: en başa eklendi; sıraya göre bind edilecek
  }

  // Ana sorgu
  // Geo varsa distance_km alanı gelir, HAVING ile yarıçap uygulayacağız
  const baseSql = `
    SELECT
      ${distExpr} AS distance_km,
      l.id, l.title, l.slug,
      l.price_minor, l.currency,
      l.location_city,
      l.premium_level, l.premium_until, l.highlight,
      l.favorites_count,
      (SELECT file_url FROM listing_images WHERE listing_id=l.id ORDER BY sort_order,id LIMIT 1) AS cover
    FROM listings l
    ${joinCat}
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ${matchSql}
    ${condSql}
    ${hasGeo ? 'AND l.location_lat IS NOT NULL AND l.location_lng IS NOT NULL' : ''}
  `;

  // Sıralama
  let orderBy = 'ORDER BY l.created_at DESC';
  if (sort === 'price_asc') orderBy = 'ORDER BY l.price_minor ASC';
  if (sort === 'price_desc') orderBy = 'ORDER BY l.price_minor DESC';
  if (sort === 'popular') orderBy = 'ORDER BY l.views_count DESC';
  if (sort === 'nearest' && hasGeo) orderBy = 'ORDER BY distance_km ASC';

  // Geo varsa HAVING ile yarıçap uygula
  const having = hasGeo ? 'HAVING distance_km IS NOT NULL AND distance_km <= ?' : '';
  const tailParams = [];
  if (hasGeo) tailParams.push(parseFloat(radius_km));

  const sql = `
    ${baseSql}
    ${having}
    ${orderBy}
    LIMIT ? OFFSET ?
  `;

  const finalParams = [...params, ...tailParams, lim, off];

  try {
    const [rows] = await pool.query(sql, finalParams);
    res.json({ ok: true, listings: rows });
  } catch (e) {
    console.error('GET /listings/search error =>', e);
    res.status(400).json({ ok: false, error: e.message });
  }
});

/** İLANLARIM (AUTH) */
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
        l.price_minor AS price,
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

/** DETAY (slug) */
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
