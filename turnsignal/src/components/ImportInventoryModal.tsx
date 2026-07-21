import { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { BoardConfig } from '../lib/boards';
import ModalCloseButton from './ModalCloseButton';
import AddVehicleModal from './AddVehicleModal';

type ParsedRow = {
  stock: string;
  type: string;
  year: number | null;
  make: string;
  model: string;
  trim: string;
  mileage: number | null;
  color: string;
  vin: string;
  state: string;
};

type DroppedRow = { id: string; vin: string; stock_number: string | null; year: number | null; make: string | null; model: string | null };

// Matched against actual column headers case-insensitively — tolerant of
// minor variations between exports rather than requiring an exact match,
// since the source is someone else's system, not ours.
const HEADER_ALIASES: Record<string, string[]> = {
  stock: ['stock', 'stock #', 'stock number'],
  type: ['type'],
  year: ['year'],
  make: ['make'],
  model: ['model'],
  trim: ['trim'],
  makeModelTrim: ['make | model | trim', 'make/model/trim', 'make model trim'],
  mileage: ['mileage', 'miles'],
  color: ['ext. color desc.', 'ext color desc', 'exterior color', 'color'],
  vin: ['vin'],
  state: ['state', 'status'],
};

function buildColumnMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const header of headers) {
    const normalized = header.trim().toLowerCase();
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[key]) continue;
      if (aliases.some((a) => normalized === a || normalized.includes(a))) {
        map[key] = header;
      }
    }
  }
  return map;
}

function splitMakeModelTrim(raw: string): { make: string; model: string; trim: string } {
  const pipeSplit = raw.split('|').map((s) => s.trim()).filter((s) => s !== '');
  if (pipeSplit.length > 1) {
    return { make: pipeSplit[0] ?? '', model: pipeSplit[1] ?? '', trim: pipeSplit[2] ?? '' };
  }
  // No pipe found — most likely one inconsistent record in an otherwise
  // well-formatted file, not a systemic problem. Can't reliably tell
  // where Model ends and Trim begins without a delimiter, but Make is
  // reliably just the first word for the common single-word brands this
  // is built around — better to get that one field right and leave the
  // rest for a quick manual fix than to dump everything into Make.
  const parts = raw.trim().split(/\s+/);
  return { make: parts[0] ?? '', model: parts.slice(1).join(' '), trim: '' };
}

export default function ImportInventoryModal({
  dealershipId,
  boards,
  onClose,
  onImported,
}: {
  dealershipId: string;
  boards: BoardConfig[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [phase, setPhase] = useState<'upload' | 'processing' | 'review-removed' | 'review-new' | 'done' | 'error'>('upload');
  const [error, setError] = useState<string | null>(null);
  const [liveCount, setLiveCount] = useState(0);
  const [droppedOff, setDroppedOff] = useState<DroppedRow[]>([]);
  const [droppedOffChecked, setDroppedOffChecked] = useState<Set<string>>(new Set());
  const [newArrivals, setNewArrivals] = useState<ParsedRow[]>([]);
  const [placingRow, setPlacingRow] = useState<ParsedRow | null>(null);

  async function handleFile(file: File) {
    setPhase('processing');
    setError(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      if (raw.length === 0) {
        setError('That file looks empty — no rows found.');
        setPhase('error');
        return;
      }

      const headers = Object.keys(raw[0]);
      const colMap = buildColumnMap(headers);
      if (!colMap.vin) {
        setError("Couldn't find a VIN column in this file. Check the export and try again.");
        setPhase('error');
        return;
      }

      const rows: ParsedRow[] = raw
        .map((r) => {
          // Separate Make/Model/Trim columns, when the file has them,
          // are unambiguous and always preferred — no guessing needed.
          // Falls back to splitting a combined column for files still
          // using that older format.
          const hasSeparateColumns = Boolean(colMap.make || colMap.model);
          const mmt = hasSeparateColumns
            ? {
                make: String(r[colMap.make] ?? '').trim(),
                model: String(r[colMap.model] ?? '').trim(),
                trim: String(r[colMap.trim] ?? '').trim(),
              }
            : splitMakeModelTrim(String(r[colMap.makeModelTrim] ?? ''));
          const yearRaw = r[colMap.year];
          const mileageRaw = r[colMap.mileage];
          return {
            stock: String(r[colMap.stock] ?? '').trim(),
            type: String(r[colMap.type] ?? '').trim(),
            year: yearRaw !== '' && yearRaw != null ? parseInt(String(yearRaw), 10) : null,
            make: mmt.make,
            model: mmt.model,
            trim: mmt.trim,
            mileage: mileageRaw !== '' && mileageRaw != null ? parseInt(String(mileageRaw), 10) : null,
            color: String(r[colMap.color] ?? '').trim(),
            vin: String(r[colMap.vin] ?? '').trim().toUpperCase(),
            state: String(r[colMap.state] ?? '').trim(),
          };
        })
        .filter((r) => r.vin);

      const liveRows = rows.filter((r) => r.state.toLowerCase().includes('live'));
      const otherRows = rows.filter((r) => !r.state.toLowerCase().includes('live'));

      if (liveRows.length > 0) {
        const { error: upsertError } = await supabase.from('live_inventory').upsert(
          liveRows.map((r) => ({
            dealership_id: dealershipId,
            stock_number: r.stock || null,
            vehicle_type: r.type || null,
            year: r.year,
            make: r.make || null,
            model: r.model || null,
            trim: r.trim || null,
            mileage: r.mileage,
            color: r.color || null,
            vin: r.vin,
            dms_state: r.state || null,
            imported_at: new Date().toISOString(),
            removed_at: null,
          })),
          { onConflict: 'dealership_id,vin' }
        );
        if (upsertError) {
          setError(upsertError.message);
          setPhase('error');
          return;
        }
      }
      setLiveCount(liveRows.length);

      const { data: existingLive } = await supabase
        .from('live_inventory')
        .select('id, vin, stock_number, year, make, model')
        .eq('dealership_id', dealershipId)
        .is('removed_at', null);
      const currentVins = new Set(liveRows.map((r) => r.vin));
      const dropped = (existingLive ?? []).filter((row) => !currentVins.has((row.vin ?? '').toUpperCase()));
      setDroppedOff(dropped);
      setDroppedOffChecked(new Set(dropped.map((d) => d.id)));

      const { data: existingVehicles } = await supabase.from('vehicles').select('vin').eq('dealership_id', dealershipId);
      const trackedVins = new Set((existingVehicles ?? []).map((v) => (v.vin ?? '').toUpperCase()).filter(Boolean));
      const arrivals = otherRows.filter((r) => !trackedVins.has(r.vin));
      setNewArrivals(arrivals);

      if (dropped.length > 0) {
        setPhase('review-removed');
      } else if (arrivals.length > 0) {
        setPhase('review-new');
      } else {
        setPhase('done');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.');
      setPhase('error');
    }
  }

  async function confirmRemovals() {
    const ids = Array.from(droppedOffChecked);
    if (ids.length > 0) {
      await supabase.from('live_inventory').update({ removed_at: new Date().toISOString() }).in('id', ids);
    }
    setPhase(newArrivals.length > 0 ? 'review-new' : 'done');
  }

  function skipRemovalReview() {
    setPhase(newArrivals.length > 0 ? 'review-new' : 'done');
  }

  function dismissArrival(vin: string) {
    setNewArrivals((prev) => prev.filter((r) => r.vin !== vin));
  }

  if (placingRow) {
    return (
      <AddVehicleModal
        dealershipId={dealershipId}
        boards={boards}
        prefill={{
          vin: placingRow.vin,
          year: placingRow.year ?? undefined,
          make: placingRow.make || undefined,
          model: placingRow.model || undefined,
          trim: placingRow.trim || undefined,
          color: placingRow.color || undefined,
          stockNumber: placingRow.stock || undefined,
          mileage: placingRow.mileage ?? undefined,
          isNew: placingRow.type.toLowerCase() === 'new',
        }}
        onClose={() => setPlacingRow(null)}
        onCreated={() => {
          dismissArrival(placingRow.vin);
          setPlacingRow(null);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md modal-h-85 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="font-display text-lg font-semibold text-ink">Import Inventory</h2>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {phase === 'upload' && (
            <div>
              <p className="text-sm text-steel mb-4">
                Upload your current inventory export (.xlsx). Vehicles marked "Live" go straight into Live
                Inventory — no carrying cost, no stages. Everything else gets checked against your board, and
                you'll be asked where to place anything genuinely new.
              </p>
              <label className="block w-full text-center bg-signal-blue text-white font-display font-semibold py-3 rounded-lg cursor-pointer">
                Choose File
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </label>
            </div>
          )}

          {phase === 'processing' && <p className="text-steel text-sm">Reading file…</p>}

          {phase === 'error' && (
            <div>
              <p className="text-signal-red text-sm mb-4">{error}</p>
              <button onClick={() => setPhase('upload')} className="text-signal-blue text-sm font-medium">
                Try a different file
              </button>
            </div>
          )}

          {phase === 'review-removed' && (
            <div>
              <p className="text-sm text-ink font-medium mb-1">
                {droppedOff.length} vehicle{droppedOff.length === 1 ? '' : 's'} on your last Live list aren't in
                this one.
              </p>
              <p className="text-xs text-steel mb-3">
                Usually means sold. Uncheck any that shouldn't be marked removed.
              </p>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 mb-4">
                {droppedOff.map((d) => (
                  <label key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={droppedOffChecked.has(d.id)}
                      onChange={(e) =>
                        setDroppedOffChecked((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(d.id);
                          else next.delete(d.id);
                          return next;
                        })
                      }
                      className="w-4 h-4"
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">
                        {d.stock_number ? `${d.stock_number}-` : ''}
                        {d.year ?? ''} {d.make} {d.model}
                      </p>
                      <p className="text-xs text-steel tabular">{d.vin}</p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={confirmRemovals}
                  className="flex-1 bg-signal-blue text-white font-display font-semibold py-2.5 rounded-lg text-sm"
                >
                  Confirm ({droppedOffChecked.size})
                </button>
                <button onClick={skipRemovalReview} className="text-steel text-sm font-medium px-3">
                  Skip
                </button>
              </div>
            </div>
          )}

          {phase === 'review-new' && (
            <div>
              <p className="text-sm text-ink font-medium mb-1">
                {newArrivals.length} vehicle{newArrivals.length === 1 ? '' : 's'} not yet on your board.
              </p>
              <p className="text-xs text-steel mb-3">Place each one, or skip — skipped ones can come in normally later.</p>
              <div className="space-y-2">
                {newArrivals.map((r) => (
                  <div key={r.vin} className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">
                        {r.stock ? `${r.stock}-` : ''}
                        {r.year ?? ''} {r.make} {r.model} {r.trim}
                      </p>
                      <p className="text-xs text-steel tabular">{r.vin}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => setPlacingRow(r)}
                        className="text-signal-blue text-xs font-semibold px-2 py-1"
                      >
                        Add
                      </button>
                      <button onClick={() => dismissArrival(r.vin)} className="text-steel text-xs font-medium px-2 py-1">
                        Skip
                      </button>
                    </div>
                  </div>
                ))}
                {newArrivals.length === 0 && (
                  <p className="text-steel text-sm">All placed.</p>
                )}
              </div>
              {newArrivals.length === 0 && (
                <button
                  onClick={() => setPhase('done')}
                  className="w-full mt-4 bg-signal-blue text-white font-display font-semibold py-2.5 rounded-lg text-sm"
                >
                  Done
                </button>
              )}
            </div>
          )}

          {phase === 'done' && (
            <div className="text-center py-6">
              <p className="text-4xl mb-3">✅</p>
              <p className="text-sm text-ink font-medium mb-1">Import complete.</p>
              <p className="text-xs text-steel mb-4">{liveCount} live inventory vehicles updated.</p>
              <button
                onClick={() => {
                  onImported();
                  onClose();
                }}
                className="bg-signal-blue text-white font-display font-semibold py-2.5 px-6 rounded-lg text-sm"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
