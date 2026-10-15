import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">DEMS</Link>
        <nav>
          <Link to="/">Cases</Link>
          {user.role === 'admin' && <Link to="/users">Users</Link>}
          {user.role === 'admin' && <Link to="/audit">Audit log</Link>}
        </nav>
        <div className="spacer" />
        <span className="who">{user.username} <span className="badge">{user.role}</span></span>
        <button className="btn ghost" onClick={async () => { await logout(); nav('/login'); }}>
          Log out
        </button>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
