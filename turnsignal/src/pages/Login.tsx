import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import TurnSignalLogo from '../components/TurnSignalLogo';

export default function Login({ onShowSignup }: { onShowSignup: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Forgot-password state — kept local to this view so it doesn't need
  // its own route. Uses Supabase's built-in reset link, which works on
  // their default sender even without a custom SMTP setup.
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (error) setError(error.message);
  }

  async function handleForgotSubmit(e: FormEvent) {
    e.preventDefault();
    setForgotError(null);
    setForgotSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}`,
    });
    setForgotSending(false);
    if (error) {
      setForgotError(error.message);
    } else {
      setForgotSent(true);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <TurnSignalLogo size="hero" />
          </div>
          <p className="text-steel text-sm">Know what's next for every vehicle.</p>
        </div>

        {!showForgot ? (
          <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-signal-blue"
                autoComplete="email"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-ink">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email);
                    setShowForgot(true);
                  }}
                  className="text-xs text-signal-blue"
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-signal-blue"
                autoComplete="current-password"
              />
            </div>

            {error && <p className="text-signal-red text-sm">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-signal-blue text-white font-display font-semibold rounded-lg py-3 disabled:opacity-60 active:scale-[0.98] transition"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>

            <button type="button" onClick={onShowSignup} className="w-full text-center text-sm text-steel py-1">
              Don't have an account? Create one
            </button>
          </form>
        ) : (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <button
              onClick={() => { setShowForgot(false); setForgotSent(false); setForgotError(null); }}
              className="text-sm text-steel mb-4 flex items-center gap-1"
            >
              ← Back to sign in
            </button>

            {forgotSent ? (
              <div className="text-center py-4">
                <p className="text-2xl mb-3">📬</p>
                <p className="font-semibold text-ink mb-1">Check your email</p>
                <p className="text-sm text-steel">
                  If <span className="text-ink font-medium">{forgotEmail}</span> has an account, a password reset link is on its way. Check your spam folder if it doesn't arrive within a few minutes.
                </p>
              </div>
            ) : (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <div>
                  <p className="font-semibold text-ink mb-1">Reset your password</p>
                  <p className="text-sm text-steel mb-3">Enter your email and we'll send a reset link.</p>
                  <label className="block text-sm font-medium text-ink mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-signal-blue"
                    autoComplete="email"
                  />
                </div>

                {forgotError && <p className="text-signal-red text-sm">{forgotError}</p>}

                <button
                  type="submit"
                  disabled={forgotSending}
                  className="w-full bg-signal-blue text-white font-display font-semibold rounded-lg py-3 disabled:opacity-60 active:scale-[0.98] transition"
                >
                  {forgotSending ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
