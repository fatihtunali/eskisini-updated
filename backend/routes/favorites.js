// backend/routes/favorites.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

r.post('/', async (req,res)=>{
  const { user_id, listing_id } = req.body;
  if(!user_id || !listing_id) return res.status(400).json({ok:false,error:'Eksik'});
  try{
    await pool.query('INSERT IGNORE INTO favorites (user_id,listing_id) VALUES (?,?)',[user_id,listing_id]);
    await pool.query('UPDATE listings SET favorites_count=favorites_count+1 WHERE id=?',[listing_id]);
    res.json({ ok:true });
  }catch(e){ res.status(400).json({ok:false,error:e.message}); }
});

r.delete('/', async (req,res)=>{
  const { user_id, listing_id } = req.body;
  if(!user_id || !listing_id) return res.status(400).json({ok:false,error:'Eksik'});
  try{
    await pool.query('DELETE FROM favorites WHERE user_id=? AND listing_id=?',[user_id,listing_id]);
    res.json({ ok:true });
  }catch(e){ res.status(400).json({ok:false,error:e.message}); }
});

// ✅ DÜZELTİLEN: GET /api/favorites/my
r.get('/my', authRequired, async (req,res)=>{
  const [rows] = await pool.query(
    `SELECT
       f.listing_id,
       l.slug,
       l.title,
       l.price_minor,
       l.currency,
       (SELECT file_url FROM listing_images WHERE listing_id=l.id ORDER BY sort_order,id LIMIT 1) AS thumb_url
     FROM favorites f
     JOIN listings l ON l.id=f.listing_id
     WHERE f.user_id=?
     ORDER BY f.id DESC
     LIMIT 200`,
    [req.user.id]
  );
  res.json({ ok:true, items: rows });
});

export default r;
