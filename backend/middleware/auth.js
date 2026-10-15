const jwt = require('jsonwebtoken');
const pool = require('../db');
const { logAudit } = require('../audit');

// 1) Checks that the user is logged in (valid token in the cookie) AND that the
//    account still exists and is active. The role is read fresh from the database
//    on every request, so deactivating a user or changing a role takes effect
//    immediately instead of waiting for the 8-hour token to expire.
async function requireLogin(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Not logged in' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }

  const r = await pool.query(
    'SELECT id, username, full_name, role, active FROM users WHERE id = $1', [payload.id]);
  const u = r.rows[0];
  if (!u || !u.active) {
    res.clearCookie('token');
    return res.status(401).json({ error: 'Account is disabled or no longer exists' });
  }
  req.user = { id: u.id, username: u.username, full_name: u.full_name, role: u.role };
  next();
}

// 2) Checks that the logged-in user has one of the allowed roles.
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      logAudit({
        userId: req.user.id,
        action: 'ACCESS_DENIED',
        detail: `${req.user.role} tried ${req.method} ${req.originalUrl}`,
        ip: req.ip,
        success: false,
      });
      return res.status(403).json({ error: 'You do not have permission to do this' });
    }
    next();
  };
}

module.exports = { requireLogin, requireRole };
