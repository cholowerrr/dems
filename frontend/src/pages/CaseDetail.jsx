import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Badge from '../components/Badge.jsx';
import { Icon } from '../components/Icons.jsx';

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

  function load() { api(`/cases/${id}`).then(setData).catch((e) => setError(e.message)); }
  useEffect(load, [id]);

  async function upload(e) {
    e.preventDefault();
    setUpError(''); setUpOk(''); setBusy(true);
    try {
      const fd = new FormData();
      fd.append('description', desc);
      fd.append('file', file); // the file must come last and be named "file"
      const r = await api(`/cases/${id}/evidence`, { method: 'POST', form: fd });
      setUpOk(`Registered and recorded on the blockchain. SHA-256: ${r.sha256 || r.evidence?.sha256 || ''}`);
      setDesc(''); setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      load();
    } catch (err) { setUpError(err.message); }
    finally { setBusy(false); }
  }

  if (error) return <div className="notice notice--error">{error}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  const c = data.case || data;
  const evidence = data.evidence || c.evidence || [];
  const canReport = true; // every role can open the report for cases it can see

  return (
    <>
      <Link to="/cases" className="crumb">← All cases</Link>
      <div className="page__head">
        <div>
          <h2>{c.case_number}</h2>
          <p>{c.case_name}</p>
        </div>
        <div className="spacer" />
        {canReport && (
          <a className="btn btn--light" href={`/api/cases/${id}/report.pdf`} target="_blank" rel="noreferrer">
            <Icon name="file" size={16} />Download case report (PDF)
          </a>
        )}
      </div>
      <div className="chips" style={{ marginBottom: '1.3rem' }}>
        <span>Type <b>{c.case_type}</b></span>
        <span>Status <Badge kind="case" value={c.status} /></span>
        <span>Evidence items <b>{evidence.length}</b></span>
      </div>

      {user.role === 'investigator' && (
        <form className="panel stack" onSubmit={upload} style={{ marginBottom: '1.3rem' }}>
          <h3>Register evidence</h3>
          <label>Description
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Photo of broken window" />
          </label>
          <label>File
            <span className="dropzone">
              <input ref={fileInput} type="file" onChange={(e) => setFile(e.target.files[0] || null)} required />
            </span>
            <small>DEMS computes the fingerprint, stores the file on this server and records the fingerprint on the blockchain. This takes a few seconds.</small>
          </label>
          {upError && <div className="notice notice--error">{upError}</div>}
          {upOk && <div className="notice notice--ok">{upOk}</div>}
          <div>
            <button className="btn" disabled={busy || !file}>
              <Icon name="upload" size={16} />{busy ? 'Recording…' : 'Register evidence'}
            </button>
          </div>
        </form>
      )}

      <h3 style={{ margin: '0 0 .7rem' }}>Evidence in this case</h3>
      {evidence.length === 0 ? (
        <div className="panel empty">
          <strong>No evidence yet</strong>
          {user.role === 'investigator' ? 'Use the form above to register the first item.' : 'Items registered by the investigator will appear here.'}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Description</th><th>File</th><th>Size</th><th>Fingerprint</th><th>Status</th></tr></thead>
            <tbody>
              {evidence.map((ev) => (
                <tr key={ev.id}>
                  <td><Link to={`/evidence/${ev.id}`}><b>{ev.description || ev.file_name || 'Open item'}</b></Link></td>
                  <td>{ev.file_name}</td>
                  <td>{fmtSize(ev.size_bytes)}</td>
                  <td className="mono" title={ev.sha256}>{ev.sha256 ? ev.sha256.slice(0, 12) + '…' : ''}</td>
                  <td><Badge value={ev.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
