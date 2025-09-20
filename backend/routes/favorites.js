import { Router } from 'express';
import { pool } from '../db.js';
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

export default r;
