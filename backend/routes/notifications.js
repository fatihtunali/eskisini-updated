// backend/routes/notifications.js
import { Router } from 'express';
import { pool } from '../db.js';
import { authRequired } from '../mw/auth.js';

const r = Router();

// Kullanıcının bildirimlerini getir
r.get('/', authRequired, async (req, res) => {
  try {
    const { page = '1', size = '20', unread_only = 'false' } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const sizeNum = Math.min(50, Math.max(1, parseInt(size)));
    const offset = (pageNum - 1) * sizeNum;
    
    let whereClause = 'WHERE user_id = ?';
    const params = [req.user.id];
    
    if (unread_only === 'true') {
      whereClause += ' AND read_at IS NULL';
    }
    
    const [notifications] = await pool.query(`
      SELECT id, type, title, body, data, read_at, created_at
      FROM notifications 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `, [...params, sizeNum, offset]);
    
    // Unread count
    const [[{ unread_count }]] = await pool.query(
      'SELECT COUNT(*) as unread_count FROM notifications WHERE user_id = ? AND read_at IS NULL',
      [req.user.id]
    );
    
    res.json({ 
      ok: true, 
      notifications, 
      unread_count,
      page: pageNum,
      size: sizeNum 
    });
  } catch (e) {
    console.error('Notifications error:', e);
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Bildirimi okundu olarak işaretle
r.post('/:id/read', authRequired, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ? AND read_at IS NULL',
      [req.params.id, req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// Tüm bildirimleri okundu işaretle
r.post('/read-all', authRequired, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL',
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

export default r;