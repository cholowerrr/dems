import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Badge, { EVENT_ICON, EVENT_LABEL } from '../components/Badge.jsx';
import { Icon } from '../components/Icons.jsx';
import FileViewer from '../components/FileViewer.jsx';

const fmtSize = (n) => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const fmtDate = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');

export default function EvidenceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [ev, setEv] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [people, setPeople] = useState([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState(false);

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
  // Viewers are not allowed to list users; asking would be refused and logged as ACCESS_DENIED.
  useEffect(() => {
    if (user.role === 'viewer') return;
    api('/users/lookup').then(setPeople).catch(() => setPeople([]));
  }, [user.role]);

  const nameOf = (uid) => {
    const p = people.find((x) => x.id === uid);
    return p ? p.full_name : uid && user.role !== 'viewer' ? `user #${uid}` : 'Not shown';
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

  async function copyHash() {
    try { await navigator.clipboard.writeText(ev.sha256); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* ignore */ }
  }

  if (error) return <div className="notice notice--error">{error}</div>;
  if (!ev) return <p className="muted">Loading…</p>;

  const isInv = user.role === 'investigator';
  const isCust = user.role === 'custodian';
  const canAct = isInv || isCust;
  const iHoldIt = ev.current_custodian_id === user.id;
  const canTransfer = ev.status === 'in_custody' && (isCust || (isInv && iHoldIt));
  const canRelease = ev.status === 'in_custody' && isCust;
  const custodians = people.filter((p) => p.role === 'custodian' && p.id !== user.id);
  const good = result && result.result === 'VERIFIED';

  return (
    <>
      <Link to={`/cases/${ev.case_id}`} className="crumb">← Back to case</Link>
      <div className="page__head">
        <div>
          <h2>{ev.description || ev.file_name}</h2>
          <p>{ev.file_name}</p>
        </div>
        <div className="spacer" />
        <Badge value={ev.status} />
      </div>

      <section className="etag" style={{ marginBottom: '1.2rem' }}>
        <dl className="kv">
          <dt>Evidence ID</dt><dd className="mono">{ev.id}</dd>
          <dt>File</dt><dd>{ev.file_name} <span className="muted">({ev.mime_type}, {fmtSize(ev.size_bytes)})</span></dd>
          <dt>Current custodian</dt><dd>{nameOf(ev.current_custodian_id)}</dd>
          <dt>Registered</dt><dd>{fmtDate(ev.registered_at)} by {nameOf(ev.registered_by)}</dd>
          <dt>SHA-256 fingerprint</dt>
          <dd>
            <div className="hashline">
              <code>{ev.sha256}</code>
              <button type="button" onClick={copyHash}><Icon name="copy" size={14} />{copied ? 'Copied' : 'Copy'}</button>
            </div>
          </dd>
        </dl>
      </section>

      <FileViewer evidence={ev} onAccessed={load} />

      {canAct && (
        <section className="panel stack" style={{ marginBottom: '1.2rem' }}>
          <h3>Integrity check</h3>
          <p className="muted">Fingerprints the stored file again and compares it with the database and the blockchain record.</p>
          <div>
            <button className="btn" disabled={!!busy} onClick={() => act('verify', `/evidence/${id}/verify`, {}, setResult)}>
              <Icon name="shield" size={16} />{busy === 'verify' ? 'Verifying…' : 'Verify integrity'}
            </button>
          </div>
          {result && (
            <div className={`verdict ${good ? 'verdict--good' : 'verdict--bad'}`} role="status">
              <Icon name={good ? 'check' : 'alert'} size={26} />
              <div>
                <h4>{good ? 'Verified. The file is intact.' : 'Tampered. The file does not match its record.'}</h4>
                <div className="hashes">
                  <span>Fingerprint of the file now</span>{result.current_hash || '(file missing)'}
                  <span>Recorded in the database {result.matches_database ? '(matches the file)' : '(does not match the file)'}</span>{result.database_hash}
                  <span>Recorded on the blockchain {result.matches_ledger ? '(matches the file)' : '(does not match the file)'}</span>{result.ledger_hash || '(no record found)'}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {actionError && <div className="notice notice--error" style={{ marginBottom: '1rem' }}>{actionError}</div>}
      {msg && <div className="notice notice--ok" style={{ marginBottom: '1rem' }}>{msg}</div>}

      {isInv && ev.status === 'in_custody' && !iHoldIt && (
        <div className="notice" style={{ marginBottom: '1.2rem', background: 'var(--manila-soft)' }}>
          This item is held by {nameOf(ev.current_custodian_id)}. Only the custodian holding it can transfer or release it.
        </div>
      )}

      {(canTransfer || canRelease) && (
        <div className="grid2" style={{ marginBottom: '1.2rem', gridTemplateColumns: canTransfer && canRelease ? undefined : '1fr' }}>
          {canTransfer && <form className="panel stack" onSubmit={(e) => { e.preventDefault(); act('transfer', `/evidence/${id}/transfer`, { to_user_id: Number(toUser), note: transferNote }); setToUser(''); setTransferNote(''); }}>
            <h3>{isInv ? 'Hand over to a custodian' : 'Transfer to another custodian'}</h3>
            <label>Custodian
              <select value={toUser} onChange={(e) => setToUser(e.target.value)} required>
                <option value="">Choose a custodian</option>
                {custodians.map((p) => <option key={p.id} value={p.id}>{p.full_name} ({p.username})</option>)}
              </select>
            </label>
            <label>Note
              <input value={transferNote} onChange={(e) => setTransferNote(e.target.value)} placeholder="Reason or remarks" />
            </label>
            <div><button className="btn" disabled={!!busy || !toUser}><Icon name="send" size={16} />{busy === 'transfer' ? 'Sending…' : isInv ? 'Hand over' : 'Transfer'}</button></div>
          </form>}

          {canRelease && <form className="panel stack" onSubmit={(e) => { e.preventDefault(); act('release', `/evidence/${id}/release`, { to_office: toOffice, note: releaseNote }); setToOffice(''); setReleaseNote(''); }}>
            <h3>Release to an office</h3>
            <label>Receiving office
              <input value={toOffice} onChange={(e) => setToOffice(e.target.value)} placeholder="e.g. City Prosecutor's Office" required />
            </label>
            <label>Note
              <input value={releaseNote} onChange={(e) => setReleaseNote(e.target.value)} placeholder="Reference or remarks" />
            </label>
            <div><button className="btn btn--manila" disabled={!!busy || !toOffice}>{busy === 'release' ? 'Releasing…' : 'Release evidence'}</button></div>
          </form>}
        </div>
      )}

      {isCust && ev.status === 'transferred' && (
        <form className="panel stack" style={{ marginBottom: '1.2rem' }} onSubmit={(e) => { e.preventDefault(); act('receive', `/evidence/${id}/receive`, { note: receiveNote }); setReceiveNote(''); }}>
          <h3>Confirm receipt</h3>
          <p className="muted">This evidence was transferred and is waiting to be received. Only the custodian it was sent to can confirm.</p>
          <label>Note
            <input value={receiveNote} onChange={(e) => setReceiveNote(e.target.value)} placeholder="Condition on receipt (optional)" />
          </label>
          <div><button className="btn" disabled={!!busy}><Icon name="inbox" size={16} />{busy === 'receive' ? 'Confirming…' : 'I received this evidence'}</button></div>
        </form>
      )}

      <section className="panel">
        <div className="panel__title"><h3>Custody timeline</h3></div>
        {timeline.length === 0 && <p className="muted">No events yet.</p>}
        <ol className="timeline">
          {timeline.map((t) => (
            <li key={t.id} className={t.event_type === 'verification_failed' ? 'bad' : t.event_type === 'verified' ? 'good' : ''}>
              <span className="mark"><Icon name={EVENT_ICON[t.event_type] || 'file'} size={15} /></span>
              <div>
                <div className="what">
                  <b>{EVENT_LABEL[t.event_type] || t.event_type}</b>
                  {t.from_user && <> from <b>{t.from_user}</b></>}
                  {t.to_user && <> to <b>{t.to_user}</b></>}
                  {t.to_office && <> to <b>{t.to_office}</b></>}
                </div>
                <div className="when">{fmtDate(t.created_at)}</div>
                {t.note && <div className="muted">{t.note}</div>}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
