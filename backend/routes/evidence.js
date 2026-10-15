const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { logAudit } = require('../audit');
const { requireLogin, requireRole } = require('../middleware/auth');
const { canViewCase } = require('./cases');
const ledger = require('../ledger');

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

    // Record the evidence on the ledger (only the hash and basic details, never the file).
    const tx = await ledger.createEvidence({
      evidenceId, caseId, sha256: hex, sizeBytes: req.file.size, registeredBy: req.user.username,
    });
    await client.query('UPDATE evidence SET ledger_tx_id = $1 WHERE id = $2', [tx.txId, evidenceId]);
    await client.query('UPDATE custody_events SET ledger_tx_id = $1 WHERE evidence_id = $2', [tx.txId, evidenceId]);
    await recordLedgerMetrics(client, tx, evidenceId);
    await client.query('COMMIT');
    await logAudit({ userId: req.user.id, action: 'EVIDENCE_REGISTERED', targetType: 'evidence', targetId: evidenceId, ip: req.ip });
    res.status(201).json({ ...ev.rows[0], hash_time_ms: Math.round(ms * 100) / 100, ledger_tx_id: tx.txId });
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

// Saves how big and how slow each ledger write was (used for the "lightweight" evaluation).
async function recordLedgerMetrics(client, tx, evidenceId) {
  await client.query(`INSERT INTO metrics (kind, value, evidence_id) VALUES ('tx_payload_bytes', $1, $2)`, [tx.payloadBytes, evidenceId]);
  await client.query(`INSERT INTO metrics (kind, value, evidence_id) VALUES ('tx_ms', $1, $2)`, [tx.ms, evidenceId]);
}

// Records one custody event in the database, the ledger, and the audit log.
async function recordCustodyEvent(client, req, evidence, { type, toUser = null, toOffice = null, note = null, result = null }) {
  const fromUser = req.user.id;
  const tx = await ledger.recordEvent({
    evidenceId: evidence.id, type, fromUser: req.user.username,
    toUser: toUser ? toUser.username : null, toOffice, result,
  });
  await client.query(
    `INSERT INTO custody_events (evidence_id, event_type, from_user, to_user, to_office, note, ledger_tx_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [evidence.id, type, fromUser, toUser ? toUser.id : null, toOffice, note, tx.txId]);
  await recordLedgerMetrics(client, tx, evidence.id);
  await logAudit({ userId: req.user.id, action: 'CUSTODY_' + type.toUpperCase(), targetType: 'evidence', targetId: evidence.id, ip: req.ip, detail: note });
  return tx;
}

// Runs a custody action safely inside a database transaction.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function loadEvidence(id) {
  const r = await pool.query('SELECT * FROM evidence WHERE id = $1', [id]).catch(() => ({ rows: [] }));
  return r.rows[0] || null;
}

// TRANSFER: current custodian (or the investigator who registered it) hands evidence to another user.
router.post('/evidence/:id/transfer', requireRole('investigator', 'custodian'), async (req, res) => {
  const ev = await loadEvidence(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Evidence not found' });
  if (ev.status !== 'in_custody' || ev.current_custodian_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the current custodian can transfer in-custody evidence' });
  }
  const { to_user_id, note } = req.body || {};
  const target = await pool.query(`SELECT id, username, role FROM users WHERE id = $1 AND active`, [to_user_id]);
  if (target.rowCount === 0 || !['investigator', 'custodian'].includes(target.rows[0].role) || target.rows[0].id === req.user.id) {
    return res.status(400).json({ error: 'to_user_id must be a different investigator or custodian' });
  }
  const toUser = target.rows[0];
  await withTransaction(async client => {
    await client.query(`UPDATE evidence SET status = 'transferred', pending_custodian_id = $1 WHERE id = $2`, [toUser.id, ev.id]);
    await recordCustodyEvent(client, req, ev, { type: 'transferred', toUser, note: note || null });
  });
  res.json({ message: 'Transferred. Waiting for ' + toUser.username + ' to confirm receipt.' });
});

// RECEIVE: the person it was transferred to confirms they now have it.
router.post('/evidence/:id/receive', requireRole('custodian'), async (req, res) => {
  const ev = await loadEvidence(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Evidence not found' });
  if (ev.status !== 'transferred' || ev.pending_custodian_id !== req.user.id) {
    return res.status(403).json({ error: 'This evidence was not transferred to you' });
  }
  const { note } = req.body || {};
  await withTransaction(async client => {
    await client.query(
      `UPDATE evidence SET status = 'in_custody', current_custodian_id = $1, pending_custodian_id = NULL WHERE id = $2`,
      [req.user.id, ev.id]);
    await recordCustodyEvent(client, req, ev, { type: 'received', toUser: req.user, note: note || 'Receipt and condition confirmed' });
  });
  res.json({ message: 'Receipt confirmed. You are now the custodian.' });
});

// RELEASE: evidence leaves the station (for example to a court or crime laboratory).
router.post('/evidence/:id/release', requireRole('investigator', 'custodian'), async (req, res) => {
  const ev = await loadEvidence(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Evidence not found' });
  if (ev.status !== 'in_custody' || ev.current_custodian_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the current custodian can release in-custody evidence' });
  }
  const { to_office, note } = req.body || {};
  if (!to_office) return res.status(400).json({ error: 'to_office is required (name of the receiving office)' });
  await withTransaction(async client => {
    await client.query(`UPDATE evidence SET status = 'released' WHERE id = $1`, [ev.id]);
    await recordCustodyEvent(client, req, ev, { type: 'released', toOffice: to_office, note: note || null });
  });
  res.json({ message: 'Released to ' + to_office });
});

// VERIFY: re-hash the stored file and compare with the database AND the ledger.
router.post('/evidence/:id/verify', requireRole('investigator', 'custodian'), async (req, res) => {
  const ev = await loadEvidence(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Evidence not found' });

  let currentHash = null;
  let hashMs = 0;
  try {
    const h = await sha256File(ev.storage_path);
    currentHash = h.hex;
    hashMs = h.ms;
  } catch (e) {
    currentHash = null; // file missing counts as a failure
  }
  const ledgerHash = await ledger.getRecordedHash(ev.id);
  const dbMatch = currentHash === ev.sha256;
  const ledgerMatch = currentHash !== null && currentHash === ledgerHash;
  const verified = dbMatch && ledgerMatch;

  await withTransaction(async client => {
    await recordCustodyEvent(client, req, ev, {
      type: verified ? 'verified' : 'verification_failed',
      note: verified ? 'File matches the recorded hash' : 'File does NOT match the recorded hash',
      result: verified ? 'VERIFIED' : 'TAMPERED',
    });
    if (currentHash) await client.query(`INSERT INTO metrics (kind, value, evidence_id) VALUES ('hash_ms', $1, $2)`, [hashMs, ev.id]);
  });

  res.json({
    result: verified ? 'VERIFIED' : 'TAMPERED',
    current_hash: currentHash,
    database_hash: ev.sha256,
    ledger_hash: ledgerHash,
    matches_database: dbMatch,
    matches_ledger: ledgerMatch,
  });
});

module.exports = router;