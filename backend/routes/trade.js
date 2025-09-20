import { Router } from 'express';
import { pool } from '../db.js';
const r = Router();

r.post('/offer', async (req,res)=>{
  const { listing_id, offerer_id, offered_text, cash_adjust_minor=0 } = req.body;
  if(!listing_id || !offerer_id) return res.status(400).json({ok:false,error:'Eksik'});
  try{
    const [rs] = await pool.query(
      'INSERT INTO trade_offers (listing_id,offerer_id,offered_text,cash_adjust_minor) VALUES (?,?,?,?)',
      [listing_id,offerer_id,offered_text||null,cash_adjust_minor]
    );
    res.json({ ok:true, id: rs.insertId });
  }catch(e){ res.status(400).json({ok:false,error:e.message}); }
});

r.post('/respond', async (req,res)=>{
  const { offer_id, status } = req.body; // accepted/rejected/withdrawn
  if(!offer_id || !status) return res.status(400).json({ok:false,error:'Eksik'});
  await pool.query('UPDATE trade_offers SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',[status,offer_id]);
  res.json({ ok:true });
});

export default r;
