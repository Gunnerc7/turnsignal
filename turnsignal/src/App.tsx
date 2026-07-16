import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import MarketingHome from './pages/marketing/MarketingHome';
import Pricing from './pages/marketing/Pricing';
import FAQ from './pages/marketing/FAQ';
import Terms from './pages/marketing/Terms';
import Privacy from './pages/marketing/Privacy';

function LoginRoute() {
  const navigate = useNavigate();
  return <Login onShowSignup={() => navigate('/signup')} />;
}

function SignupRoute() {
  const navigate = useNavigate();
  return <Signup onBackToLogin={() => navigate('/login')} />;
}

function AppRoutes() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink">
        <p className="text-steel text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={session ? <Navigate to="/app" replace /> : <MarketingHome />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/faq" element={<FAQ />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/login" element={session ? <Navigate to="/app" replace /> : <LoginRoute />} />
      <Route path="/signup" element={session ? <Navigate to="/app" replace /> : <SignupRoute />} />
      <Route path="/app" element={session ? <Dashboard /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
