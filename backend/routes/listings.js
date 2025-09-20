import { Router } from 'express';
import { pool } from '../db.js';
const r = Router();

/** Arama & listeleme */
r.get('/search', async (req,res)=>{
  const { q='', cat='', limit=24, offset=0 } = req.query;

  // Temel filtreler
  let where = ['l.status="active"'];
  let params = [];

  // Kategori: hem parent hem çocuklarını kapsa
  let catJoin = 'JOIN categories c ON c.id=l.category_id';
  if (cat) {
    // Seçilen slug/name'in id'sini bulup, kendisi + çocuklarına filitre
    const [[catRow]] = await pool.query(
      'SELECT id FROM categories WHERE slug=? OR name=? LIMIT 1', [cat, cat]
    );
    if (catRow) {
      where.push('l.category_id IN (SELECT id FROM categories WHERE id=? OR parent_id=?)');
      params.push(catRow.id, catRow.id);
    } else {
      // Eşleşme yoksa boş döndürmek yerine sadece name/slug eşleşmesi yap
      where.push('(c.slug=? OR c.name=?)'); params.push(cat, cat);
    }
  }

  // Arama
  let matchSql = '';
  if (q && q.trim().length) {
    matchSql = 'AND MATCH(l.title,l.description_md) AGAINST (? IN BOOLEAN MODE)';
    params.push(`${q}*`);
  }

  const sql = `
    SELECT l.id,l.title,l.slug,l.price_minor,l.currency,l.location_city,
           (SELECT file_url FROM listing_images WHERE listing_id=l.id ORDER BY sort_order,id LIMIT 1) AS cover
    FROM listings l
    ${catJoin}
    ${where.length? 'WHERE '+where.join(' AND ') : ''}
    ${matchSql}
    ORDER BY l.created_at DESC
    LIMIT ? OFFSET ?`;

  params.push(Number(limit), Number(offset));
  const [rows] = await pool.query(sql, params);
  res.json({ ok:true, listings: rows });
});


/** Detay */
r.get('/:slug', async (req,res)=>{
  const { slug } = req.params;
  const [[row]] = await pool.query(
    'SELECT l.*, c.name AS category_name, c.slug AS category_slug FROM listings l JOIN categories c ON c.id=l.category_id WHERE l.slug=?',
    [slug]
  );
  if(!row) return res.status(404).json({ok:false,error:'İlan yok'});
  const [imgs] = await pool.query('SELECT id,file_url,thumb_url,sort_order FROM listing_images WHERE listing_id=? ORDER BY sort_order,id',[row.id]);
  res.json({ ok:true, listing: row, images: imgs });
});

/** Ekleme (basit) – görseller URL olarak */
r.post('/', async (req,res)=>{
  const { seller_id, category_slug, title, slug, description_md, price_minor, currency='TRY', condition_grade='good', location_city, image_urls=[] } = req.body;
  if(!seller_id || !category_slug || !title || !slug || !price_minor) return res.status(400).json({ok:false,error:'Eksik alan'});
  try{
    const [[cat]] = await pool.query('SELECT id FROM categories WHERE slug=?',[category_slug]);
    if(!cat) return res.status(400).json({ok:false,error:'Kategori yok'});
    const [rs] = await pool.query(
      `INSERT INTO listings (seller_id,category_id,title,slug,description_md,price_minor,currency,condition_grade,location_city,allow_trade,status)
       VALUES (?,?,?,?,?,?,?,?,? ,1,'active')`,
      [seller_id,cat.id,title,slug,description_md||'',price_minor,currency,condition_grade,location_city||null]
    );
    const listingId = rs.insertId;
    if(Array.isArray(image_urls) && image_urls.length){
      const values = image_urls.map((u,i)=>[listingId, u, null, i+1]);
      await pool.query('INSERT INTO listing_images (listing_id,file_url,thumb_url,sort_order) VALUES ?',[values]);
    }
    res.json({ ok:true, id: listingId });
  }catch(e){ res.status(400).json({ok:false,error:e.message}); }
});

export default r;
