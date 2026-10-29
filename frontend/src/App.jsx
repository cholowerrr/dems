import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Cases from './pages/Cases.jsx';
import CaseDetail from './pages/CaseDetail.jsx';
import EvidenceDetail from './pages/EvidenceDetail.jsx';
import Users from './pages/Users.jsx';
import AuditLog from './pages/AuditLog.jsx';

function Protected({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="center muted">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <Layout>{children}</Layout>;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <p className="center muted">Loading…</p>;
  return user ? <Navigate to="/dashboard" replace /> : <Landing />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/cases" element={<Protected><Cases /></Protected>} />
      <Route path="/cases/:id" element={<Protected><CaseDetail /></Protected>} />
      <Route path="/evidence/:id" element={<Protected><EvidenceDetail /></Protected>} />
      <Route path="/users" element={<Protected roles={['admin']}><Users /></Protected>} />
      <Route path="/audit" element={<Protected roles={['admin']}><AuditLog /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
