// User management + a small "who can I hand evidence to?" lookup.
const express = require('express');
const bcrypt = require('bcrypt');
const dbModule = require('../db');
const pool = dbModule.pool || dbModule;
const auditModule = require('../audit');
const logAudit = auditModule.logAudit || auditModule;
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin);

const ROLES = ['admin', 'investigator', 'custodian', 'viewer'];

// Lookup list for dropdowns (transfer). Only active users, no sensitive fields.
router.get('/lookup', requireRole('admin', 'investigator', 'custodian'), async (req, res) => {
  const { role } = req.query;
  const params = [];
  let where = 'active = TRUE';
  if (role) { params.push(role); where += ` AND role = $${params.length}`; }
  const r = await pool.query(
    `SELECT id, username, full_name, role FROM users WHERE ${where} ORDER BY full_name`, params);
  res.json(r.rows);
});

// Admin: list all users
router.get('/', requireRole('admin'), async (req, res) => {
  const r = await pool.query(
    'SELECT id, username, full_name, role, active FROM users ORDER BY id');
  res.json(r.rows);
});

// Admin: create user
router.post('/', requireRole('admin'), async (req, res) => {
  const { username, full_name, password, role } = req.body || {};
  if (!username || !full_name || !password || !role) {
    return res.status(400).json({ error: 'username, full_name, password and role are required' });
  }
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (password.length < 10) return res.status(400).json({ error: 'Password must be at least 10 characters' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const r = await pool.query(
      `INSERT INTO users (username, full_name, password_hash, role)
       VALUES ($1, $2, $3, $4) RETURNING id, username, full_name, role, active`,
      [username.trim(), full_name.trim(), hash, role]);
    await logAudit({ userId: req.user.id, action: 'USER_CREATED', targetType: 'user',
      targetId: String(r.rows[0].id), ip: req.ip, success: true, detail: `${username} as ${role}` });
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That username already exists' });
    throw e;
  }
});

// Admin: change role / active / name, or reset password
router.patch('/:id', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  const { role, active, full_name, password } = req.body || {};
  if (id === req.user.id && (active === false || (role && role !== 'admin'))) {
    return res.status(400).json({ error: 'You cannot deactivate or demote your own account' });
  }
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (password && password.length < 10) return res.status(400).json({ error: 'Password must be at least 10 characters' });

  const sets = []; const vals = [];
  const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (role) add('role', role);
  if (typeof active === 'boolean') add('active', active);
  if (full_name) add('full_name', full_name.trim());
  if (password) add('password_hash', await bcrypt.hash(password, 12));
  if (sets.length === 0) return res.status(400).json({ error: 'Nothing to change' });

  vals.push(id);
  const r = await pool.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length}
     RETURNING id, username, full_name, role, active`, vals);
  if (r.rowCount === 0) return res.status(404).json({ error: 'User not found' });

  const changed = [role && 'role', typeof active === 'boolean' && 'active', full_name && 'name', password && 'password']
    .filter(Boolean).join(', ');
  await logAudit({ userId: req.user.id, action: 'USER_UPDATED', targetType: 'user',
    targetId: String(id), ip: req.ip, success: true, detail: `changed: ${changed}` });
  res.json(r.rows[0]);
});

module.exports = router;
