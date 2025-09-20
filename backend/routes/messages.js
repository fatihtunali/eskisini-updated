import { Router } from 'express';
import { pool } from '../db.js';
const r = Router();

/** Sohbet başlat + ilk mesaj */
r.post('/start', async (req,res)=>{
  const { listing_id, buyer_id, seller_id, body } = req.body;
  if(!listing_id || !buyer_id || !seller_id || !body) return res.status(400).json({ok:false,error:'Eksik'});
  try{
    await pool.query(
      'INSERT INTO conversations (listing_id,buyer_id,seller_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE last_msg_at=CURRENT_TIMESTAMP',
      [listing_id,buyer_id,seller_id]
    );
    const [[conv]] = await pool.query('SELECT id FROM conversations WHERE listing_id=? AND buyer_id=? AND seller_id=?',[listing_id,buyer_id,seller_id]);
    await pool.query('INSERT INTO messages (conversation_id,sender_id,body) VALUES (?,?,?)',[conv.id,buyer_id,body]);
    res.json({ ok:true, conversation_id: conv.id });
  }catch(e){ res.status(400).json({ok:false,error:e.message}); }
});

r.get('/:conversation_id', async (req,res)=>{
  const { conversation_id } = req.params;
  const [rows] = await pool.query('SELECT id,sender_id,body,created_at FROM messages WHERE conversation_id=? ORDER BY id',[conversation_id]);
  res.json({ ok:true, messages: rows });
});

export default r;
