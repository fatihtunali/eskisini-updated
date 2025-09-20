import { Router } from 'express';
import { pool } from '../db.js';
const r = Router();

/** Satın al – basit sipariş oluşturur (ödeme entegrasyonu sonra) */
r.post('/', async (req,res)=>{
  const { buyer_id, listing_id, qty=1, shipping_minor=0 } = req.body;
  if(!buyer_id || !listing_id) return res.status(400).json({ok:false,error:'Eksik'});
  const [[l]] = await pool.query('SELECT seller_id,price_minor,currency FROM listings WHERE id=?',[listing_id]);
  if(!l) return res.status(404).json({ok:false,error:'İlan yok'});
  const subtotal = l.price_minor * Number(qty);
  const total = subtotal + Number(shipping_minor);
  const [rs] = await pool.query(
    `INSERT INTO orders (buyer_id,seller_id,listing_id,qty,unit_price_minor,currency,subtotal_minor,shipping_minor,total_minor,status)
     VALUES (?,?,?,?,?,?,?,?,?,'pending')`,
    [buyer_id, l.seller_id, listing_id, qty, l.price_minor, l.currency, subtotal, shipping_minor, total]
  );
  res.json({ ok:true, order_id: rs.insertId });
});

export default r;
