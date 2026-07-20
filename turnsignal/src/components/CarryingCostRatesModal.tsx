import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import ModalCloseButton from './ModalCloseButton';

export default function CarryingCostRatesModal({
  dealershipId,
  onClose,
}: {
  dealershipId: string;
  onClose: () => void;
}) {
  const [newRateInput, setNewRateInput] = useState('0');
  const [usedRateInput, setUsedRateInput] = useState('0');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase
      .from('dealerships')
      .select('new_carrying_cost_per_day, used_carrying_cost_per_day')
      .eq('id', dealershipId)
      .single()
      .then(({ data }) => {
        setNewRateInput(String(data?.new_carrying_cost_per_day ?? 0));
        setUsedRateInput(String(data?.used_carrying_cost_per_day ?? 0));
        setLoading(false);
      });
  }, [dealershipId]);

  async function handleSave() {
    const newRate = parseFloat(newRateInput);
    const usedRate = parseFloat(usedRateInput);
    if (isNaN(newRate) || isNaN(usedRate) || newRate < 0 || usedRate < 0) return;

    setSaving(true);
    await supabase
      .from('dealerships')
      .update({ new_carrying_cost_per_day: newRate, used_carrying_cost_per_day: usedRate })
      .eq('id', dealershipId);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="font-display text-lg font-semibold text-ink">Carrying Cost Rates</h2>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="p-5">
          {loading ? (
            <p className="text-steel text-sm">Loading…</p>
          ) : (
            <>
              <p className="text-xs text-steel mb-4">
                Per-day holding cost, separate for new vs. used — shown on every card and used across
                Analytics. Something you'd set once and barely touch, not a daily setting.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-medium text-ink mb-1">New ($/day)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newRateInput}
                    onChange={(e) => setNewRateInput(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-ink mb-1">Used ($/day)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={usedRateInput}
                    onChange={(e) => setUsedRateInput(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full bg-signal-blue text-white text-sm font-medium rounded-lg py-2.5 disabled:opacity-60"
              >
                {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save rates'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
