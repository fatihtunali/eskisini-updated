// backend/routes/listings.js - REVISED VERSION
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired, authOptional } from '../mw/auth.js';

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

    // Validation
    if (!category_slug) return res.status(400).json({ ok:false, error:'missing_category' });
    if (!title || title.trim().length < 3) return res.status(400).json({ ok:false, error:'invalid_title' });
    
    title = title.trim();
    price_minor = Number(price_minor);
    
    if (!Number.isFinite(price_minor) || price_minor <= 0) {
      return res.status(400).json({ ok:false, error:'invalid_price' });
    }

    // Category validation
    const [[cat]] = await pool.query(
      `SELECT id FROM categories WHERE slug=? LIMIT 1`,
      [category_slug]
    );
    if (!cat) return res.status(400).json({ ok:false, error:'invalid_category' });

    // Slug uniqueness check
    if (slug) {
      const [[dupe]] = await pool.query(
        `SELECT id FROM listings WHERE slug=? LIMIT 1`,
        [slug]
      );
      if (dupe) return res.status(409).json({ ok:false, error:'slug_conflict' });
    }

    // Create listing
    const [ins] = await pool.query(
      `INSERT INTO listings
        (seller_id, category_id, title, slug, description_md, price_minor, currency,
         condition_grade, quantity, allow_trade, status, location_city, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'active', ?, NOW(), NOW())`,
      [
        uid, cat.id, title, slug || null, description_md,
        price_minor, String(currency).toUpperCase(), condition_grade,
        allow_trade ? 1 : 0, location_city
      ]
    );

    const listingId = ins.insertId;

    // Add images if provided
    if (Array.isArray(image_urls) && image_urls.length) {
      const values = image_urls
        .filter(url => url && typeof url === 'string')
        .map((url, i) => [listingId, url.trim(), null, i + 1]);
      
      if (values.length > 0) {
        await pool.query(
          `INSERT INTO listing_images (listing_id, file_url, thumb_url, sort_order) VALUES ?`,
          [values]
        );
      }
    }

    res.status(201).json({ ok:true, id: listingId });
  } catch (e) { 
    console.error('CREATE listing error:', e);
    next(e); 
  }
});

/**
 * SEARCH LISTINGS
 * GET /api/listings/search
 */
r.get('/search', authOptional, async (req, res, next) => {
  try {
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
      condition = ''
    } = req.query;

    const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));
    const off = Math.max(0, parseInt(offset, 10) || 0);

    const where = ['l.status="active"'];
    const params = [];
    let joinCat = 'JOIN categories c ON c.id = l.category_id';

    // Category filtering
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

    // Price range filtering
    if (min_price != null && String(min_price).trim() !== '') {
      const minPrice = parseInt(min_price, 10) * 100; // Convert TL to kuruş
      if (!isNaN(minPrice)) {
        where.push('l.price_minor >= ?');
        params.push(minPrice);
      }
    }
    if (max_price != null && String(max_price).trim() !== '') {
      const maxPrice = parseInt(max_price, 10) * 100; // Convert TL to kuruş
      if (!isNaN(maxPrice)) {
        where.push('l.price_minor <= ?');
        params.push(maxPrice);
      }
    }

    // Location filtering
    if (city) {
      where.push('l.location_city LIKE ?');
      params.push(`%${city}%`);
    }
    if (district) {
      where.push('IFNULL(l.location_city,"") LIKE ?');
      params.push(`%${district}%`);
    }

    // Condition filtering
    let condSql = '';
    const conds = String(condition)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (conds.length) {
      condSql = ` AND l.condition_grade IN (${conds.map(()=> '?').join(',')})`;
      params.push(...conds);
    }

    // Full-text search
    let matchSql = '';
    if (q && q.trim()) {
      const qBool = q
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(t => `+${t}*`)
        .join(' ');
      matchSql = 'AND MATCH(l.title,l.description_md) AGAINST (? IN BOOLEAN MODE)';
      params.push(qBool);
    }

    // Geo filtering
    const hasGeo =
      lat != null && lng != null && radius_km != null &&
      String(lat).trim() !== '' && String(lng).trim() !== '' && String(radius_km).trim() !== '';

    // Distance calculation
    const distExpr = hasGeo
      ? `(
          6371 * ACOS(
            COS(RADIANS(?)) * COS(RADIANS(l.location_lat)) *
            COS(RADIANS(l.location_lng) - RADIANS(?)) +
            SIN(RADIANS(?)) * SIN(RADIANS(l.location_lat))
          )
        )`
      : 'NULL';

    // Add geo params at the beginning
    if (hasGeo) {
      const latN = parseFloat(lat), lngN = parseFloat(lng);
      params.unshift(latN, lngN, latN);
    }

    // Main query
    const baseSql = `
      SELECT
        ${distExpr} AS distance_km,
        l.id, l.title, l.slug,
        l.price_minor,
        CAST(l.price_minor AS DECIMAL(10,2))/100.0 AS price,
        l.currency,
        l.location_city,
        l.condition_grade,
        l.premium_level, l.premium_until, l.highlight,
        l.favorites_count, l.views_count,
        l.bumped_at, l.created_at,
        c.name AS category_name,
        (SELECT file_url FROM listing_images WHERE listing_id=l.id ORDER BY sort_order,id LIMIT 1) AS cover
      FROM listings l
      ${joinCat}
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ${matchSql}
      ${condSql}
      ${hasGeo ? 'AND l.location_lat IS NOT NULL AND l.location_lng IS NOT NULL' : ''}
    `;

    // Sorting
    let orderBy = 'ORDER BY l.premium_level DESC, COALESCE(l.bumped_at, l.created_at) DESC, l.created_at DESC';
    if (sort === 'price_asc') orderBy = 'ORDER BY l.price_minor ASC';
    if (sort === 'price_desc') orderBy = 'ORDER BY l.price_minor DESC';
    if (sort === 'popular') orderBy = 'ORDER BY l.views_count DESC, l.favorites_count DESC';
    if (sort === 'nearest' && hasGeo) orderBy = 'ORDER BY distance_km ASC';

    // Geo radius filtering
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

    const [rows] = await pool.query(sql, finalParams);
    
    // Get total count for pagination
    const countSql = `
      SELECT COUNT(*) as total
      FROM listings l
      ${joinCat}
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ${matchSql}
      ${condSql}
    `;
    const [[{ total }]] = await pool.query(countSql, params);

    res.json({ 
      ok: true, 
      listings: rows, 
      total,
      page: Math.floor(off / lim) + 1,
      limit: lim,
      has_more: (off + lim) < total
    });
  } catch (e) {
    console.error('GET /listings/search error =>', e);
    res.status(400).json({ ok: false, error: e.message });
  }
});

/** MY LISTINGS (AUTH) */
r.get('/my', authRequired, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const size = Math.min(50, Math.max(1, parseInt(req.query.size || '12', 10)));
    const off  = (page - 1) * size;

    // Get total count
    const [[{ cnt }]] = await pool.query(
      `SELECT COUNT(*) cnt FROM listings WHERE seller_id = ?`,
      [req.user.id]
    );

    // Get listings
    const [rows] = await pool.query(
      `SELECT
          l.id, l.title, l.slug,
          l.price_minor,
          CAST(l.price_minor AS DECIMAL(10,2))/100.0 AS price,
          l.currency,
          l.condition_grade,
          l.status,
          l.views_count,
          l.favorites_count,
          c.name AS category_name,
          c.slug AS category_slug,
          (SELECT file_url FROM listing_images WHERE listing_id=l.id ORDER BY sort_order,id LIMIT 1) AS cover,
          l.created_at, l.updated_at
       FROM listings l
       JOIN categories c ON c.id = l.category_id
       WHERE l.seller_id = ?
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, size, off]
    );

    res.json({ 
      ok: true, 
      total: cnt, 
      page, 
      size, 
      items: rows,
      has_more: (off + size) < cnt
    });
  } catch (e) { 
    console.error('GET /listings/my error:', e);
    next(e); 
  }
});

/** LISTING DETAIL (slug) — Fixed version with all required fields */
r.get('/:slug', authOptional, async (req, res, next) => {
  try {
    const { slug } = req.params;
    
    if (!slug || slug.trim().length === 0) {
      return res.status(400).json({ 
        ok: false, 
        error: 'invalid_slug' 
      });
    }

    // Get listing with all required fields
    const [[row]] = await pool.query(
      `SELECT l.*, 
              c.name AS category_name, 
              c.slug AS category_slug,
              u.full_name AS seller_name,
              u.username AS seller_username,
              (SELECT file_url FROM listing_images 
               WHERE listing_id=l.id 
               ORDER BY sort_order,id LIMIT 1) AS cover
         FROM listings l
         JOIN categories c ON c.id = l.category_id
         JOIN users u ON u.id = l.seller_id
        WHERE l.slug=? AND l.status='active'
        LIMIT 1`,
      [slug]
    );
    
    if (!row) {
      return res.status(404).json({ 
        ok: false, 
        error: 'listing_not_found' 
      });
    }

    // Get all images
    const [imgs] = await pool.query(
      `SELECT id, file_url, thumb_url, sort_order
         FROM listing_images
        WHERE listing_id=?
        ORDER BY sort_order ASC, id ASC`,
      [row.id]
    );

    // Increment view count (async, don't wait)
    pool.query(
      `UPDATE listings SET views_count = views_count + 1, updated_at = NOW() WHERE id = ?`,
      [row.id]
    ).catch(err => console.error('Failed to increment view count:', err));

    // Check if current user has favorited this listing (if authenticated)
    let is_favorited = false;
    if (req.user?.id) {
      const [[fav]] = await pool.query(
        `SELECT 1 FROM favorites WHERE user_id = ? AND listing_id = ? LIMIT 1`,
        [req.user.id, row.id]
      );
      is_favorited = !!fav;
    }

    // Prepare response
    const listing = {
      ...row,
      is_favorited,
      is_own_listing: req.user?.id === row.seller_id
    };

    res.json({ 
      ok: true, 
      listing, 
      images: imgs 
    });
    
  } catch (e) { 
    console.error('GET /listings/:slug error:', e);
    next(e); 
  }
});

/** UPDATE listing (owner only) */
r.put('/:slug', authRequired, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const userId = req.user.id;

    // Check if listing exists and user owns it
    const [[listing]] = await pool.query(
      `SELECT id, seller_id FROM listings WHERE slug = ? LIMIT 1`,
      [slug]
    );

    if (!listing) {
      return res.status(404).json({ ok: false, error: 'listing_not_found' });
    }

    if (listing.seller_id !== userId) {
      return res.status(403).json({ ok: false, error: 'not_owner' });
    }

    const {
      title,
      description_md,
      price_minor,
      currency = 'TRY',
      condition_grade,
      location_city,
      allow_trade
    } = req.body || {};

    const updates = [];
    const params = [];

    if (title !== undefined) {
      if (!title || title.trim().length < 3) {
        return res.status(400).json({ ok: false, error: 'invalid_title' });
      }
      updates.push('title = ?');
      params.push(title.trim());
    }

    if (description_md !== undefined) {
      updates.push('description_md = ?');
      params.push(description_md);
    }

    if (price_minor !== undefined) {
      const priceNum = Number(price_minor);
      if (!Number.isFinite(priceNum) || priceNum <= 0) {
        return res.status(400).json({ ok: false, error: 'invalid_price' });
      }
      updates.push('price_minor = ?');
      params.push(priceNum);
    }

    if (currency !== undefined) {
      updates.push('currency = ?');
      params.push(String(currency).toUpperCase());
    }

    if (condition_grade !== undefined) {
      updates.push('condition_grade = ?');
      params.push(condition_grade);
    }

    if (location_city !== undefined) {
      updates.push('location_city = ?');
      params.push(location_city);
    }

    if (allow_trade !== undefined) {
      updates.push('allow_trade = ?');
      params.push(allow_trade ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ ok: false, error: 'no_updates' });
    }

    updates.push('updated_at = NOW()');
    params.push(listing.id);

    await pool.query(
      `UPDATE listings SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /listings/:slug error:', e);
    next(e);
  }
});

/** DELETE listing (owner only) */
r.delete('/:slug', authRequired, async (req, res, next) => {
  try {
    const { slug } = req.params;
    const userId = req.user.id;

    // Check ownership
    const [[listing]] = await pool.query(
      `SELECT id, seller_id FROM listings WHERE slug = ? LIMIT 1`,
      [slug]
    );

    if (!listing) {
      return res.status(404).json({ ok: false, error: 'listing_not_found' });
    }

    if (listing.seller_id !== userId) {
      return res.status(403).json({ ok: false, error: 'not_owner' });
    }

    // Soft delete - change status to 'deleted'
    await pool.query(
      `UPDATE listings SET status = 'deleted', updated_at = NOW() WHERE id = ?`,
      [listing.id]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /listings/:slug error:', e);
    next(e);
  }
});

export default r;