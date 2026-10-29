// Clears test data so the website starts fresh. KEEPS all user accounts.
//   node cleanup.js                 shows what would be deleted (nothing is changed)
//   node cleanup.js --yes           deletes cases, evidence, custody history and the stored files
//   node cleanup.js --yes --metrics also clears the metrics table
//   node cleanup.js --yes --audit   also clears the audit log
// NOTE: the blockchain cannot be erased. Old records stay on the chain, but nothing in the app points to them any more.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const dbMod = require('./db');
const pool = dbMod.pool || dbMod;

const yes = process.argv.includes('--yes');
const withMetrics = process.argv.includes('--metrics');
const withAudit = process.argv.includes('--audit');

async function count(client, table) {
  try { return Number((await client.query(`SELECT COUNT(*) FROM ${table}`)).rows[0].count); } catch { return null; }
}

(async () => {
  const client = await pool.connect();
  try {
    const tables = ['cases', 'case_assignments', 'evidence', 'custody_events', 'metrics', 'audit_log', 'users'];
    const before = {};
    for (const t of tables) before[t] = await count(client, t);
    const files = (await client.query('SELECT storage_path FROM evidence')).rows.map((r) => r.storage_path);
    const storeDir = path.resolve(__dirname, 'evidence_store');
    const onDisk = fs.existsSync(storeDir) ? fs.readdirSync(storeDir).map((n) => path.join(storeDir, n)).filter((p) => fs.statSync(p).isFile()) : [];

    console.log(yes ? 'CLEANING UP\n' : 'DRY RUN (nothing will be changed)\n');
    console.log('  Cases:                 ' + before.cases);
    console.log('  Case assignments:      ' + before.case_assignments);
    console.log('  Evidence items:        ' + before.evidence);
    console.log('  Custody events:        ' + before.custody_events);
    console.log('  Stored evidence files: ' + onDisk.length);
    console.log('  Metrics rows:          ' + before.metrics + (withMetrics ? '   (will be cleared)' : '   (kept)'));
    console.log('  Audit log rows:        ' + before.audit_log + (withAudit ? '   (will be cleared)' : '   (kept)'));
    console.log('  User accounts:         ' + before.users + '   (always kept)\n');

    if (!yes) { console.log('To go ahead, run:  node cleanup.js --yes'); return; }

    await client.query('BEGIN');
    if (withMetrics) await client.query('DELETE FROM metrics');
    if (withAudit) await client.query('DELETE FROM audit_log');
    await client.query('DELETE FROM custody_events');
    await client.query('DELETE FROM evidence');
    await client.query('DELETE FROM case_assignments');
    await client.query('DELETE FROM cases');
    for (const [t, c] of [['cases', 'id'], ['custody_events', 'id']]) {
      const s = (await client.query('SELECT pg_get_serial_sequence($1, $2) AS s', [t, c])).rows[0].s;
      if (s) await client.query(`ALTER SEQUENCE ${s} RESTART WITH 1`);       // next case is number 1 again
    }
    await client.query('COMMIT');

    let removed = 0;
    for (const p of new Set([...files.map((f) => (path.isAbsolute(f) ? f : path.resolve(__dirname, f))), ...onDisk])) {
      try { fs.chmodSync(p, 0o666); fs.rmSync(p, { force: true }); removed++; } catch (e) { console.log('  could not remove ' + p + ': ' + e.message); }
    }
    console.log(`Done. Removed ${before.cases} cases, ${before.evidence} evidence items, ${before.custody_events} custody events and ${removed} stored files.`);
    console.log('User accounts were kept.');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('\nStopped, nothing was deleted: ' + e.message);
    if (/foreign key|violates/i.test(e.message)) console.error('Another table points at the evidence. Try again with --metrics (and --audit if needed).');
    process.exitCode = 1;
  } finally { client.release(); await pool.end().catch(() => {}); }
})();
