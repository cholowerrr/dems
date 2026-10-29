import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icon } from '../components/Icons.jsx';

const PAGE = 50;

export default function AuditLog() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [action, setAction] = useState('');
  const [success, setSuccess] = useState('');
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const q = new URLSearchParams({ limit: PAGE, offset });
    if (action) q.set('action', action);
    if (success) q.set('success', success);
    api('/audit?' + q.toString()).then(setData).catch((e) => setError(e.message));
  }, [action, success, offset]);

  const total = data?.total ?? 0;

  return (
    <>
      <div className="page__head">
        <div>
          <h2>Audit log</h2>
          <p>Logins, access denials, user changes and report downloads. Each evidence item's own history is in its custody timeline.</p>
        </div>
      </div>
      <div className="row" style={{ marginBottom: '1rem', alignItems: 'flex-end' }}>
        <label>Action
          <input value={action} onChange={(e) => { setOffset(0); setAction(e.target.value.toUpperCase()); }} placeholder="e.g. LOGIN_FAILED" />
        </label>
        <label>Result
          <select value={success} onChange={(e) => { setOffset(0); setSuccess(e.target.value); }}>
            <option value="">All</option>
            <option value="true">Succeeded</option>
            <option value="false">Failed</option>
          </select>
        </label>
      </div>
      {error && <div className="notice notice--error">{error}</div>}
      {data && (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Target</th><th>IP</th><th>Result</th><th>Detail</th></tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td>{r.username || r.user_id || 'None'}</td>
                    <td className="mono">{r.action}</td>
                    <td>{r.target_type ? `${r.target_type} ${r.target_id ?? ''}` : ''}</td>
                    <td className="mono">{r.ip}</td>
                    <td>{r.success ? <span className="badge badge--green">OK</span> : <span className="badge badge--red">Failed</span>}</td>
                    <td>{r.detail}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && <tr><td colSpan="7" className="empty">No entries match.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: '1rem' }}>
            <button className="btn btn--light btn--small" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Newer</button>
            <span className="muted">{total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE, total)} of {total}</span>
            <button className="btn btn--light btn--small" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Older</button>
          </div>
        </>
      )}
    </>
  );
}
