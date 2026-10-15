const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { logAudit } = require('../audit');
const { requireLogin, requireRole } = require('../middleware/auth');
const { canViewCase } = require('./cases');

const router = express.Router();
router.use(requireLogin);

// Evidence files live on the station server's own disk (off-chain, local storage).
const STORAGE_DIR = process.env.EVIDENCE_DIR || path.join(__dirname, '..', 'evidence_store');
const TMP_DIR = path.join(STORAGE_DIR, '_tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({ dest: TMP_DIR }); // saves the upload to a temp file first

// Computes the SHA-256 of a file on disk and measures how long it took.
function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath)
      .on('data', chunk => hash.update(chunk))
      .on('end', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        resolve({ hex: hash.digest('hex'), ms });
      })
      .on('error', reject);
  });
}

// Register evidence: upload a file to a case (investigator only)
router.post('/cases/:caseId/evidence', requireRole('investigator'), upload.single('file'), async (req, res) => {
  const caseId = Number(req.params.caseId);
  if (!req.file) return res.status(400).json({ error: 'Attach a file in the "file" field' });

  const cleanup = () => fs.rm(req.file.path, { force: true }, () => {});
  const c = await pool.query('SELECT id FROM cases WHERE id = $1', [caseId]);
  if (c.rowCount === 0) { cleanup(); return res.status(404).json({ error: 'Case not found' }); }

  const { hex, ms } = await sha256File(req.file.path);
  const evidenceId = crypto.randomUUID();
  const finalPath = path.join(STORAGE_DIR, evidenceId);
  fs.renameSync(req.file.path, finalPath);
  fs.chmodSync(finalPath, 0o444); // read-only after saving

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ev = await client.query(
      `INSERT INTO evidence (id, case_id, description, file_name, mime_type, size_bytes, sha256,
                             storage_path, current_custodian_id, registered_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id, case_id, description, file_name, size_bytes, sha256, status, registered_at`,
      [evidenceId, caseId, req.body.description || null, req.file.originalname, req.file.mimetype,
       req.file.size, hex, finalPath, req.user.id]);
    await client.query(
      `INSERT INTO custody_events (evidence_id, event_type, to_user, note) VALUES ($1,'registered',$2,$3)`,
      [evidenceId, req.user.id, 'Evidence registered and hashed']);
    await client.query(`INSERT INTO metrics (kind, value, evidence_id) VALUES ('hash_ms', $1, $2)`, [ms, evidenceId]);
    await client.query('COMMIT');
    await logAudit({ userId: req.user.id, action: 'EVIDENCE_REGISTERED', targetType: 'evidence', targetId: evidenceId, ip: req.ip });
    res.status(201).json({ ...ev.rows[0], hash_time_ms: Math.round(ms * 100) / 100 });
  } catch (e) {
    await client.query('ROLLBACK');
    fs.rmSync(finalPath, { force: true });
    throw e;
  } finally {
    client.release();
  }
});

// View one evidence record
router.get('/evidence/:id', async (req, res) => {
  const r = await pool.query(
    `SELECT id, case_id, description, file_name, mime_type, size_bytes, sha256, status,
            current_custodian_id, registered_by, registered_at
     FROM evidence WHERE id = $1`, [req.params.id]).catch(() => ({ rowCount: 0 }));
  if (r.rowCount === 0 || !(await canViewCase(req.user, r.rows[0].case_id))) {
    return res.status(404).json({ error: 'Evidence not found' });
  }
  res.json(r.rows[0]);
});

// Custody timeline for one evidence item
router.get('/evidence/:id/timeline', async (req, res) => {
  const e = await pool.query('SELECT case_id FROM evidence WHERE id = $1', [req.params.id]).catch(() => ({ rowCount: 0 }));
  if (e.rowCount === 0 || !(await canViewCase(req.user, e.rows[0].case_id))) {
    return res.status(404).json({ error: 'Evidence not found' });
  }
  const t = await pool.query(
    `SELECT ce.id, ce.event_type, ce.note, ce.to_office, ce.created_at,
            fu.username AS from_user, tu.username AS to_user
     FROM custody_events ce
     LEFT JOIN users fu ON fu.id = ce.from_user
     LEFT JOIN users tu ON tu.id = ce.to_user
     WHERE ce.evidence_id = $1 ORDER BY ce.created_at, ce.id`, [req.params.id]);
  res.json(t.rows);
});

module.exports = router;