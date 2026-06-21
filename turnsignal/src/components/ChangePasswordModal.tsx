import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSave() {
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-ink">Change password</h2>
          <button onClick={onClose} className="text-steel text-sm">
            Close
          </button>
        </div>

        {done ? (
          <div>
            <p className="text-sm text-ink mb-4">Password updated.</p>
            <button
              onClick={onClose}
              className="w-full bg-signal-blue text-white font-semibold rounded-lg py-2.5"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <label className="block text-sm font-medium text-ink mb-1">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base mb-3"
            />
            <label className="block text-sm font-medium text-ink mb-1">Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base mb-3"
            />
            {error && <p className="text-signal-red text-sm mb-3">{error}</p>}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-signal-blue text-white font-semibold rounded-lg py-2.5 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save new password'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
