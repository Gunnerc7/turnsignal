import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

export default function EditNameModal({ onClose }: { onClose: () => void }) {
  const { session, refreshUserName } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setFirstName(data?.first_name ?? '');
        setLastName(data?.last_name ?? '');
        setLoading(false);
      });
  }, [session]);

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are both required.');
      return;
    }
    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ first_name: firstName.trim(), last_name: lastName.trim() })
      .eq('id', session?.user.id);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    refreshUserName();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-ink">Your name</h2>
          <button onClick={onClose} className="text-steel text-sm">
            Close
          </button>
        </div>

        {loading ? (
          <p className="text-steel text-sm">Loading…</p>
        ) : (
          <>
            <p className="text-sm text-steel mb-3">
              Shows up next to notes, vehicles you add, and items you complete.
            </p>
            <label className="block text-sm font-medium text-ink mb-1">First name</label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base mb-3"
            />
            <label className="block text-sm font-medium text-ink mb-1">Last name</label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base mb-3"
            />
            {error && <p className="text-signal-red text-sm mb-3">{error}</p>}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-signal-blue text-white font-semibold rounded-lg py-2.5 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save name'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
