require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const { logAudit } = require('./audit');
const { requireLogin, requireRole } = require('./middleware/auth');
const casesRouter = require('./routes/cases');
const reportsRouter = require('./routes/reports');
const auditRouter = require('./routes/audit');
const evidenceRouter = require('./routes/evidence');

const app = express();
app.use(express.json());
app.use(cookieParser());

// ---- LOGIN ----
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = result.rows[0];
  const passwordOk = user && user.active && (await bcrypt.compare(password, user.password_hash));

  if (!passwordOk) {
    await logAudit({ userId: user ? user.id : null, action: 'LOGIN_FAILED', detail: `username: ${username}`, ip: req.ip, success: false });
    return res.status(401).json({ error: 'Wrong username or password' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.cookie('token', token, { httpOnly: true, sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000 });
  await logAudit({ userId: user.id, action: 'LOGIN', ip: req.ip });
  res.json({ message: 'Logged in', user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role } });
});

// ---- LOGOUT ----
app.post('/auth/logout', requireLogin, async (req, res) => {
  await logAudit({ userId: req.user.id, action: 'LOGOUT', ip: req.ip });
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

// ---- WHO AM I ----
app.get('/me', requireLogin, (req, res) => {
  res.json({ user: req.user });
});

// ---- CASES AND EVIDENCE ----
app.use('/cases', casesRouter);
app.use('/', evidenceRouter);
app.use('/cases', reportsRouter);
app.use('/audit', auditRouter);

// ---- TEST ROUTES (to prove the role checks work; we will remove these later) ----
app.get('/test/admin-only', requireLogin, requireRole('admin'), (req, res) => {
  res.json({ message: 'Welcome, admin. Only admins can see this.' });
});
app.get('/test/investigator-only', requireLogin, requireRole('investigator'), (req, res) => {
  res.json({ message: 'Welcome, investigator.' });
});

// Catch-all for unexpected errors so the server does not crash
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`DEMS backend running at http://localhost:${PORT}`));