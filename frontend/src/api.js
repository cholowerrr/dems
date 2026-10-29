// All calls to the backend go through here. "/api" is forwarded to localhost:3000 by Vite.
// Pass `body` as a plain object (sent as JSON) or `form` as FormData (file uploads).
export async function api(path, { method = 'GET', body, form } = {}) {
  const res = await fetch('/api' + path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: form ? form : body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no JSON body */ }
  // Session ended (expired, or the account was disabled): go back to the sign-in page.
  if (res.status === 401 && path !== '/auth/login' && path !== '/me' && path !== '/auth/logout') {
    window.location.href = '/login';
  }
  if (!res.ok) {
    const err = new Error((data && (data.error || data.message)) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
