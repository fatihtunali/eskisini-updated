// backend/routes/billing.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

const addDays = (n)=> new Date(Date.now() + n*24*60*60*1000);
const fmt = (dt)=> dt.toISOString().slice(0,19).replace('T',' ');

// Planları listele
r.get('/plans', async (req,res)=>{
  const [rows] = await pool.query(
    `SELECT code,name,price_minor,currency,period,
            listing_quota_month,bump_credits_month,featured_credits_month,
            support_level,perks,is_active
       FROM subscription_plans
      WHERE is_active=1
      ORDER BY price_minor ASC`
  );
  res.json({ ok:true, plans: rows });
});

// Abone ol (mock ödeme)
r.post('/subscribe', authRequired, async (req,res)=>{
  const { plan_code } = req.body || {};
  if (!plan_code) return res.status(400).json({ ok:false, error:'plan_code_required' });

  const [[plan]] = await pool.query(
    `SELECT * FROM subscription_plans WHERE code=? AND is_active=1`,
    [plan_code]
  );
  if (!plan) return res.status(404).json({ ok:false, error:'plan_not_found' });

  const start = new Date();
  const end   = addDays(plan.period === 'yearly' ? 365 : 30);

  await pool.query(`
    INSERT INTO user_subscriptions
      (user_id, plan_id, status, current_period_start, current_period_end, auto_renew, cancel_at_period_end)
    VALUES (?,?,?,?,?,1,0)
  `, [req.user.id, plan.id, 'active', fmt(start), fmt(end)]);

  await pool.query(`
    INSERT INTO payments (user_id, amount_minor, currency, provider, purpose, status, meta)
    VALUES (?,?,?,?, 'subscription', 'succeeded', JSON_OBJECT('plan_code', ?))
  `, [req.user.id, plan.price_minor, plan.currency, process.env.PAY_PROVIDER || 'mock', plan.code]);

  res.json({ ok:true, message:'subscription_activated', current_period_end: fmt(end) });
});

// İlanı öne çıkar / bump / highlight
r.post('/promote', authRequired, async (req,res)=>{
  const { listing_id, type='bump' } = req.body || {};
  if(!listing_id) return res.status(400).json({ ok:false, error:'listing_id_required' });
  if(!['bump','featured','highlight','sponsor'].includes(type))
    return res.status(400).json({ ok:false, error:'invalid_type' });

  // sahiplik kontrolü
  const [[own]] = await pool.query(`SELECT id,seller_id FROM listings WHERE id=?`, [listing_id]);
  if(!own || own.seller_id !== req.user.id) return res.status(403).json({ ok:false, error:'forbidden' });

  const days = {
    bump: Number(process.env.BUMP_DAYS || 0),
    featured: Number(process.env.FEATURED_DAYS || 7),
    highlight: Number(process.env.HIGHLIGHT_DAYS || 30),
    sponsor: Number(process.env.FEATURED_DAYS || 7)
  }[type];

  const start = new Date();
  const end   = addDays(days);

  await pool.query(`
    INSERT INTO listing_promotions (listing_id,user_id,type,start_at,end_at,meta)
    VALUES (?,?,?,?,?, NULL)
  `, [listing_id, req.user.id, type, fmt(start), fmt(end)]);

  if (type === 'bump') {
    await pool.query(`UPDATE listings SET bumped_at=NOW() WHERE id=?`, [listing_id]);
  } else if (type === 'featured') {
    await pool.query(`UPDATE listings SET premium_level='featured', premium_until=?, highlight=1 WHERE id=?`,
      [fmt(end), listing_id]);
  } else if (type === 'highlight') {
    await pool.query(`UPDATE listings SET highlight=1 WHERE id=?`, [listing_id]);
  } else if (type === 'sponsor') {
    await pool.query(`UPDATE listings SET premium_level='sponsor', premium_until=? WHERE id=?`,
      [fmt(end), listing_id]);
  }

  res.json({ ok:true, listing_id, type, until: fmt(end) });
});

export default r;
