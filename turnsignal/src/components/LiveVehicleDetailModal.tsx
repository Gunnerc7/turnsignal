import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { StageHistoryRow, VehicleNote } from '../lib/types';
import { BoardConfig, getBoard } from '../lib/boards';
import { durationLabel, totalDaysLabel, formatTimestamp } from './StageTimelineModal';
import ModalCloseButton from './ModalCloseButton';

type LiveInventoryRow = {
  id: string;
  stock_number: string | null;
  vehicle_type: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  mileage: number | null;
  color: string | null;
  vin: string;
  dms_state: string | null;
  imported_at: string;
  removed_at: string | null;
  source_vehicle_id: string | null;
};

export default function LiveVehicleDetailModal({
  vehicle,
  boards,
  onClose,
}: {
  vehicle: LiveInventoryRow;
  boards: BoardConfig[];
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [historyRows, setHistoryRows] = useState<StageHistoryRow[]>([]);
  const [notes, setNotes] = useState<VehicleNote[]>([]);
  const [sourceBoard, setSourceBoard] = useState<string | null>(null);

  useEffect(() => {
    if (!vehicle.source_vehicle_id) {
      setLoading(false);
      return;
    }
    Promise.all([
      supabase
        .from('stage_history')
        .select('*')
        .eq('vehicle_id', vehicle.source_vehicle_id)
        .order('entered_at', { ascending: true }),
      supabase
        .from('vehicle_notes')
        .select('*')
        .eq('vehicle_id', vehicle.source_vehicle_id)
        .order('created_at', { ascending: false }),
      supabase.from('vehicles').select('board').eq('id', vehicle.source_vehicle_id).maybeSingle(),
    ]).then(([historyRes, notesRes, vehicleRes]) => {
      setHistoryRows(historyRes.data ?? []);
      setNotes(notesRes.data ?? []);
      setSourceBoard(vehicleRes.data?.board ?? null);
      setLoading(false);
    });
  }, [vehicle.source_vehicle_id]);

  const label = `${vehicle.stock_number ? vehicle.stock_number + '-' : ''}${vehicle.year ?? ''} ${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim();
  const boardConfig = sourceBoard ? getBoard(boards, sourceBoard) : null;
  const labelForStage = (stageKey: string) => boardConfig?.stages.find((s) => s.key === stageKey)?.label ?? stageKey;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md modal-h-85 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-ink truncate">{label}</h2>
            <p className="text-xs text-steel tabular">{vehicle.vin}</p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {vehicle.removed_at && (
            <div className="bg-signal-red/10 border border-signal-red/30 rounded-lg px-3 py-2">
              <p className="text-xs text-signal-red font-medium">
                Marked sold/removed on {new Date(vehicle.removed_at).toLocaleDateString()}. Kept here for reference —
                nothing about this vehicle has been deleted.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-asphalt rounded-lg p-3">
              <p className="text-[11px] text-steel uppercase tracking-wide">Mileage</p>
              <p className="text-sm font-medium text-ink tabular">
                {vehicle.mileage !== null ? vehicle.mileage.toLocaleString() : '—'}
              </p>
            </div>
            <div className="bg-asphalt rounded-lg p-3">
              <p className="text-[11px] text-steel uppercase tracking-wide">Color</p>
              <p className="text-sm font-medium text-ink">{vehicle.color ?? '—'}</p>
            </div>
          </div>

          {loading ? (
            <p className="text-steel text-sm">Loading history…</p>
          ) : !vehicle.source_vehicle_id ? (
            <div className="bg-asphalt rounded-lg p-4">
              <p className="text-sm text-ink font-medium mb-1">No TurnSignal history</p>
              <p className="text-xs text-steel leading-relaxed">
                This vehicle was added directly through a Live Inventory import rather than tracked through recon
                here, so there's no stage timeline or notes to show — just the details from the import itself.
              </p>
            </div>
          ) : (
            <>
              {historyRows.length > 0 && (
                <div>
                  <div className="bg-ink rounded-xl p-4 text-white mb-2">
                    <p className="text-xs text-mist uppercase tracking-wide mb-1">Total Time in TurnSignal</p>
                    <p className="font-display text-2xl font-bold">{totalDaysLabel(historyRows)}</p>
                  </div>
                  <div className="space-y-1.5">
                    {historyRows.map((row) => (
                      <div key={row.id} className="flex items-center justify-between bg-asphalt rounded-lg px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-ink">{labelForStage(row.stage)}</p>
                          <p className="text-[11px] text-steel tabular">
                            {formatTimestamp(row.entered_at)}
                            {row.exited_at ? ` – ${formatTimestamp(row.exited_at)}` : ' – now'}
                          </p>
                        </div>
                        <span className="tabular text-sm font-display font-semibold text-steel whitespace-nowrap">
                          {durationLabel(row.entered_at, row.exited_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-display font-semibold text-ink text-sm mb-2">Notes</h3>
                {notes.length === 0 ? (
                  <p className="text-steel text-sm">No notes on this vehicle.</p>
                ) : (
                  <div className="space-y-1.5">
                    {notes.map((n) => (
                      <div key={n.id} className="bg-asphalt rounded-lg px-3 py-2">
                        <p className="text-sm text-ink whitespace-pre-wrap">{n.content}</p>
                        <p className="text-[11px] text-steel mt-0.5">
                          {n.author_name ?? 'Someone'} ·{' '}
                          {new Date(n.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
