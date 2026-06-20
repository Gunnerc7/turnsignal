import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { StageHistoryRow } from '../lib/types';
import { getBoard } from '../lib/boards';

function durationLabel(enteredAt: string, exitedAt: string | null): string {
  const start = new Date(enteredAt).getTime();
  const end = exitedAt ? new Date(exitedAt).getTime() : Date.now();
  const days = Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  if (days === 0) return 'Less than a day';
  return days === 1 ? '1 day' : `${days} days`;
}

export default function StageTimelineModal({
  vehicleId,
  vehicleLabel,
  board,
  onClose,
}: {
  vehicleId: string;
  vehicleLabel: string;
  board: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<StageHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('stage_history')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('entered_at', { ascending: true })
      .then(({ data }) => {
        setRows(data ?? []);
        setLoading(false);
      });
  }, [vehicleId]);

  const boardConfig = getBoard(board);
  const labelFor = (stageKey: string) =>
    boardConfig.stages.find((s) => s.key === stageKey)?.label ?? stageKey;

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">Timeline</h2>
            <p className="text-xs text-steel">{vehicleLabel}</p>
          </div>
          <button onClick={onClose} className="text-steel text-sm py-2">
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <p className="text-steel text-sm">Loading timeline…</p>
          ) : rows.length === 0 ? (
            <p className="text-steel text-sm">No history yet.</p>
          ) : (
            rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between bg-asphalt rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-ink">{labelFor(row.stage)}</p>
                  <p className="text-[11px] text-steel tabular">
                    {new Date(row.entered_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    {row.exited_at
                      ? ` – ${new Date(row.exited_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}`
                      : ' – now'}
                  </p>
                </div>
                <span className="tabular text-sm font-display font-semibold text-steel whitespace-nowrap">
                  {durationLabel(row.entered_at, row.exited_at)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
