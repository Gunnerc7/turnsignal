import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { StageHistoryRow } from '../lib/types';
import { BoardConfig, getBoard } from '../lib/boards';
import ModalCloseButton from './ModalCloseButton';

export function durationLabel(enteredAt: string, exitedAt: string | null): string {
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

// Same unit the rest of the app already uses for "days" everywhere else
// (tabular, one decimal) — total is just the sum of every row shown
// below it, so it can never quietly disagree with the detail list.
export function totalDaysLabel(rows: StageHistoryRow[]): string {
  const totalMs = rows.reduce((sum, row) => {
    const start = new Date(row.entered_at).getTime();
    const end = row.exited_at ? new Date(row.exited_at).getTime() : Date.now();
    return sum + Math.max(0, end - start);
  }, 0);
  const days = totalMs / 86400000;
  return `${days.toFixed(1)} day${Math.abs(days - 1) < 0.05 ? '' : 's'}`;
}

export function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

// datetime-local inputs both display and submit in local time with no
// timezone suffix — this helper just moves between that format and the
// ISO strings the database stores, without touching UTC conversion by hand.
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function StageTimelineModal({
  vehicleId,
  vehicleLabel,
  board,
  boards,
  isOwner,
  isManager,
  onClose,
  onHistoryChanged,
}: {
  vehicleId: string;
  vehicleLabel: string;
  board: string;
  boards: BoardConfig[];
  isOwner: boolean;
  isManager: boolean;
  onClose: () => void;
  onHistoryChanged?: () => void;
}) {
  const { session, userName } = useAuth();
  const canEdit = isOwner || isManager;
  const [rows, setRows] = useState<StageHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasManualEdits, setHasManualEdits] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editEnteredAt, setEditEnteredAt] = useState('');
  const [editExitedAt, setEditExitedAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadRows() {
    setLoading(true);
    const [{ data }, { count }] = await Promise.all([
      supabase.from('stage_history').select('*').eq('vehicle_id', vehicleId).order('entered_at', { ascending: true }),
      supabase
        .from('stage_history_edits')
        .select('id', { count: 'exact', head: true })
        .eq('vehicle_id', vehicleId),
    ]);
    setRows(data ?? []);
    setHasManualEdits((count ?? 0) > 0);
    setLoading(false);
  }

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

  const boardConfig = getBoard(boards, board);
  const labelFor = (stageKey: string) =>
    boardConfig?.stages.find((s) => s.key === stageKey)?.label ?? stageKey;

  function startEdit(row: StageHistoryRow) {
    setError(null);
    setEditingRowId(row.id);
    setEditEnteredAt(toDatetimeLocal(row.entered_at));
    setEditExitedAt(row.exited_at ? toDatetimeLocal(row.exited_at) : '');
  }

  // Deliberately can never block the real edit/delete below it — the
  // audit log is a secondary record, and a failure writing it (say, the
  // migration for this table hasn't been run yet) shouldn't be able to
  // silently stop the actual action the person is waiting on.
  async function logEdit(
    row: StageHistoryRow,
    action: 'edit' | 'delete',
    newEnteredAt: string | null,
    newExitedAt: string | null
  ) {
    try {
      const { error } = await supabase.from('stage_history_edits').insert({
        vehicle_id: vehicleId,
        stage_history_id: row.id,
        edited_by_id: session?.user.id ?? null,
        edited_by_name: userName,
        action,
        stage: row.stage,
        original_entered_at: row.entered_at,
        original_exited_at: row.exited_at,
        new_entered_at: newEnteredAt,
        new_exited_at: newExitedAt,
      });
      if (error) console.error('Failed to write history audit log:', error.message);
    } catch (err) {
      console.error('Failed to write history audit log:', err);
    }
  }

  // recon_started_at is what actually drives the carrying-cost clock for
  // new vehicles — it's set the moment a vehicle first leaves Inbound,
  // but it's a separate field on the vehicle itself, not something
  // deleting or editing a history row touches automatically. Without
  // this, deleting an erroneous "moved to the wrong stage" entry removes
  // the history row but leaves the clock it started running regardless —
  // exactly the case where a vehicle briefly, incorrectly touched
  // Service and got moved right back. This recomputes it from whatever
  // history genuinely remains: the earliest non-Inbound entry, or null
  // if the vehicle's real corrected history never actually left Inbound.
  async function recalculateReconStartedAt() {
    const { data } = await supabase
      .from('stage_history')
      .select('entered_at')
      .eq('vehicle_id', vehicleId)
      .neq('stage', 'inbound_trade_in')
      .order('entered_at', { ascending: true })
      .limit(1);
    const correctReconStartedAt = data && data.length > 0 ? data[0].entered_at : null;
    await supabase.from('vehicles').update({ recon_started_at: correctReconStartedAt }).eq('id', vehicleId);
  }

  async function handleSaveEdit(row: StageHistoryRow) {
    setError(null);
    const newEnteredAt = new Date(editEnteredAt).toISOString();
    const isOpenRow = !row.exited_at;
    const newExitedAt = isOpenRow ? null : new Date(editExitedAt).toISOString();

    if (newExitedAt && new Date(newExitedAt) <= new Date(newEnteredAt)) {
      setError('Exit time has to be after entry time.');
      return;
    }

    setSaving(true);
    await logEdit(row, 'edit', newEnteredAt, newExitedAt);
    const { error: updateError } = await supabase
      .from('stage_history')
      .update({ entered_at: newEnteredAt, exited_at: newExitedAt })
      .eq('id', row.id);

    // The currently-open row's entered_at is also what drives the live
    // aging badge on the card itself — keeping them in sync means the
    // card and this timeline can never quietly disagree.
    if (!updateError && isOpenRow) {
      await supabase.from('vehicles').update({ stage_entered_at: newEnteredAt }).eq('id', vehicleId);
    }
    if (!updateError) {
      await recalculateReconStartedAt();
    }

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setEditingRowId(null);
    await loadRows();
    onHistoryChanged?.();
  }

  async function handleDelete(row: StageHistoryRow) {
    if (!row.exited_at) {
      setError("The current stage can't be deleted — move the vehicle first, or edit its entry time instead.");
      return;
    }
    const confirmed = window.confirm(
      `Delete this ${labelFor(row.stage)} entry (${durationLabel(row.entered_at, row.exited_at)})? This can't be undone, and won't automatically adjust the entries around it.`
    );
    if (!confirmed) return;

    setSaving(true);
    await logEdit(row, 'delete', null, null);
    const { error: deleteError } = await supabase.from('stage_history').delete().eq('id', row.id);
    if (!deleteError) {
      await recalculateReconStartedAt();
    }
    setSaving(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    await loadRows();
    onHistoryChanged?.();
  }

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
            <>
              <div className="bg-ink rounded-xl p-4 text-white mb-1">
                <p className="text-xs text-mist uppercase tracking-wide mb-1">Total Time in TurnSignal</p>
                <p className="font-display text-2xl font-bold">{totalDaysLabel(rows)}</p>
              </div>

              {hasManualEdits && (
                <p className="text-[11px] text-signal-amber font-medium mb-2">🔸 History manually adjusted.</p>
              )}

              {error && <p className="text-signal-red text-xs mb-2">{error}</p>}

              {rows.map((row, index) => (
                <div key={row.id} className="bg-asphalt rounded-lg px-3 py-2">
                  {editingRowId === row.id ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-ink">{labelFor(row.stage)}</p>
                      <div>
                        <label className="block text-[11px] text-steel mb-0.5">Entered</label>
                        <input
                          type="datetime-local"
                          value={editEnteredAt}
                          onChange={(e) => setEditEnteredAt(e.target.value)}
                          className="w-full text-sm border border-gray-300 rounded-md py-1.5 px-2 bg-white"
                        />
                      </div>
                      {row.exited_at && (
                        <div>
                          <label className="block text-[11px] text-steel mb-0.5">Exited</label>
                          <input
                            type="datetime-local"
                            value={editExitedAt}
                            onChange={(e) => setEditExitedAt(e.target.value)}
                            className="w-full text-sm border border-gray-300 rounded-md py-1.5 px-2 bg-white"
                          />
                        </div>
                      )}
                      <div className="flex gap-3 pt-1">
                        <button
                          onClick={() => handleSaveEdit(row)}
                          disabled={saving}
                          className="text-signal-blue text-xs font-semibold disabled:opacity-50"
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => setEditingRowId(null)} className="text-steel text-xs font-medium">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{labelFor(row.stage)}</p>
                        <p className="text-[11px] text-steel tabular">
                          {formatTimestamp(row.entered_at)}
                          {row.exited_at ? ` – ${formatTimestamp(row.exited_at)}` : ' – now'}
                        </p>
                        {row.moved_by_name && (
                          <p className="text-[11px] text-steel">
                            {index === 0 ? 'Added' : 'Moved'} by {row.moved_by_name}
                          </p>
                        )}
                        {canEdit && (
                          <div className="flex gap-3 mt-1">
                            <button onClick={() => startEdit(row)} className="text-[11px] text-signal-blue font-medium">
                              Edit
                            </button>
                            {row.exited_at && (
                              <button
                                onClick={() => handleDelete(row)}
                                disabled={saving}
                                className="text-[11px] text-signal-red font-medium disabled:opacity-50"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="tabular text-sm font-display font-semibold text-steel whitespace-nowrap flex-shrink-0">
                        {durationLabel(row.entered_at, row.exited_at)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
