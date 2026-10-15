import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const fmtSize = (n) => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const fmtDate = (d) => (d ? new Date(d).toLocaleString() : '');

const EVENT_LABEL = {
  registered: 'Registered',
  accessed: 'Accessed',
  transferred: 'Transferred',
  received: 'Received',
  released: 'Released',
  verified: 'Verified (intact)',
  verification_failed: 'Verification FAILED',
};

export default function EvidenceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [ev, setEv] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [people, setPeople] = useState([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);   // verify result
  const [msg, setMsg] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState('');

  const [toUser, setToUser] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [toOffice, setToOffice] = useState('');
  const [releaseNote, setReleaseNote] = useState('');
  const [receiveNote, setReceiveNote] = useState('');

  function load() {
    api(`/evidence/${id}`).then(setEv).catch((e) => setError(e.message));
    api(`/evidence/${id}/timeline`).then(setTimeline).catch(() => {});
  }
  useEffect(load, [id]);
  useEffect(() => {
    api('/users/lookup').then(setPeople).catch(() => setPeople([]));
  }, []);

  const nameOf = (uid) => {
    const p = people.find((x) => x.id === uid);
    return p ? `${p.full_name} (${p.username})` : uid ? `user #${uid}` : '—';
  };

  async function act(name, path, body, onOk) {
    setActionError(''); setMsg(''); setBusy(name);
    try {
      const r = await api(path, { method: 'POST', body });
      if (onOk) onOk(r); else setMsg(r.message || 'Done.');
      load();
    } catch (e) { setActionError(e.message); }
    finally { setBusy(''); }
  }

  if (error) return <div className="error">{error}</div>;
  if (!ev) return <p className="muted">Loading…</p>;

  const isInv = user.role === 'investigator';
  const isCust = user.role === 'custodian';
  const canAct = isInv || isCust;
  const custodians = people.filter((p) => p.role === 'custodian' && p.id !== user.id);

  return (
    <>
      <p><Link to={`/cases/${ev.case_id}`}>← Back to case</Link></p>
      <h2>{ev.description || ev.file_name}</h2>

      <div className="card kv">
        <div><span>File</span>{ev.file_name} <span className="muted">({ev.mime_type})</span></div>
        <div><span>Size</span>{fmtSize(ev.size_bytes)}</div>
        <div><span>Status</span><b>{ev.status}</b></div>
        <div><span>Current custodian</span>{nameOf(ev.current_custodian_id)}</div>
        <div><span>Registered</span>{fmtDate(ev.registered_at)} by {nameOf(ev.registered_by)}</div>
        <div><span>SHA-256</span><code className="mono">{ev.sha256}</code></div>
      </div>

      {canAct && (
        <div className="card stack">
          <h3>Integrity check</h3>
          <p className="muted">Re-hashes the stored file and compares it with the database and the blockchain record.</p>
          <div>
            <button className="btn" disabled={!!busy}
              onClick={() => act('verify', `/evidence/${id}/verify`, {}, setResult)}>
              {busy === 'verify' ? 'Verifying…' : 'Verify integrity'}
            </button>
          </div>
          {result && (
            <div className={result.result === 'VERIFIED' ? 'verdict good' : 'verdict bad'}>
              <div className="big">{result.result === 'VERIFIED' ? '✔ VERIFIED — file is intact' : '✘ TAMPERED — file does not match'}</div>
              <div className="mono small">Current file hash: {result.current_hash || '(file missing)'}</div>
              <div className="mono small">Database hash: {result.database_hash} {result.matches_database ? '✔' : '✘'}</div>
              <div className="mono small">Ledger hash: {result.ledger_hash} {result.matches_ledger ? '✔' : '✘'}</div>
            </div>
          )}
        </div>
      )}

      {actionError && <div className="error">{actionError}</div>}
      {msg && <div className="ok">{msg}</div>}

      {canAct && ev.status === 'in_custody' && (
        <div className="grid2">
          <form className="card stack" onSubmit={(e) => { e.preventDefault(); act('transfer', `/evidence/${id}/transfer`, { to_user_id: Number(toUser), note: transferNote }); setToUser(''); setTransferNote(''); }}>
            <h3>Transfer to another custodian</h3>
            <label>Custodian
              <select value={toUser} onChange={(e) => setToUser(e.target.value)} required>
                <option value="">— choose —</option>
                {custodians.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.username})</option>)}
              </select>
            </label>
            <label>Note
              <input value={transferNote} onChange={(e) => setTransferNote(e.target.value)} placeholder="Reason / remarks" />
            </label>
            <div><button className="btn" disabled={!!busy || !toUser}>{busy === 'transfer' ? 'Sending…' : 'Transfer'}</button></div>
          </form>

          <form className="card stack" onSubmit={(e) => { e.preventDefault(); act('release', `/evidence/${id}/release`, { to_office: toOffice, note: releaseNote }); setToOffice(''); setReleaseNote(''); }}>
            <h3>Release to an office</h3>
            <label>Office / receiving party
              <input value={toOffice} onChange={(e) => setToOffice(e.target.value)} placeholder="e.g. City Prosecutor's Office" required />
            </label>
            <label>Note
              <input value={releaseNote} onChange={(e) => setReleaseNote(e.target.value)} placeholder="Reference / remarks" />
            </label>
            <div><button className="btn" disabled={!!busy || !toOffice}>{busy === 'release' ? 'Releasing…' : 'Release'}</button></div>
          </form>
        </div>
      )}

      {isCust && ev.status === 'transferred' && (
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); act('receive', `/evidence/${id}/receive`, { note: receiveNote }); setReceiveNote(''); }}>
          <h3>Confirm receipt</h3>
          <p className="muted">This evidence was transferred and is waiting to be received. Only the custodian it was sent to can confirm.</p>
          <label>Note
            <input value={receiveNote} onChange={(e) => setReceiveNote(e.target.value)} placeholder="Condition on receipt (optional)" />
          </label>
          <div><button className="btn" disabled={!!busy}>{busy === 'receive' ? 'Confirming…' : 'I received this evidence'}</button></div>
        </form>
      )}

      <h3>Custody timeline</h3>
      <ol className="timeline">
        {timeline.map((t) => (
          <li key={t.id} className={t.event_type === 'verification_failed' ? 'bad' : t.event_type === 'verified' ? 'good' : ''}>
            <div className="when">{fmtDate(t.created_at)}</div>
            <div className="what"><b>{EVENT_LABEL[t.event_type] || t.event_type}</b>
              {t.from_user && <> · from <b>{t.from_user}</b></>}
              {t.to_user && <> · to <b>{t.to_user}</b></>}
              {t.to_office && <> · to <b>{t.to_office}</b></>}
            </div>
            {t.note && <div className="muted">{t.note}</div>}
          </li>
        ))}
      </ol>
    </>
  );
}
