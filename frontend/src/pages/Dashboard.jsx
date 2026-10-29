import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { EVENT_ICON, EVENT_LABEL } from '../components/Badge.jsx';
import { Icon } from '../components/Icons.jsx';

const fmt = (d) => new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

const ROLE_NOTE = {
  admin: 'You manage accounts and access. Evidence and custody records are read-only for you.',
  investigator: 'You open cases and register evidence.',
  custodian: 'You receive, hold, transfer and release evidence.',
  viewer: 'You have read-only access to the cases assigned to you.',
};
const ROLE_LABEL = { admin: 'Administrators', investigator: 'Investigators', custodian: 'Custodians', viewer: 'Viewers' };

function who(e) {
  if (e.event_type === 'transferred') return `${e.from_user || '?'} to ${e.to_user || '?'}`;
  if (e.event_type === 'received') return `by ${e.to_user || e.from_user || '?'}`;
  if (e.event_type === 'released') return `by ${e.from_user || '?'} to ${e.to_office || 'another office'}`;
  return e.from_user ? `by ${e.from_user}` : '';
}

export default function Dashboard() {
  const { user } = useAuth();
  const [s, setS] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api('/stats').then(setS).catch((e) => setError(e.message)); }, []);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = (user.full_name || user.username).split(' ')[0];

  return (
    <>
      <div className="page__head">
        <div>
          <h2>{greet}, {first}</h2>
          <p>{ROLE_NOTE[user.role]}</p>
        </div>
        <div className="spacer" />
        {user.role === 'investigator' && (
          <Link to="/cases?new=1" className="btn"><Icon name="plus" size={16} />New case</Link>
        )}
      </div>

      {error && <div className="notice notice--error">{error}</div>}
      {!s && !error && <p className="muted">Loading…</p>}

      {s && user.role === 'admin' && (
        <>
          <div className="stats">
            <div><b>{s.users.active}</b><span>active accounts</span></div>
            <div><b>{s.users.disabled}</b><span>disabled accounts</span></div>
            <div><b>{s.failures_7d.reduce((a, x) => a + x.n, 0)}</b><span>failed or refused actions, last 7 days</span></div>
            <div><b>{s.evidence_total}</b><span>evidence items in the system</span></div>
          </div>
          <div className="dash-grid">
            <div>
              <section className="panel">
                <div className="panel__title"><h3>Accounts by role</h3><div className="spacer" /><Link to="/users" className="btn btn--light btn--small">Manage users</Link></div>
                <div className="checks" style={{ flexWrap: 'wrap' }}>
                  {Object.entries(s.users.by_role).map(([r, n]) => (
                    <div key={r}><b>{n}</b><span className="muted">{ROLE_LABEL[r]}</span></div>
                  ))}
                </div>
              </section>
              <section className="panel">
                <div className="panel__title"><h3>Failed or refused, last 7 days</h3></div>
                {s.failures_7d.length === 0 ? <p className="muted">None. No failed sign-ins or refused actions.</p> : (
                  <ul className="feed">
                    {s.failures_7d.map((f) => (
                      <li key={f.action}><span className="dot bad"><Icon name="alert" size={15} /></span><span><b className="mono">{f.action}</b><small>{f.n} {f.n === 1 ? 'time' : 'times'}</small></span></li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
            <section className="panel">
              <div className="panel__title"><h3>Recent system activity</h3><div className="spacer" /><Link to="/audit" className="btn btn--light btn--small">Audit log</Link></div>
              <ul className="feed">
                {s.audit_recent.map((a) => (
                  <li key={a.id}>
                    <span className={`dot ${a.success ? 'good' : 'bad'}`}><Icon name={a.success ? 'check' : 'alert'} size={15} /></span>
                    <span><b className="mono">{a.action}</b><small>{a.username || 'unknown user'} · {fmt(a.created_at)}</small></span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}

      {s && user.role !== 'admin' && (
        <>
          {user.role === 'custodian' && (
            <section className="panel" style={{ marginBottom: '1.1rem' }}>
              <div className="panel__title"><h3>Waiting for you to receive</h3></div>
              {s.awaiting_me.length === 0 ? <p className="muted">Nothing is waiting. Items sent to you appear here.</p> : s.awaiting_me.map((x) => (
                <Link key={x.id} to={`/evidence/${x.id}`} className="flag" style={{ background: 'var(--manila-soft)', color: '#2a2415', borderColor: 'var(--manila-deep)' }}>
                  <Icon name="inbox" />
                  <span><b>{x.description || x.file_name}</b><small>From {x.from_user || 'another custodian'} · case {x.case_number} · {fmt(x.created_at)}. Open to confirm receipt.</small></span>
                </Link>
              ))}
              {s.mine.length > 0 && (
                <>
                  <h4 style={{ margin: '1rem 0 .4rem' }}>In your custody</h4>
                  <ul className="feed">
                    {s.mine.map((x) => (
                      <li key={x.id}><span className="dot"><Icon name="file" size={15} /></span><span><Link to={`/evidence/${x.id}`}>{x.description || x.file_name}</Link><small>case {x.case_number}</small></span></li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
          <div className="stats">
            <div><b>{s.cases}</b><span>{s.cases === 1 ? 'case' : 'cases'}</span></div>
            <div><b>{s.evidence_total}</b><span>evidence {s.evidence_total === 1 ? 'item' : 'items'} registered</span></div>
            <div><b>{s.evidence_by_status.in_custody}</b><span>in custody now</span></div>
            <div><b>{s.evidence_by_status.transferred}</b><span>waiting to be received</span></div>
          </div>

          <div className="dash-grid">
            <div>
              <section className="panel">
                <div className="panel__title"><h3>Where the evidence is</h3></div>
                {s.evidence_total === 0 ? (
                  <p className="muted">Nothing registered yet. Open a case and register the first item.</p>
                ) : (
                  <>
                    <div className="split-bar" role="img" aria-label="Evidence by status">
                      <i style={{ width: `${(s.evidence_by_status.in_custody / s.evidence_total) * 100}%`, background: '#2f6fc4' }} />
                      <i style={{ width: `${(s.evidence_by_status.transferred / s.evidence_total) * 100}%`, background: '#d98f1e' }} />
                      <i style={{ width: `${(s.evidence_by_status.released / s.evidence_total) * 100}%`, background: '#8a96a5' }} />
                    </div>
                    <div className="legend">
                      <span style={{ '--c': '#2f6fc4' }}>In custody {s.evidence_by_status.in_custody}</span>
                      <span style={{ '--c': '#d98f1e' }}>Awaiting receipt {s.evidence_by_status.transferred}</span>
                      <span style={{ '--c': '#8a96a5' }}>Released {s.evidence_by_status.released}</span>
                    </div>
                  </>
                )}
              </section>

              <section className="panel">
                <div className="panel__title"><h3>Integrity checks, last 30 days</h3></div>
                <div className="checks">
                  <div className="good"><b>{s.checks_30d.passed}</b><span className="muted">passed</span></div>
                  <div className="bad"><b>{s.checks_30d.failed}</b><span className="muted">failed</span></div>
                </div>
                {s.flagged.length === 0 ? (
                  <p className="muted" style={{ marginTop: '.9rem' }}>No item is currently flagged. The latest check on every verified item passed.</p>
                ) : (
                  s.flagged.map((f) => (
                    <Link key={f.evidence_id} to={`/evidence/${f.evidence_id}`} className="flag">
                      <Icon name="alert" />
                      <span>
                        <b>{f.description || f.file_name}</b>
                        <small>Latest check failed on {fmt(f.created_at)} · case {f.case_number}</small>
                      </span>
                    </Link>
                  ))
                )}
              </section>
            </div>

            <section className="panel">
              <div className="panel__title"><h3>Recent custody activity</h3></div>
              {s.recent.length === 0 && <p className="muted">Activity appears here as evidence is registered and handled.</p>}
              <ul className="feed">
                {s.recent.map((e) => (
                  <li key={e.id}>
                    <span className={`dot ${e.event_type === 'verified' ? 'good' : e.event_type === 'verification_failed' ? 'bad' : ''}`}>
                      <Icon name={EVENT_ICON[e.event_type] || 'file'} size={15} />
                    </span>
                    <span>
                      <Link to={`/evidence/${e.evidence_id}`}>{EVENT_LABEL[e.event_type] || e.event_type}: {e.description || e.file_name}</Link>
                      <small>{who(e)}{who(e) ? ' · ' : ''}{e.case_number} · {fmt(e.created_at)}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </>
  );
}
