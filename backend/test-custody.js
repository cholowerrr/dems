// Checks verification, tamper detection, and the transfer / receive / release flow.
// Run while the server is running.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./db');
const ledger = require('./ledger');
const BASE = 'http://localhost:' + (process.env.PORT || 3000);
const STORE = process.env.EVIDENCE_DIR || path.join(__dirname, 'evidence_store');

async function login(username) {
  const res = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'ChangeMe123!' }),
  });
  const data = await res.json();
  return { cookie: (res.headers.get('set-cookie') || '').split(';')[0], id: data.user.id };
}

async function call(method, p, who, body) {
  const res = await fetch(BASE + p, {
    method,
    headers: { Cookie: who.cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}

async function upload(caseId, who, text) {
  const form = new FormData();
  form.append('file', new Blob([text]), 'evidence.txt');
  const res = await fetch(BASE + '/cases/' + caseId + '/evidence', { method: 'POST', headers: { Cookie: who.cookie }, body: form });
  return res.json();
}

function check(label, ok) { console.log((ok ? 'PASS' : 'FAIL') + '  ' + label); }

async function main() {
  const inv = await login('investigator1');
  const cus = await login('custodian1');
  const view = await login('viewer1');

  const c = await call('POST', '/cases', inv, { case_number: 'CUST-' + Date.now(), case_name: 'Custody Test', case_type: 'Theft' });
  const caseId = c.data.id;

  // --- Verification ---
  const ev1 = await upload(caseId, inv, 'original evidence ' + Date.now());
  check('Upload returns a ledger transaction id', typeof ev1.ledger_tx_id === 'string' && ev1.ledger_tx_id.length === 64);
  let r = await call('POST', '/evidence/' + ev1.id + '/verify', inv);
  check('Untouched file -> VERIFIED', r.status === 200 && r.data.result === 'VERIFIED');

  // --- Tamper detection: change the stored file, then verify again ---
  const stored = path.join(STORE, ev1.id);
  fs.chmodSync(stored, 0o644);
  fs.appendFileSync(stored, ' (someone edited this)');
  r = await call('POST', '/evidence/' + ev1.id + '/verify', inv);
  check('Edited file -> TAMPERED', r.status === 200 && r.data.result === 'TAMPERED');
  check('Hash no longer matches database or ledger', r.data.matches_database === false && r.data.matches_ledger === false);

  r = await call('POST', '/evidence/' + ev1.id + '/verify', view);
  check('Viewer cannot run verification', r.status === 403);

  // --- Transfer / receive / release ---
  const ev2 = await upload(caseId, inv, 'second item ' + Date.now());
  r = await call('POST', '/evidence/' + ev2.id + '/transfer', cus, { to_user_id: inv.id });
  check('Custodian cannot transfer evidence they do not hold', r.status === 403);

  r = await call('POST', '/evidence/' + ev2.id + '/transfer', inv, { to_user_id: cus.id, note: 'Handing to evidence room' });
  check('Investigator transfers evidence to the custodian', r.status === 200);

  r = await call('POST', '/evidence/' + ev2.id + '/release', inv, { to_office: 'Regional Crime Lab' });
  check('Cannot release evidence that is mid-transfer', r.status === 403);

  r = await call('POST', '/evidence/' + ev2.id + '/receive', cus, { note: 'Received, sealed bag intact' });
  check('Custodian confirms receipt', r.status === 200);

  r = await call('POST', '/evidence/' + ev2.id + '/release', cus, {});
  check('Release without a receiving office is rejected', r.status === 400);

  r = await call('POST', '/evidence/' + ev2.id + '/release', cus, { to_office: 'Regional Crime Lab', note: 'For forensic exam' });
  check('Custodian releases evidence to another office', r.status === 200);

  r = await call('POST', '/evidence/' + ev2.id + '/transfer', inv, { to_user_id: cus.id });
  check('Released evidence cannot be transferred again', r.status === 403);

  r = await call('GET', '/evidence/' + ev2.id + '/timeline', inv);
  const types = r.data.map(e => e.event_type).join(' > ');
  check('Timeline order is correct (' + types + ')', types === 'registered > transferred > received > released');

  // --- Ledger and metrics ---
  const hist = await ledger.getHistory(ev2.id);
  check('Ledger holds 4 entries for this evidence', hist.length === 4);
  check('Ledger entries are chained correctly', (await ledger.verifyChain()).ok === true);

  const m = await pool.query(`SELECT kind, round(avg(value)::numeric, 3) AS avg, count(*) FROM metrics GROUP BY kind ORDER BY kind`);
  console.log('\nLightweight metrics so far:');
  console.table(m.rows);
  await pool.end();
}
main();