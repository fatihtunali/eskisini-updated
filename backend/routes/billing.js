// backend/routes/billing.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

// perks alanını güvenle diziye çevir
function toPerksArray(perks, fallback = []) {
  if (Array.isArray(perks)) return perks;
  if (perks == null) return fallback;
  if (typeof perks === 'string') {
    // JSON gibi görünüyorsa parse etmeyi dene
    const s = perks.trim();
    if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('"') && s.endsWith('"'))) {
      try {
        const j = JSON.parse(s);
        if (Array.isArray(j)) return j;
        if (typeof j === 'string') {
          return j.split(/\r?\n|;|,/).map(x => x.trim()).filter(Boolean);
        }
      } catch { /* yut */ }
    }
    // değilse satır/virgül/; üzerinden böl
    return s.split(/\r?\n|;|,/).map(x => x.trim()).filter(Boolean);
  }
  return fallback;
}

/** Plan listesi */
r.get('/plans', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, code, name, price_minor, currency, period,
              listing_quota_month, bump_credits_month, featured_credits_month,
              support_level, perks, is_active
         FROM subscription_plans
        WHERE is_active=1
        ORDER BY price_minor ASC, id ASC`
    );
    const plans = rows.map(p => ({
      ...p,
      perks: toPerksArray(p.perks, [
        `Aylık ilan hakkı: ${p.listing_quota_month}`,
        `Yükseltme kredisi: ${p.bump_credits_month}`,
        `Öne çıkarma kredisi: ${p.featured_credits_month}`,
        `Destek: ${p.support_level}`
      ])
    }));
    res.json({ ok: true, plans });
  } catch (e) {
    console.error('GET /billing/plans error =>', e);
    res.json({ ok: true, plans: [] });
  }
});

/** Benim aboneliğim (auth) */
r.get('/me', authRequired, async (req, res) => {
  try {
    const uid = req.user.id;
    const [rows] = await pool.query(
      `SELECT us.id, us.status, us.current_period_start, us.current_period_end,
              sp.code, sp.name, sp.price_minor, sp.currency, sp.period,
              sp.listing_quota_month, sp.bump_credits_month, sp.featured_credits_month,
              sp.support_level, sp.perks
         FROM user_subscriptions us
         JOIN subscription_plans sp ON sp.id = us.plan_id
        WHERE us.user_id=? AND us.status='active'
          AND NOW() BETWEEN us.current_period_start AND us.current_period_end
        ORDER BY us.id DESC
        LIMIT 1`,
      [uid]
    );

    if (!rows.length) {
      const [[freePlan]] = await pool.query(
        `SELECT code, name, price_minor, currency, period,
                listing_quota_month, bump_credits_month, featured_credits_month,
                support_level, perks
           FROM subscription_plans
          WHERE code='free' LIMIT 1`
      );
      const effective = freePlan ? {
        ...freePlan,
        perks: toPerksArray(freePlan.perks, [
          `Aylık ilan hakkı: ${freePlan.listing_quota_month}`,
          `Yükseltme kredisi: ${freePlan.bump_credits_month}`,
          `Öne çıkarma kredisi: ${freePlan.featured_credits_month}`,
          `Destek: ${freePlan.support_level}`
        ])
      } : {
        code: 'free', name: 'Ücretsiz', price_minor: 0, currency: 'TRY', period: 'monthly',
        listing_quota_month: Number(process.env.FREE_LISTING_QUOTA || 5),
        bump_credits_month: 0, featured_credits_month: 0, support_level: 'none',
        perks: [
          `Aylık ilan hakkı: ${Number(process.env.FREE_LISTING_QUOTA || 5)}`,
          `Yükseltme kredisi: 0`,
          `Öne çıkarma kredisi: 0`,
          `Destek: none`
        ]
      };
      return res.json({ ok: true, subscription: null, effective_plan: effective });
    }

    const sub = rows[0];
    const effective_plan = {
      code: sub.code, name: sub.name,
      price_minor: sub.price_minor, currency: sub.currency, period: sub.period,
      listing_quota_month: sub.listing_quota_month,
      bump_credits_month: sub.bump_credits_month,
      featured_credits_month: sub.featured_credits_month,
      support_level: sub.support_level,
      perks: toPerksArray(sub.perks, [
        `Aylık ilan hakkı: ${sub.listing_quota_month}`,
        `Yükseltme kredisi: ${sub.bump_credits_month}`,
        `Öne çıkarma kredisi: ${sub.featured_credits_month}`,
        `Destek: ${sub.support_level}`
      ])
    };

    res.json({
      ok: true,
      subscription: {
        id: sub.id,
        status: sub.status,
        current_period_start: sub.current_period_start,
        current_period_end: sub.current_period_end,
        code: sub.code
      },
      effective_plan
    });
  } catch (e) {
    console.error('GET /billing/me error =>', e);
    res.status(200).json({
      ok: true,
      subscription: null,
      effective_plan: {
        code: 'free',
        name: 'Ücretsiz',
        price_minor: 0,
        currency: 'TRY',
        period: 'monthly',
        listing_quota_month: Number(process.env.FREE_LISTING_QUOTA || 5),
        bump_credits_month: 0,
        featured_credits_month: 0,
        support_level: 'none',
        perks: [
          `Aylık ilan hakkı: ${Number(process.env.FREE_LISTING_QUOTA || 5)}`,
          `Yükseltme kredisi: 0`,
          `Öne çıkarma kredisi: 0`,
          `Destek: none`
        ]
      }
    });
  }
});

export default r;
