// Checks the audit log viewer and the PDF case report. Run while the server is running.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const BASE = 'http://localhost:' + (process.env.PORT || 3000);

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
    method, headers: { Cookie: who.cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}
async function upload(caseId, who, name, text) {
  const form = new FormData();
  form.append('file', new Blob([text]), name);
  const res = await fetch(BASE + '/cases/' + caseId + '/evidence', { method: 'POST', headers: { Cookie: who.cookie }, body: form });
  return res.json();
}
function check(label, ok) { console.log((ok ? 'PASS' : 'FAIL') + '  ' + label); }

async function main() {
  const inv = await login('investigator1');
  const cus = await login('custodian1');
  const adm = await login('admin1');
  const view = await login('viewer1');

  // ---- Audit log viewer ----
  let r = await call('GET', '/audit?limit=5', adm);
  check('Admin can view the audit log', r.status === 200 && r.data.rows.length > 0);
  check('Audit log newest entry comes first', r.data.rows[0].id > r.data.rows[r.data.rows.length - 1].id);
  r = await call('GET', '/audit?action=LOGIN', adm);
  check('Audit log filter by action works', r.status === 200 && r.data.rows.every(x => x.action === 'LOGIN'));
  r = await call('GET', '/audit?success=false&limit=500', adm);
  check('Audit log filter shows failed attempts', r.status === 200 && r.data.rows.every(x => x.success === false));
  r = await call('GET', '/audit', inv);
  check('Investigator cannot view the audit log', r.status === 403);
  r = await call('GET', '/audit', view);
  check('Viewer cannot view the audit log', r.status === 403);

  // ---- PDF report ----
  const caseNo = 'RPT-' + Date.now();
  const caseName = 'Warehouse Burglary Report Test';
  const c = await call('POST', '/cases', inv, { case_number: caseNo, case_name: caseName, case_type: 'Burglary' });
  const caseId = c.data.id;
  const e1 = await upload(caseId, inv, 'gate_cctv.mp4', 'video bytes ' + Date.now());
  const e2 = await upload(caseId, inv, 'photo_scene.jpg', 'photo bytes ' + Date.now());
  await call('POST', '/evidence/' + e1.id + '/verify', inv);

  let res = await fetch(BASE + '/cases/' + caseId + '/report.pdf', { headers: { Cookie: inv.cookie } });
  check('Investigator can download the report', res.status === 200 && res.headers.get('content-type') === 'application/pdf');
  const buf = Buffer.from(await res.arrayBuffer());
  check('File is a real PDF', buf.slice(0, 5).toString() === '%PDF-');
  const f = path.join(os.tmpdir(), 'dems-report.pdf');
  fs.writeFileSync(f, buf);

  let text = '';
  try { text = execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }); } catch (e) { text = null; }
  if (text === null) {
    console.log('SKIP  (pdftotext is not installed on this computer, so the PDF text was not checked. Open the PDF yourself, see the path below.)');
  } else {
    check('PDF shows the case number', text.includes(caseNo));
    check('PDF shows the case name', text.includes(caseName));
    check('PDF lists both evidence items', text.includes('gate_cctv.mp4') && text.includes('photo_scene.jpg'));
    check('PDF shows each evidence ID and SHA-256', text.includes(e1.id) && text.includes(e1.sha256) && text.includes(e2.id) && text.includes(e2.sha256));
    check('PDF shows verified and not-yet-verified status', text.includes('VERIFIED (') && text.includes('NOT YET VERIFIED'));
    check('PDF shows custody history', text.includes('REGISTERED'));
  }

  res = await fetch(BASE + '/cases/' + caseId + '/report.pdf', { headers: { Cookie: view.cookie } });
  check('Viewer cannot download the report', res.status === 403);
  res = await fetch(BASE + '/cases/' + caseId + '/report.pdf', { headers: { Cookie: adm.cookie } });
  check('Admin cannot download the report', res.status === 403);
  res = await fetch(BASE + '/cases/' + caseId + '/report.pdf', { headers: { Cookie: cus.cookie } });
  check('Custodian with no involvement cannot download it', res.status === 403);

  await call('POST', '/evidence/' + e2.id + '/transfer', inv, { to_user_id: cus.id });
  await call('POST', '/evidence/' + e2.id + '/receive', cus, {});
  res = await fetch(BASE + '/cases/' + caseId + '/report.pdf', { headers: { Cookie: cus.cookie } });
  check('Custodian can download it after handling evidence', res.status === 200);

  r = await call('GET', '/audit?action=REPORT_GENERATED', adm);
  check('Report downloads are recorded in the audit log', r.data.total >= 2);
  console.log('\nOpen this file to look at the report: ' + f);
}
main();