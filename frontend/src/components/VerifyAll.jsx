import { useState } from 'react';
import { api } from '../api.js';
import { Icon } from './Icons.jsx';

// Runs the normal integrity check on every item in `loadItems()`, one after the other (each check also writes to the blockchain,
// so it takes about 2 seconds per item). Shows a live table and a one-line summary.
export default function VerifyAll({ loadItems, onDone, label = 'Verify all evidence' }) {
  const [rows, setRows] = useState(null);   // null = not started
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setError(''); setBusy(true); setRows([]);
    try {
      const items = await loadItems();
      if (!items.length) { setRows([]); setError('There is no evidence to check yet.'); return; }
      const out = items.map((i) => ({ ...i, state: 'waiting' }));
      setRows([...out]);
      for (let i = 0; i < out.length; i++) {
        out[i].state = 'checking'; setRows([...out]);
        try {
          const r = await api(`/evidence/${out[i].id}/verify`, { method: 'POST', body: {} });
          out[i].state = r.result === 'VERIFIED' ? 'verified' : 'tampered';
          out[i].note = r.result === 'VERIFIED' ? '' : (r.matches_database === false && r.matches_ledger === false ? 'File no longer matches the database or the blockchain'
            : r.matches_ledger === false ? 'File no longer matches the blockchain record' : 'File no longer matches the database');
        } catch (e) { out[i].state = 'error'; out[i].note = e.message; }
        setRows([...out]);
      }
    } catch (e) { setError(e.message); }
    finally { setBusy(false); if (onDone) onDone(); }
  }

  const done = rows ? rows.filter((r) => ['verified', 'tampered', 'error'].includes(r.state)) : [];
  const ok = rows ? rows.filter((r) => r.state === 'verified').length : 0;
  const bad = rows ? rows.filter((r) => r.state === 'tampered').length : 0;
  const err = rows ? rows.filter((r) => r.state === 'error').length : 0;

  return (
    <div className="verifyall">
      <button type="button" className="btn btn--light" onClick={run} disabled={busy}>
        <Icon name="check" size={16} />{busy ? `Checking ${Math.min(done.length + 1, rows.length)} of ${rows.length}\u2026` : label}
      </button>
      {error && <div className="notice notice--error" style={{ marginTop: '.7rem' }}>{error}</div>}
      {rows && rows.length > 0 && (
        <>
          <p className={`verifyall__sum ${bad || err ? 'bad' : done.length === rows.length ? 'good' : ''}`}>
            {done.length === rows.length || !busy
              ? `${ok} of ${rows.length} verified${bad ? `, ${bad} tampered` : ''}${err ? `, ${err} could not be checked` : ''}`
              : `${done.length} of ${rows.length} checked so far\u2026`}
          </p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Evidence</th><th>Case</th><th>Result</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.case_number}</td>
                    <td>
                      {r.state === 'verified' && <span className="badge badge--green">Verified</span>}
                      {r.state === 'tampered' && <><span className="badge badge--red">Tampered</span> <small className="muted">{r.note}</small></>}
                      {r.state === 'error' && <><span className="badge badge--amber">Could not check</span> <small className="muted">{r.note}</small></>}
                      {r.state === 'checking' && <span className="muted">Checking\u2026</span>}
                      {r.state === 'waiting' && <span className="muted">Waiting</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
