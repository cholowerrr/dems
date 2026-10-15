const express = require('express');
const pool = require('../db');
const { logAudit } = require('../audit');
const { requireLogin, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin);

// Can this user see this case? Admin/investigator/custodian see all; viewers only assigned cases.
async function canViewCase(user, caseId) {
  if (user.role !== 'viewer') return true;
  const r = await pool.query('SELECT 1 FROM case_assignments WHERE case_id = $1 AND user_id = $2', [caseId, user.id]);
  return r.rowCount > 0;
}

// Create a case (investigator only)
router.post('/', requireRole('investigator'), async (req, res) => {
  const { case_number, case_name, case_type } = req.body || {};
  if (!case_number || !case_name || !case_type) {
    return res.status(400).json({ error: 'case_number, case_name and case_type are required' });
  }
  try {
    const r = await pool.query(
      `INSERT INTO cases (case_number, case_name, case_type, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [case_number, case_name, case_type, req.user.id]
    );
    await logAudit({ userId: req.user.id, action: 'CASE_CREATED', targetType: 'case', targetId: String(r.rows[0].id), ip: req.ip });
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That case number already exists' });
    throw e;
  }
});

// List cases (viewers only see assigned ones)
router.get('/', async (req, res) => {
  const r = req.user.role === 'viewer'
    ? await pool.query(
        `SELECT c.* FROM cases c JOIN case_assignments a ON a.case_id = c.id
         WHERE a.user_id = $1 ORDER BY c.created_at DESC`, [req.user.id])
    : await pool.query('SELECT * FROM cases ORDER BY created_at DESC');
  res.json(r.rows);
});

// One case with its evidence list
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Bad case id' });
  const c = await pool.query('SELECT * FROM cases WHERE id = $1', [id]);
  if (c.rowCount === 0 || !(await canViewCase(req.user, id))) {
    return res.status(404).json({ error: 'Case not found' });
  }
  const ev = await pool.query(
    `SELECT id, description, file_name, mime_type, size_bytes, sha256, status, registered_at
     FROM evidence WHERE case_id = $1 ORDER BY registered_at`, [id]);
  res.json({ ...c.rows[0], evidence: ev.rows });
});

// Assign a viewer to a case (admin or investigator)
router.post('/:id/assign', requireRole('admin', 'investigator'), async (req, res) => {
  const caseId = Number(req.params.id);
  const { user_id } = req.body || {};
  const u = await pool.query('SELECT id, role FROM users WHERE id = $1', [user_id]);
  if (u.rowCount === 0) return res.status(404).json({ error: 'User not found' });
  await pool.query(
    'INSERT INTO case_assignments (case_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [caseId, user_id]);
  await logAudit({ userId: req.user.id, action: 'CASE_ASSIGNED', targetType: 'case', targetId: String(caseId), detail: `user ${user_id}`, ip: req.ip });
  res.json({ message: 'Assigned' });
});

module.exports = router;
module.exports.canViewCase = canViewCase;