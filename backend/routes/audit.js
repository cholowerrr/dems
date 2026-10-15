const express = require('express');
const pool = require('../db');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin, requireRole('admin'));

// System-wide audit log (admin only). Filters: ?action=LOGIN&success=false&user=investigator1&limit=50&offset=0
router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const offset = Number(req.query.offset) || 0;
  const where = [];
  const params = [];

  if (req.query.action) { params.push(req.query.action.toUpperCase()); where.push(`a.action = $${params.length}`); }
  if (req.query.success === 'true' || req.query.success === 'false') {
    params.push(req.query.success === 'true'); where.push(`a.success = $${params.length}`);
  }
  if (req.query.user) { params.push(req.query.user); where.push(`u.username = $${params.length}`); }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = await pool.query(
    `SELECT count(*) FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ${whereSql}`, params);
  params.push(limit, offset);
  const rows = await pool.query(
    `SELECT a.id, a.created_at, u.username, a.action, a.target_type, a.target_id, a.ip, a.success, a.detail
     FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     ${whereSql} ORDER BY a.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);

  res.json({ total: Number(total.rows[0].count), limit, offset, rows: rows.rows });
});

module.exports = router;