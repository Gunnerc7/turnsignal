import { useState } from 'react';
import { supabase } from '../lib/supabase';
import ModalCloseButton from './ModalCloseButton';

const ROLE_OPTIONS = ['manager', 'sales', 'service', 'detail', 'photo'];

export default function InviteTeammateModal({
  dealershipId,
  canAssignRoles,
  onClose,
}: {
  dealershipId: string;
  canAssignRoles: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite() {
    if (!email.trim()) return;
    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase.from('dealership_invites').insert({
      dealership_id: dealershipId,
      email: email.trim().toLowerCase(),
      dealership_role: canAssignRoles && role ? role : null,
    });

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setDone(true);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-ink">Invite a teammate</h2>
          <ModalCloseButton onClick={onClose} />
        </div>

        {done ? (
          <div>
            <p className="text-sm text-ink mb-4">
              Invite added. Tell them to go to the sign-in page, tap "Create an account," and sign up using{' '}
              <span className="font-semibold">{email}</span> — they'll choose their own password, and it'll
              connect to this dealership automatically.
            </p>
            <button
              onClick={onClose}
              className="w-full bg-signal-blue text-white font-semibold rounded-lg py-2.5"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <label className="block text-sm font-medium text-ink mb-1">Their email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="name@example.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base mb-3"
            />

            {canAssignRoles && (
              <>
                <label className="block text-sm font-medium text-ink mb-1">Role (optional)</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base bg-white mb-3"
                >
                  <option value="">No role</option>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </option>
                  ))}
                </select>
              </>
            )}

            {error && <p className="text-signal-red text-sm mb-3">{error}</p>}
            <button
              onClick={handleInvite}
              disabled={saving || !email.trim()}
              className="w-full bg-signal-blue text-white font-semibold rounded-lg py-2.5 disabled:opacity-60"
            >
              {saving ? 'Adding…' : 'Add invite'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
