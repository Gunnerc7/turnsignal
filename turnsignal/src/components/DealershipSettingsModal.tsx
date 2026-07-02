import { useState } from 'react';
import { supabase } from '../lib/supabase';
import ModalCloseButton from './ModalCloseButton';

export default function DealershipSettingsModal({
  dealershipId,
  yellowDays,
  redDays,
  onClose,
  onChanged,
}: {
  dealershipId: string;
  yellowDays: number;
  redDays: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [yellow, setYellow] = useState(String(yellowDays));
  const [red, setRed] = useState(String(redDays));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const yellowNum = parseInt(yellow, 10);
    const redNum = parseInt(red, 10);

    if (!yellowNum || !redNum || yellowNum < 1 || redNum <= yellowNum) {
      setError('Red days needs to be higher than yellow days.');
      return;
    }

    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('dealerships')
      .update({ yellow_threshold_days: yellowNum, red_threshold_days: redNum })
      .eq('id', dealershipId);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onChanged();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-semibold text-ink">Aging colors</h2>
          <ModalCloseButton onClick={onClose} />
        </div>
        <p className="text-sm text-steel mb-4">
          How many days in a stage before a card turns yellow, then red, for this dealership. Waiting on Title
          automatically gets a few extra days of leeway on top of these.
        </p>

        <label className="block text-sm font-medium text-ink mb-1">Yellow after (days)</label>
        <input
          type="number"
          value={yellow}
          onChange={(e) => setYellow(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base mb-3"
        />

        <label className="block text-sm font-medium text-ink mb-1">Red after (days)</label>
        <input
          type="number"
          value={red}
          onChange={(e) => setRed(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base mb-3"
        />

        {error && <p className="text-signal-red text-sm mb-3">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-signal-blue text-white font-semibold rounded-lg py-2.5 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
