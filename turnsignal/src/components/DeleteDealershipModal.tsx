import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function DeleteDealershipModal({
  dealershipId,
  dealershipName,
  onClose,
  onDeleted,
}: {
  dealershipId: string;
  dealershipName: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText.trim() === dealershipName;

  async function handleDelete() {
    if (!canDelete) return;
    setDeleting(true);
    setError(null);

    // Delete children before the parent, explicitly, rather than relying on
    // cascade rules that may or may not exist on tables built outside this code.
    const { error: vehiclesError } = await supabase
      .from('vehicles')
      .delete()
      .eq('dealership_id', dealershipId);
    if (vehiclesError) {
      setDeleting(false);
      setError(vehiclesError.message);
      return;
    }

    const { error: profilesError } = await supabase
      .from('profiles')
      .delete()
      .eq('dealership_id', dealershipId);
    if (profilesError) {
      setDeleting(false);
      setError(profilesError.message);
      return;
    }

    const { error: invitesError } = await supabase
      .from('dealership_invites')
      .delete()
      .eq('dealership_id', dealershipId);
    if (invitesError) {
      setDeleting(false);
      setError(invitesError.message);
      return;
    }

    const { error: dealershipError } = await supabase
      .from('dealerships')
      .delete()
      .eq('id', dealershipId);
    setDeleting(false);

    if (dealershipError) {
      setError(dealershipError.message);
      return;
    }
    onDeleted();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5">
        <h2 className="font-display text-lg font-semibold text-signal-red mb-2">Delete dealership</h2>
        <p className="text-sm text-steel mb-4">
          This permanently deletes <span className="font-semibold text-ink">{dealershipName}</span> and every
          vehicle, note, and history record tied to it, along with everyone's login access to it. This cannot
          be undone.
        </p>
        <p className="text-sm text-ink mb-2">
          Type <span className="font-semibold">{dealershipName}</span> to confirm:
        </p>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base mb-3"
        />
        {error && <p className="text-signal-red text-sm mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 text-steel font-medium py-2.5">
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="flex-1 bg-signal-red text-white font-semibold rounded-lg py-2.5 disabled:opacity-40"
          >
            {deleting ? 'Deleting…' : 'Delete forever'}
          </button>
        </div>
      </div>
    </div>
  );
}
