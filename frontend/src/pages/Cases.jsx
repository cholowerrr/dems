import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Cases() {
  const { user } = useAuth();
  const [cases, setCases] = useState(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ case_number: '', case_name: '', case_type: '' });
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    api('/cases')
      .then((d) => setCases(Array.isArray(d) ? d : d.cases || []))
      .catch((e) => setError(e.message));
  }
  useEffect(load, []);

  async function create(e) {
    e.preventDefault();
    setFormError(''); setBusy(true);
    try {
      await api('/cases', { method: 'POST', body: form });
      setForm({ case_number: '', case_name: '', case_type: '' });
      setShowForm(false);
      load();
    } catch (err) { setFormError(err.message); }
    finally { setBusy(false); }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <div className="row">
        <h2>Cases</h2>
        <div className="spacer" />
        {user.role === 'investigator' && (
          <button className="btn" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ New case'}
          </button>
        )}
      </div>

      {showForm && (
        <form className="card stack" onSubmit={create}>
          <label>Case number
            <input value={form.case_number} onChange={set('case_number')} placeholder="e.g. ACPO-2026-001" required />
          </label>
          <label>Case name
            <input value={form.case_name} onChange={set('case_name')} required />
          </label>
          <label>Case type
            <input value={form.case_type} onChange={set('case_type')} placeholder="e.g. Cybercrime, Theft" required />
          </label>
          {formError && <div className="error">{formError}</div>}
          <div><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Create case'}</button></div>
        </form>
      )}

      {error && <div className="error">{error}</div>}
      {!cases && !error && <p className="muted">Loading…</p>}
      {cases && cases.length === 0 && <p className="muted">No cases yet.</p>}
      {cases && cases.length > 0 && (
        <table className="card">
          <thead><tr><th>Case no.</th><th>Name</th><th>Type</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/cases/${c.id}`}>{c.case_number}</Link></td>
                <td>{c.case_name}</td>
                <td>{c.case_type}</td>
                <td>{c.status}</td>
                <td>{c.created_at ? new Date(c.created_at).toLocaleString() : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
