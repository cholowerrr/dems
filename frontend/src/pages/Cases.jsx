import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Badge from '../components/Badge.jsx';
import { Icon } from '../components/Icons.jsx';

const blank = { case_number: '', case_name: '', case_type: '' };

export default function Cases() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [cases, setCases] = useState(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(params.get('new') === '1' && user.role === 'investigator');
  const [form, setForm] = useState(blank);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');

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
      setForm(blank); setShowForm(false); load();
    } catch (err) { setFormError(err.message); }
    finally { setBusy(false); }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const shown = (cases || []).filter((c) =>
    `${c.case_number} ${c.case_name} ${c.case_type}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <div className="page__head">
        <h2>Cases</h2>
        <div className="spacer" />
        {cases && cases.length > 0 && (
          <input className="search" type="search" placeholder="Search by number, name or type" value={q}
            onChange={(e) => setQ(e.target.value)} aria-label="Search cases" />
        )}
        {user.role === 'investigator' && (
          <button className="btn" onClick={() => setShowForm(!showForm)}>
            <Icon name={showForm ? 'close' : 'plus'} size={16} />{showForm ? 'Cancel' : 'New case'}
          </button>
        )}
      </div>

      {showForm && (
        <form className="panel stack" onSubmit={create} style={{ marginBottom: '1.1rem' }}>
          <h3>New case</h3>
          <div className="grid2">
            <label>Case number
              <input value={form.case_number} onChange={set('case_number')} placeholder="e.g. ACPO-2026-001" required />
            </label>
            <label>Case type
              <input value={form.case_type} onChange={set('case_type')} placeholder="e.g. Theft, Cybercrime" required />
            </label>
          </div>
          <label>Case name
            <input value={form.case_name} onChange={set('case_name')} placeholder="Short description of the case" required />
          </label>
          {formError && <div className="notice notice--error">{formError}</div>}
          <div><button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Create case'}</button></div>
        </form>
      )}

      {error && <div className="notice notice--error">{error}</div>}
      {!cases && !error && <p className="muted">Loading…</p>}

      {cases && cases.length === 0 && (
        <div className="panel empty">
          <strong>No cases yet</strong>
          {user.role === 'investigator' ? 'Create the first case to start registering evidence.' : 'Cases assigned to you will appear here.'}
        </div>
      )}
      {cases && cases.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Case no.</th><th>Name</th><th>Type</th><th>Status</th><th>Opened</th></tr></thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/cases/${c.id}`}><b>{c.case_number}</b></Link></td>
                  <td>{c.case_name}</td>
                  <td>{c.case_type}</td>
                  <td><Badge kind="case" value={c.status} /></td>
                  <td>{c.created_at ? new Date(c.created_at).toLocaleDateString([], { dateStyle: 'medium' }) : ''}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan="5" className="empty">No case matches “{q}”.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
