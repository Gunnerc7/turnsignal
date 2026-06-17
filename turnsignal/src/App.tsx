import { AuthProvider, useAuth } from './lib/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

function Routes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink">
        <p className="text-steel text-sm">Loading…</p>
      </div>
    );
  }

  return session ? <Dashboard /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  );
}
