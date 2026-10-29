// Extra role rules from the RBAC design. Mounted BEFORE the evidence router:
//   app.use('/evidence', rulesRouter);
//  - Only an Evidence Custodian may release evidence to another office.
//  - An Investigator may only hand over evidence they are currently holding
//    (the first handover to a custodian). After that, the custodian controls custody.
const express = require('express');
const dbModule = require('../db');
const pool = dbModule.pool || dbModule;
const { requireLogin } = require('../middleware/auth');
const { logAudit } = require('../audit');

const router = express.Router();

function deny(req, res, message) {
  logAudit({ userId: req.user.id, action: 'ACCESS_DENIED',
    detail: `${req.user.role} tried ${req.method} ${req.originalUrl}`, ip: req.ip, success: false });
  return res.status(403).json({ error: message });
}

router.post('/:id/release', requireLogin, (req, res, next) => {
  if (req.user.role !== 'custodian') return deny(req, res, 'Only an evidence custodian can release evidence.');
  next();
});

router.post('/:id/transfer', requireLogin, async (req, res, next) => {
  if (req.user.role !== 'investigator') return next();
  const r = await pool.query('SELECT current_custodian_id, registered_by FROM evidence WHERE id = $1', [req.params.id]);
  if (!r.rows.length) return next();            // let the real route answer 404
  const holder = r.rows[0].current_custodian_id ?? r.rows[0].registered_by;
  if (holder !== req.user.id) return deny(req, res, 'Only the custodian holding this evidence can transfer it.');
  next();
});

module.exports = router;
