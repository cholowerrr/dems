import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const ROLES = ['admin', 'investigator', 'custodian', 'viewer'];
const ROLE_LABEL = { admin: 'Administrator', investigator: 'Investigator', custodian: 'Evidence custodian', viewer: 'Viewer' };
const blank = { username: '', full_name: '', password: '', role: 'viewer' };

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(blank);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  function load() { api('/users').then(setUsers).catch((e) => setError(e.message)); }
  useEffect(load, []);

  async function create(e) {
    e.preventDefault();
    setFormError(''); setBusy(true);
    try { await api('/users', { method: 'POST', body: form }); setForm(blank); load(); }
    catch (err) { setFormError(err.message); }
    finally { setBusy(false); }
  }

  async function patch(id, body) {
    setError(''); setNote('');
    try { await api(`/users/${id}`, { method: 'PATCH', body }); load(); return true; }
    catch (err) { setError(err.message); return false; }
  }

  async function resetPassword(u) {
    const pw = window.prompt(`New password for ${u.username} (at least 10 characters):`);
    if (!pw) return;
    if (await patch(u.id, { password: pw })) setNote(`Password changed for ${u.username}.`);
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <div className="page__head"><h2>Users</h2></div>
      {error && <div className="notice notice--error" style={{ marginBottom: '1rem' }}>{error}</div>}
      {note && <div className="notice notice--ok" style={{ marginBottom: '1rem' }}>{note}</div>}

      <form className="panel stack" onSubmit={create} style={{ marginBottom: '1.3rem' }}>
        <h3>Add user</h3>
        <div className="grid2">
          <label>Username<input value={form.username} onChange={set('username')} required autoComplete="off" /></label>
          <label>Full name<input value={form.full_name} onChange={set('full_name')} required /></label>
          <label>Password (at least 10 characters)<input type="password" value={form.password} onChange={set('password')} required minLength={10} autoComplete="new-password" /></label>
          <label>Role
            <select value={form.role} onChange={set('role')}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </label>
        </div>
        {formError && <div className="notice notice--error">{formError}</div>}
        <div><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Create user'}</button></div>
      </form>

      {!users && !error && <p className="muted">Loading…</p>}
      {users && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.username}</b>{u.id === me.id && <span className="muted"> (you)</span>}</td>
                  <td>{u.full_name}</td>
                  <td>
                    <select value={u.role} disabled={u.id === me.id} onChange={(e) => patch(u.id, { role: e.target.value })} aria-label={`Role of ${u.username}`}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td>{u.active ? <span className="badge badge--green">Active</span> : <span className="badge badge--red">Disabled</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn--light btn--small" onClick={() => resetPassword(u)}>Reset password</button>{' '}
                    {u.id !== me.id && (
                      <button className="btn btn--light btn--small" onClick={() => patch(u.id, { active: !u.active })}>
                        {u.active ? 'Disable' : 'Enable'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
