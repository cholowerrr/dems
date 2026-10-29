import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Logo } from '../components/Icons.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try { await login(username, password); nav('/dashboard'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="signin">
      <div className="signin__art">
        <div className="tape" />
        <Link to="/" className="signin__brand"><Logo size={34} /><b>DEMS</b></Link>
        <h2>Every handover on the record.</h2>
        <p>Sign in with the account your station administrator gave you. Everything you do here is logged.</p>
      </div>
      <div className="signin__form">
        <form onSubmit={submit}>
          <h1>Sign in</h1>
          <label>Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required />
          </label>
          <label>Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {error && <div className="notice notice--error" role="alert">{error}</div>}
          <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <Link to="/" className="muted">Back to home page</Link>
        </form>
      </div>
    </div>
  );
}
