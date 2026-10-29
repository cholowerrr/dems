import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Icon, Logo } from './Icons.jsx';

const ROLE_LABEL = { admin: 'Administrator', investigator: 'Investigator', custodian: 'Evidence custodian', viewer: 'Viewer' };

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [loc.pathname]);

  const links = [
    { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { to: '/cases', label: 'Cases', icon: 'folder' },
    ...(user.role === 'admin' ? [
      { to: '/users', label: 'Users', icon: 'users' },
      { to: '/audit', label: 'Audit log', icon: 'audit' },
    ] : []),
  ];

  return (
    <div className="shell">
      <div className="topbar">
        <button onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" size={24} /></button>
        <Logo size={26} /><b>DEMS</b>
      </div>
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <Link to="/dashboard" className="sidebar__brand">
          <Logo />
          <span><b>DEMS</b><small>Digital Evidence<br />Management System</small></span>
        </Link>
        <nav className="nav" aria-label="Main">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive || (l.to === '/cases' && loc.pathname.startsWith('/evidence')) ? 'active' : '')}>
              <Icon name={l.icon} />{l.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__foot">
          <div className="me">
            <strong>{user.full_name || user.username}</strong>
            <span>{ROLE_LABEL[user.role] || user.role}</span>
          </div>
          <button className="btn btn--small" onClick={async () => { await logout(); nav('/login'); }}>
            <Icon name="logout" size={16} />Sign out
          </button>
        </div>
      </aside>
      <main className="main"><div className="page">{children}</div></main>
    </div>
  );
}
