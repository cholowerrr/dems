import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const fmtSize = (n) => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export default function CaseDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [desc, setDesc] = useState('');
  const [file, setFile] = useState(null);
  const [upError, setUpError] = useState('');
  const [upOk, setUpOk] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  function load() {
    api(`/cases/${id}`).then(setData).catch((e) => setError(e.message));
  }
  useEffect(load, [id]);

  async function upload(e) {
    e.preventDefault();
    setUpError(''); setUpOk(''); setBusy(true);
    try {
      const fd = new FormData();
      fd.append('description', desc);
      fd.append('file', file); // "file" must come last / be named "file"
      const r = await api(`/cases/${id}/evidence`, { method: 'POST', form: fd });
      setUpOk(`Registered. SHA-256: ${r.sha256 || r.evidence?.sha256 || '(see list below)'}`);
      setDesc(''); setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      load();
    } catch (err) { setUpError(err.message); }
    finally { setBusy(false); }
  }

  if (error) return <div className="error">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  const c = data.case || data;
  const evidence = data.evidence || c.evidence || [];
  const canReport = user.role === 'investigator' || user.role === 'custodian';

  return (
    <>
      <p><Link to="/">← All cases</Link></p>
      <div className="row">
        <h2>{c.case_number} — {c.case_name}</h2>
        <div className="spacer" />
        {canReport && <a className="btn" href={`/api/cases/${id}/report.pdf`} target="_blank" rel="noreferrer">Download report (PDF)</a>}
      </div>
      <p className="muted">Type: {c.case_type} · Status: {c.status}</p>

      {user.role === 'investigator' && (
        <form className="card stack" onSubmit={upload}>
          <h3>Register evidence</h3>
          <label>Description
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Seized laptop disk image" />
          </label>
          <label>File
            <input ref={fileInput} type="file" onChange={(e) => setFile(e.target.files[0] || null)} required />
          </label>
          {upError && <div className="error">{upError}</div>}
          {upOk && <div className="ok">{upOk}</div>}
          <div><button className="btn" disabled={busy || !file}>{busy ? 'Hashing and recording…' : 'Register evidence'}</button></div>
        </form>
      )}

      <h3>Evidence ({evidence.length})</h3>
      {evidence.length === 0 && <p className="muted">No evidence registered yet.</p>}
      {evidence.length > 0 && (
        <table className="card">
          <thead><tr><th>Description</th><th>File</th><th>Size</th><th>SHA-256</th><th>Status</th></tr></thead>
          <tbody>
            {evidence.map((ev) => (
              <tr key={ev.id}>
                <td><Link to={`/evidence/${ev.id}`}>{ev.description || ev.file_name || '(open)'}</Link></td>
                <td>{ev.file_name || ''}</td>
                <td>{fmtSize(ev.size_bytes)}</td>
                <td className="mono" title={ev.sha256}>{ev.sha256 ? ev.sha256.slice(0, 16) + '…' : ''}</td>
                <td>{ev.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
