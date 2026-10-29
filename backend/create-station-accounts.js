// Creates real-looking station accounts from station_roster.json, through the admin API.
// Needs the backend running and an admin login: the sample admin1 by default, or set ADMIN_USER and ADMIN_PASSWORD.
//   node create-station-accounts.js                    create the accounts
//   node create-station-accounts.js --disable-samples  also switch OFF admin1, investigator1, custodian1, viewer1
// Passwords are generated randomly and saved ONLY to station_credentials.csv (never commit that file).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = process.env.EVAL_BASE || 'http://localhost:3000';
const ADMIN_USER = process.env.ADMIN_USER || 'admin1';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
const SAMPLES = ['admin1', 'investigator1', 'custodian1', 'viewer1'];
const disableSamples = process.argv.includes('--disable-samples');

function makePassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*?'];
  const all = sets.join('');
  const pick = (s) => s[crypto.randomInt(s.length)];
  const chars = sets.map(pick);
  while (chars.length < 16) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}
async function login(username, password) {
  const r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  if (!r.ok) throw new Error(`Could not log in as ${username} (${r.status}).`);
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
async function api(cookie, method, url, body) {
  const r = await fetch(BASE + url, { method, headers: { cookie, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch { /* none */ }
  if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${data && data.error ? data.error : ''}`);
  return data;
}

(async () => {
  const roster = JSON.parse(fs.readFileSync(path.join(__dirname, 'station_roster.json'), 'utf8')).accounts;
  const adminCookie = await login(ADMIN_USER, ADMIN_PASSWORD);
  const existing = await api(adminCookie, 'GET', '/users');
  const have = new Set(existing.map((u) => u.username));

  const rows = [];
  for (const a of roster) {
    if (have.has(a.username)) { console.log(`  skipped ${a.username} (already exists)`); continue; }
    const password = makePassword();
    await api(adminCookie, 'POST', '/users', { username: a.username, full_name: a.full_name, role: a.role, password });
    rows.push({ ...a, password });
    console.log(`  created ${a.username.padEnd(12)} ${a.role.padEnd(12)} ${a.full_name}`);
  }
  if (rows.length) {
    const file = path.join(__dirname, 'station_credentials.csv');
    const header = 'username,password,role,full_name,post\n';
    const lines = rows.map((r) => [r.username, r.password, r.role, `"${r.full_name}"`, `"${r.post || ''}"`].join(',')).join('\n') + '\n';
    fs.appendFileSync(file, (fs.existsSync(file) ? '' : header) + lines);
    console.log(`\nPasswords saved to station_credentials.csv. Hand each person their own, keep the file private.\n`);
    console.log('USERNAME'.padEnd(14) + 'PASSWORD'.padEnd(20) + 'ROLE');
    rows.forEach((r) => console.log(r.username.padEnd(14) + r.password.padEnd(20) + r.role));
  }

  if (disableSamples) {
    const newAdmin = rows.find((r) => r.role === 'admin') || roster.find((a) => a.role === 'admin' && have.has(a.username));
    if (!newAdmin || !newAdmin.password) { console.log('\nNot disabling the sample accounts: a NEW admin account is needed first (and its password).'); return; }
    const cookie = await login(newAdmin.username, newAdmin.password);
    const list = await api(cookie, 'GET', '/users');
    for (const u of list.filter((x) => SAMPLES.includes(x.username) && x.active)) {
      await api(cookie, 'PATCH', `/users/${u.id}`, { active: false });
      console.log(`  disabled sample account ${u.username}`);
    }
  }
  console.log('\nDone.');
})().catch((e) => { console.error('\nStopped: ' + e.message); process.exit(1); });
