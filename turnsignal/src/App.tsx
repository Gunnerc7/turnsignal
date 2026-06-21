import { useState } from 'react';
import { AuthProvider, useAuth } from './lib/AuthContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';

function Routes() {
  const { session, loading } = useAuth();
  const [showSignup, setShowSignup] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink">
        <p className="text-steel text-sm">Loading…</p>
      </div>
    );
  }

  if (session) return <Dashboard />;

  return showSignup ? (
    <Signup onBackToLogin={() => setShowSignup(false)} />
  ) : (
    <Login onShowSignup={() => setShowSignup(true)} />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  );
}
