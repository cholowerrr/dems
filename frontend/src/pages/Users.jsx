import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const ROLES = ['admin', 'investigator', 'custodian', 'viewer'];
const blank = { username: '', full_name: '', password: '', role: 'viewer' };

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(blank);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  function load() {
    api('/users').then(setUsers).catch((e) => setError(e.message));
  }
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
    try { await api(`/users/${id}`, { method: 'PATCH', body }); load(); }
    catch (err) { setError(err.message); }
  }

  async function resetPassword(u) {
    const pw = window.prompt(`New password for ${u.username} (min 10 characters):`);
    if (!pw) return;
    await patch(u.id, { password: pw });
    setNote(`Password changed for ${u.username}.`);
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <h2>Users</h2>
      {error && <div className="error">{error}</div>}
      {note && <div className="ok">{note}</div>}

      <form className="card stack" onSubmit={create}>
        <h3>Add user</h3>
        <div className="grid2">
          <label>Username<input value={form.username} onChange={set('username')} required /></label>
          <label>Full name<input value={form.full_name} onChange={set('full_name')} required /></label>
          <label>Password (min 10 characters)<input type="password" value={form.password} onChange={set('password')} required minLength={10} /></label>
          <label>Role
            <select value={form.role} onChange={set('role')}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
        </div>
        {formError && <div className="error">{formError}</div>}
        <div><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Create user'}</button></div>
      </form>

      {!users && !error && <p className="muted">Loading…</p>}
      {users && (
        <table className="card">
          <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.full_name}</td>
                <td>
                  <select value={u.role} disabled={u.id === me.id} onChange={(e) => patch(u.id, { role: e.target.value })}>
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </td>
                <td>{u.active ? 'Yes' : <span className="bad-text">No</span>}</td>
                <td className="actions">
                  <button className="btn ghost dark" onClick={() => resetPassword(u)}>Reset password</button>
                  {u.id !== me.id && (
                    <button className="btn ghost dark" onClick={() => patch(u.id, { active: !u.active })}>
                      {u.active ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
