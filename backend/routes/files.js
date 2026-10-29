// View or download the stored evidence file.   GET /evidence/:id/file[?download=1]
// Mounted BEFORE the evidence router:  app.use('/evidence', filesRouter);
// Every view or download is written to the custody history (and the blockchain) as an "accessed" event.
const express = require('express');
const fs = require('fs');
const path = require('path');
const dbModule = require('../db');
const pool = dbModule.pool || dbModule;
const { requireLogin } = require('../middleware/auth');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(requireLogin);

// Only these types are shown inside the browser. Everything else (html, svg, scripts...) is download-only.
const INLINE = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp',
  mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', mov: 'video/mp4',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4',
  pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', log: 'text/plain; charset=utf-8', csv: 'text/plain; charset=utf-8',
};
const INLINE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'video/mp4', 'video/webm',
  'video/ogg', 'audio/mpeg', 'audio/wav', 'audio/mp4', 'application/pdf', 'text/plain']);

function pickType(fileName, mime) {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (INLINE[ext]) return INLINE[ext];                                   // trust the extension first
  const m = (mime || '').split(';')[0].trim().toLowerCase();
  if (INLINE_MIME.has(m)) return m === 'text/plain' ? 'text/plain; charset=utf-8' : m;
  return null;
}

router.get('/:id/file', async (req, res) => {
  const id = req.params.id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).json({ error: 'Evidence not found.' });
  const r = await pool.query('SELECT * FROM evidence WHERE id = $1', [id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Evidence not found.' });
  const e = r.rows[0];

  // Who may open evidence files (RBAC):
  //   administrator: never      investigator, custodian: view + download      viewer: view only, assigned cases only
  const wantsDownload = req.query.download === '1';
  if (req.user.role === 'admin' || (req.user.role === 'viewer' && wantsDownload)) {
    logAudit({ userId: req.user.id, action: 'ACCESS_DENIED', ip: req.ip, success: false,
      detail: `${req.user.role} tried ${wantsDownload ? 'to download' : 'to view'} an evidence file` });
    return res.status(403).json({ error: req.user.role === 'admin'
      ? 'Administrators cannot open evidence files.' : 'Viewers can view evidence files but cannot download them.' });
  }
  if (req.user.role === 'viewer') {
    const a = await pool.query('SELECT 1 FROM case_assignments WHERE case_id = $1 AND user_id = $2', [e.case_id, req.user.id]);
    if (!a.rows.length) return res.status(403).json({ error: 'You do not have access to this evidence.' });
  }
  const abs = path.isAbsolute(e.storage_path) ? e.storage_path : path.resolve(__dirname, '..', e.storage_path);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'The stored file is missing on the server.' });

  const download = req.query.download === '1';
  const type = pickType(e.file_name, e.mime_type);
  const inline = !download && !!type;
  const safeName = e.file_name.replace(/[^\w.\- ]+/g, '_');

  // custody history entry (database now, blockchain in the background so the file opens immediately)
  try {
    await pool.query(
      `INSERT INTO custody_events (evidence_id, event_type, from_user, note) VALUES ($1, 'accessed', $2, $3)`,
      [id, req.user.id, download ? 'Downloaded the file' : 'Viewed the file']);
  } catch (err) { console.error('accessed event not saved:', err.message); }
  logAudit({ userId: req.user.id, action: download ? 'EVIDENCE_DOWNLOADED' : 'EVIDENCE_VIEWED', targetType: 'evidence',
    targetId: id, ip: req.ip, success: true, detail: e.file_name });
  try {
    const ledger = require('../ledger');
    Promise.resolve(ledger.recordEvent({ evidenceId: id, type: 'accessed', fromUser: req.user.username }))
      .catch((err) => console.error('ledger accessed event failed:', err.message));
  } catch (err) { console.error('ledger not available:', err.message); }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', inline ? type : 'application/octet-stream');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`);
  res.sendFile(abs, { dotfiles: 'allow', cacheControl: false });        // also supports video seeking (Range requests)
});

module.exports = router;
