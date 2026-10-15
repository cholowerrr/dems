// Quick check that login and role rules work. Run while the server is running.
const BASE = 'http://localhost:' + (process.env.PORT || 3000);

async function login(username, password) {
  const res = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  return { status: res.status, cookie };
}

async function get(path, cookie) {
  const res = await fetch(BASE + path, { headers: cookie ? { Cookie: cookie } : {} });
  return res.status;
}

async function main() {
  const check = (label, got, want) =>
    console.log((got === want ? 'PASS' : 'FAIL') + '  ' + label + ' (got ' + got + ', want ' + want + ')');

  check('Not logged in -> /me', await get('/me'), 401);
  check('Wrong password', (await login('admin1', 'wrong')).status, 401);

  const admin = await login('admin1', 'ChangeMe123!');
  check('Admin login', admin.status, 200);
  check('Admin -> admin-only route', await get('/test/admin-only', admin.cookie), 200);
  check('Admin -> investigator-only route', await get('/test/investigator-only', admin.cookie), 403);

  const inv = await login('investigator1', 'ChangeMe123!');
  check('Investigator login', inv.status, 200);
  check('Investigator -> investigator-only route', await get('/test/investigator-only', inv.cookie), 200);
  check('Investigator -> admin-only route', await get('/test/admin-only', inv.cookie), 403);

  const viewer = await login('viewer1', 'ChangeMe123!');
  check('Viewer -> admin-only route', await get('/test/admin-only', viewer.cookie), 403);
}
main();
