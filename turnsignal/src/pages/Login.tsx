import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import TurnSignalLogo from '../components/TurnSignalLogo';

export default function Login({ onShowSignup }: { onShowSignup: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setSubmitting(false);
    if (error) {
      setError(error.message);
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
            <label className="block text-sm font-medium text-ink mb-1">Password</label>
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
      </div>
    </div>
  );
}
