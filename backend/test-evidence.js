// Checks cases + evidence upload + SHA-256. Run while the server is running.
const crypto = require('crypto');
const BASE = 'http://localhost:' + (process.env.PORT || 3000);

async function login(username) {
  const res = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'ChangeMe123!' }),
  });
  return (res.headers.get('set-cookie') || '').split(';')[0];
}

async function call(method, path, cookie, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}

function check(label, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (extra ? '  ' + extra : ''));
}

async function main() {
  const inv = await login('investigator1');
  const cus = await login('custodian1');
  const view = await login('viewer1');

  const caseNo = 'TEST-' + Date.now();
  let r = await call('POST', '/cases', inv, { case_number: caseNo, case_name: 'Test Theft Case', case_type: 'Theft' });
  check('Investigator creates a case', r.status === 201);
  const caseId = r.data.id;

  r = await call('POST', '/cases', view, { case_number: 'X', case_name: 'X', case_type: 'X' });
  check('Viewer cannot create a case', r.status === 403);

  r = await call('POST', '/cases', inv, { case_number: caseNo, case_name: 'Dup', case_type: 'Theft' });
  check('Duplicate case number is rejected', r.status === 409);

  // Upload a file and compare the server hash with our own hash
  const content = Buffer.from('This is fake CCTV footage for testing. ' + Date.now());
  const ourHash = crypto.createHash('sha256').update(content).digest('hex');
  const form = new FormData();
  form.append('file', new Blob([content]), 'cctv_clip.mp4');
  form.append('description', 'CCTV clip from front gate');
  let res = await fetch(BASE + '/cases/' + caseId + '/evidence', { method: 'POST', headers: { Cookie: inv }, body: form });
  const ev = await res.json();
  check('Investigator uploads evidence', res.status === 201);
  check('Server SHA-256 matches our own SHA-256', ev.sha256 === ourHash);
  console.log('      hash:', ev.sha256, '| hash time:', ev.hash_time_ms, 'ms');

  const form2 = new FormData();
  form2.append('file', new Blob([content]), 'x.mp4');
  res = await fetch(BASE + '/cases/' + caseId + '/evidence', { method: 'POST', headers: { Cookie: view }, body: form2 });
  check('Viewer cannot upload evidence', res.status === 403);

  r = await call('GET', '/evidence/' + ev.id + '/timeline', inv);
  check('Timeline shows the "registered" event', r.status === 200 && r.data[0] && r.data[0].event_type === 'registered');

  r = await call('GET', '/cases/' + caseId, view);
  check('Unassigned viewer cannot see the case', r.status === 404);

  const viewerId = (await call('GET', '/me', view)).data.user.id;
  r = await call('POST', '/cases/' + caseId + '/assign', inv, { user_id: viewerId });
  check('Investigator assigns the viewer to the case', r.status === 200);

  r = await call('GET', '/cases/' + caseId, view);
  check('Assigned viewer can now see the case and its evidence', r.status === 200 && r.data.evidence.length === 1);

  r = await call('GET', '/evidence/' + ev.id, cus);
  check('Custodian can view the evidence record', r.status === 200);
}
main();