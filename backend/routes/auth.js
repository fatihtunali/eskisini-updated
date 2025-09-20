import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const r = Router();
const sign = (payload)=>jwt.sign(payload, process.env.JWT_SECRET, { expiresIn:'7d' });

r.post('/register', async (req,res)=>{
  const { email, password_hash, full_name, username } = req.body;
  if(!email || !password_hash || !full_name) return res.status(400).json({ok:false,error:'Eksik alan'});
  try{
    const [rs] = await pool.query(
      'INSERT INTO users (email,password_hash,full_name,username) VALUES (?,?,?,?)',
      [email, password_hash, full_name, username ?? null]
    );
    const token = sign({ uid: rs.insertId, email });
    res.json({ ok:true, token });
  }catch(e){ res.status(400).json({ok:false,error:e.message}); }
});

r.post('/login', async (req,res)=>{
  const { email, password_hash } = req.body;
  try{
    const [rows] = await pool.query('SELECT id,password_hash,is_kyc_verified FROM users WHERE email=?', [email]);
    if(rows.length===0 || rows[0].password_hash!==password_hash) return res.status(401).json({ok:false,error:'Geçersiz giriş'});
    const token = sign({ uid: rows[0].id, email });
    res.json({ ok:true, token, is_kyc_verified: !!rows[0].is_kyc_verified });
  }catch(e){ res.status(400).json({ok:false,error:e.message}); }
});

export default r;
