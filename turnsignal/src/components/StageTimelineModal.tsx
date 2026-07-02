import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { StageHistoryRow } from '../lib/types';
import { BoardConfig, getBoard } from '../lib/boards';
import ModalCloseButton from './ModalCloseButton';

function durationLabel(enteredAt: string, exitedAt: string | null): string {
  const start = new Date(enteredAt).getTime();
  const end = exitedAt ? new Date(exitedAt).getTime() : Date.now();
  const totalMinutes = Math.max(0, Math.round((end - start) / 60000));

  if (totalMinutes < 60) return `${totalMinutes} min`;

  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (totalHours < 24) {
    return remainingMinutes > 0 ? `${totalHours}h ${remainingMinutes}m` : `${totalHours}h`;
  }

  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days} day${days === 1 ? '' : 's'}`;
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

export default function StageTimelineModal({
  vehicleId,
  vehicleLabel,
  board,
  boards,
  onClose,
}: {
  vehicleId: string;
  vehicleLabel: string;
  board: string;
  boards: BoardConfig[];
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

  const boardConfig = getBoard(boards, board);
  const labelFor = (stageKey: string) =>
    boardConfig?.stages.find((s) => s.key === stageKey)?.label ?? stageKey;

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md modal-h-85 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">Timeline</h2>
            <p className="text-xs text-steel">{vehicleLabel}</p>
          </div>
          <ModalCloseButton onClick={onClose} />
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
                    {formatTimestamp(row.entered_at)}
                    {row.exited_at ? ` – ${formatTimestamp(row.exited_at)}` : ' – now'}
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
