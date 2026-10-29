// Numbers for the dashboard. Viewers only see cases assigned to them (same rule as /cases).
const express = require('express');
const dbModule = require('../db');
const pool = dbModule.pool || dbModule;
const { requireLogin } = require('../middleware/auth');

const router = express.Router();
router.use(requireLogin);

router.get('/', async (req, res) => {
  const viewerOnly = req.user.role === 'viewer';
  const params = viewerOnly ? [req.user.id] : [];
  const scope = viewerOnly
    ? 'AND c.id IN (SELECT case_id FROM case_assignments WHERE user_id = $1)'
    : '';

  const [cases, byStatus, checks, latestChecks, recent] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS n FROM cases c WHERE TRUE ${scope}`, params),
    pool.query(
      `SELECT e.status, COUNT(*)::int AS n
         FROM evidence e JOIN cases c ON c.id = e.case_id
        WHERE TRUE ${scope} GROUP BY e.status`, params),
    pool.query(
      `SELECT ce.event_type, COUNT(*)::int AS n
         FROM custody_events ce
         JOIN evidence e ON e.id = ce.evidence_id
         JOIN cases c ON c.id = e.case_id
        WHERE ce.event_type IN ('verified','verification_failed')
          AND ce.created_at > now() - interval '30 days' ${scope}
        GROUP BY ce.event_type`, params),
    // newest verification result for each evidence item
    pool.query(
      `SELECT DISTINCT ON (ce.evidence_id)
              ce.evidence_id, ce.event_type, ce.created_at,
              e.description, e.file_name, e.case_id, c.case_number
         FROM custody_events ce
         JOIN evidence e ON e.id = ce.evidence_id
         JOIN cases c ON c.id = e.case_id
        WHERE ce.event_type IN ('verified','verification_failed') ${scope}
        ORDER BY ce.evidence_id, ce.created_at DESC, ce.id DESC`, params),
    pool.query(
      `SELECT ce.id, ce.event_type, ce.created_at, ce.evidence_id, ce.to_office,
              e.description, e.file_name, e.case_id, c.case_number,
              fu.username AS from_user, tu.username AS to_user
         FROM custody_events ce
         JOIN evidence e ON e.id = ce.evidence_id
         JOIN cases c ON c.id = e.case_id
         LEFT JOIN users fu ON fu.id = ce.from_user
         LEFT JOIN users tu ON tu.id = ce.to_user
        WHERE TRUE ${scope}
        ORDER BY ce.created_at DESC, ce.id DESC LIMIT 8`, params),
  ]);

  const status = { in_custody: 0, transferred: 0, released: 0 };
  for (const r of byStatus.rows) status[r.status] = r.n;
  const check = { verified: 0, verification_failed: 0 };
  for (const r of checks.rows) check[r.event_type] = r.n;

  const extra = {};
  if (req.user.role === 'admin') {
    const [u, a, r] = await Promise.all([
      pool.query(`SELECT role, active, COUNT(*)::int AS n FROM users GROUP BY role, active`),
      pool.query(`SELECT action, COUNT(*)::int AS n FROM audit_log
                   WHERE success = false AND created_at > now() - interval '7 days' GROUP BY action`),
      pool.query(`SELECT a.id, a.created_at, u.username, a.action, a.success, a.detail
                    FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
                   ORDER BY a.created_at DESC, a.id DESC LIMIT 6`),
    ]);
    const byRole = { admin: 0, investigator: 0, custodian: 0, viewer: 0 };
    let disabled = 0;
    for (const x of u.rows) { if (x.active) byRole[x.role] = (byRole[x.role] || 0) + x.n; else disabled += x.n; }
    extra.users = { by_role: byRole, active: Object.values(byRole).reduce((a, b) => a + b, 0), disabled };
    extra.failures_7d = a.rows;
    extra.audit_recent = r.rows;
  }
  if (req.user.role === 'custodian') {
    // transferred items whose most recent 'transferred' event was addressed to me
    const w = await pool.query(
      `SELECT e.id, e.description, e.file_name, c.case_number, t.created_at, fu.username AS from_user
         FROM evidence e
         JOIN cases c ON c.id = e.case_id
         JOIN LATERAL (SELECT * FROM custody_events ce
                        WHERE ce.evidence_id = e.id AND ce.event_type = 'transferred'
                        ORDER BY ce.created_at DESC, ce.id DESC LIMIT 1) t ON TRUE
         LEFT JOIN users fu ON fu.id = t.from_user
        WHERE e.status = 'transferred' AND t.to_user = $1
        ORDER BY t.created_at DESC`, [req.user.id]);
    const m = await pool.query(
      `SELECT e.id, e.description, e.file_name, c.case_number
         FROM evidence e JOIN cases c ON c.id = e.case_id
        WHERE e.status = 'in_custody' AND e.current_custodian_id = $1
        ORDER BY e.registered_at DESC LIMIT 8`, [req.user.id]);
    extra.awaiting_me = w.rows;
    extra.mine = m.rows;
  }

  res.json({
    ...extra,
    cases: cases.rows[0].n,
    evidence_total: status.in_custody + status.transferred + status.released,
    evidence_by_status: status,
    checks_30d: { passed: check.verified, failed: check.verification_failed },
    flagged: latestChecks.rows.filter((r) => r.event_type === 'verification_failed'),
    recent: recent.rows,
  });
});

module.exports = router;
