import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { ClientDetailPage } from "./pages/ClientDetail";
import { WorkDetailPage } from "./pages/WorkDetail";
import { DuesPage } from "./pages/Dues";
import { SyncStatusBadge } from "./components/SyncStatusBadge";

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Legal Ledger</span>
        <nav>
          <NavLink to="/" end>Clients</NavLink>
          <NavLink to="/dues">Dues</NavLink>
        </nav>
        <div className="topbar-right">
          <SyncStatusBadge />
          {user && <button className="link-btn" onClick={logout}>Log out</button>}
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

function PrivateRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center-screen">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/clients/:clientId" element={<ClientDetailPage />} />
        <Route path="/works/:workId" element={<WorkDetailPage />} />
        <Route path="/dues" element={<DuesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<PrivateRoutes />} />
      </Routes>
    </AuthProvider>
  );
}
