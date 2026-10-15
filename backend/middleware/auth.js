const jwt = require('jsonwebtoken');
const { logAudit } = require('../audit');

// 1) Checks that the user is logged in (valid token in the cookie).
function requireLogin(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }
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