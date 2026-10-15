const pool = require('./db');

// Writes one row to the audit_log table. Never crashes the app if logging fails.
async function logAudit({ userId = null, action, targetType = null, targetId = null, ip = null, success = true, detail = null }) {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, action, target_type, target_id, ip, success, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, action, targetType, targetId, ip, success, detail]
    );
  } catch (e) {
    console.error('Audit log failed:', e.message);
  }
}

module.exports = { logAudit };