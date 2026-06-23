import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Signup({ onBackToLogin }: { onBackToLogin: () => void }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName.trim(), last_name: lastName.trim() } },
    });
    setSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink px-4">
        <div className="w-full max-w-sm bg-white rounded-xl shadow-lg p-6 text-center">
          <h2 className="font-display text-lg font-semibold text-ink mb-2">Check your email</h2>
          <p className="text-steel text-sm mb-4">
            We sent a confirmation link to {email}. Click it, then come back and sign in.
          </p>
          <button onClick={onBackToLogin} className="text-signal-blue font-medium text-sm">
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-signal-amber shadow-glowAmber" aria-hidden="true" />
            <h1 className="font-display text-3xl font-bold text-white tracking-tight">TurnSignal</h1>
          </div>
          <p className="text-steel text-sm">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">First name</label>
              <input
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-signal-blue"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Last name</label>
              <input
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-signal-blue"
              />
            </div>
          </div>

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
            <p className="text-xs text-steel mt-1">Use the email your dealership owner invited.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">Create a password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-signal-blue"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">Confirm password</label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-signal-blue"
              autoComplete="new-password"
            />
          </div>

          {error && <p className="text-signal-red text-sm">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-signal-blue text-white font-display font-semibold rounded-lg py-3 disabled:opacity-60 active:scale-[0.98] transition"
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>

          <button type="button" onClick={onBackToLogin} className="w-full text-center text-sm text-steel py-1">
            Already have an account? Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
