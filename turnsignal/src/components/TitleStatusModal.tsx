import { useState } from 'react';
import { supabase } from '../lib/supabase';
import TitleStatusIcon from './TitleStatusIcon';
import ModalCloseButton from './ModalCloseButton';

type TitleStatus = 'has_title' | 'poa' | 'waiting' | null;

const OPTIONS: { value: 'has_title' | 'poa' | 'waiting'; label: string; description: string }[] = [
  { value: 'has_title', label: 'Have title', description: 'Title in hand — good to list and sell.' },
  { value: 'poa', label: 'POA', description: 'Power of attorney on file — good to list and sell.' },
  { value: 'waiting', label: 'Waiting on title', description: "Title not in hand yet — don't list this one." },
];

export default function TitleStatusModal({
  vehicleId,
  vehicleLabel,
  currentStatus,
  onClose,
  onSaved,
}: {
  vehicleId: string;
  vehicleLabel: string;
  currentStatus: TitleStatus;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(value: 'has_title' | 'poa' | 'waiting' | null) {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('vehicles')
      .update({ title_status: value })
      .eq('id', vehicleId);
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-display text-lg font-semibold text-ink">Title status</h2>
          <ModalCloseButton onClick={onClose} />
        </div>
        <p className="text-xs text-steel mb-4">{vehicleLabel}</p>

        <div className="space-y-2">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              disabled={saving}
              className={`w-full flex items-center gap-3 text-left border rounded-lg px-3 py-2.5 disabled:opacity-60 ${
                currentStatus === opt.value ? 'border-signal-blue bg-blue-50' : 'border-gray-200'
              }`}
            >
              <TitleStatusIcon status={opt.value} size={22} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{opt.label}</p>
                <p className="text-xs text-steel">{opt.description}</p>
              </div>
            </button>
          ))}
        </div>

        {error && <p className="text-signal-red text-sm mt-3">{error}</p>}

        {currentStatus !== null && (
          <button onClick={() => handleSelect(null)} disabled={saving} className="mt-3 text-xs text-steel underline">
            Clear (not set)
          </button>
        )}
      </div>
    </div>
  );
}
