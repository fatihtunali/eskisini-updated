import { Router } from 'express';
import { pool } from '../db.js';
const r = Router();

r.get('/main', async (req,res)=>{
  const [rows] = await pool.query(
    'SELECT id,name,slug,sort_order FROM categories WHERE parent_id IS NULL ORDER BY sort_order,name'
  );
  res.json({ ok:true, categories: rows });
});

r.get('/children/:slug', async (req,res)=>{
  const { slug } = req.params;
  const [[parent]] = await pool.query('SELECT id,name,slug FROM categories WHERE slug=?', [slug]);
  if(!parent) return res.status(404).json({ok:false,error:'Kategori bulunamadı'});
  const [children] = await pool.query(
    'SELECT id,name,slug,sort_order FROM categories WHERE parent_id=? ORDER BY sort_order,name',
    [parent.id]
  );
  res.json({ ok:true, parent, children });
});

export default r;
