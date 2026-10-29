// Who may view a case (viewer accounts only). Mounted at /cases.
// GET    /cases/:id/viewers
// POST   /cases/:id/viewers          { user_id }
// DELETE /cases/:id/viewers/:userId
const express = require('express');
const dbModule = require('../db');
const pool = dbModule.pool || dbModule;
const { requireLogin, requireRole } = require('../middleware/auth');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(requireLogin);

router.get('/:id/viewers', requireRole('admin', 'investigator'), async (req, res) => {
  const r = await pool.query(
    `SELECT u.id, u.username, u.full_name
       FROM case_assignments ca JOIN users u ON u.id = ca.user_id
      WHERE ca.case_id = $1 AND u.role = 'viewer'
      ORDER BY u.full_name`, [req.params.id]);
  res.json(r.rows);
});

router.post('/:id/viewers', requireRole('admin', 'investigator'), async (req, res) => {
  const caseId = Number(req.params.id);
  const userId = Number((req.body || {}).user_id);
  if (!Number.isInteger(caseId) || !Number.isInteger(userId)) return res.status(400).json({ error: 'Choose a viewer.' });

  const c = await pool.query('SELECT case_number FROM cases WHERE id = $1', [caseId]);
  if (!c.rows.length) return res.status(404).json({ error: 'Case not found.' });
  const u = await pool.query('SELECT username, role, active FROM users WHERE id = $1', [userId]);
  if (!u.rows.length || u.rows[0].role !== 'viewer' || !u.rows[0].active)
    return res.status(400).json({ error: 'Only active viewer accounts can be given access to a case.' });

  await pool.query(
    `INSERT INTO case_assignments (case_id, user_id)
     SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM case_assignments WHERE case_id = $1 AND user_id = $2)`,
    [caseId, userId]);
  logAudit({ userId: req.user.id, action: 'CASE_VIEWER_ADDED', targetType: 'case', targetId: String(caseId),
    ip: req.ip, success: true, detail: `${u.rows[0].username} can now view ${c.rows[0].case_number}` });
  res.status(201).json({ ok: true });
});

router.delete('/:id/viewers/:userId', requireRole('admin', 'investigator'), async (req, res) => {
  const caseId = Number(req.params.id);
  const userId = Number(req.params.userId);
  const u = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
  await pool.query('DELETE FROM case_assignments WHERE case_id = $1 AND user_id = $2', [caseId, userId]);
  logAudit({ userId: req.user.id, action: 'CASE_VIEWER_REMOVED', targetType: 'case', targetId: String(caseId),
    ip: req.ip, success: true, detail: `${u.rows[0]?.username || userId} removed from case ${caseId}` });
  res.json({ ok: true });
});

module.exports = router;
