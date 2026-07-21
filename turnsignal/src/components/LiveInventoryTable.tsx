import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BoardConfig } from '../lib/boards';
import LiveVehicleDetailModal from './LiveVehicleDetailModal';

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

export default function LiveInventoryTable({
  dealershipId,
  boards,
  refreshKey,
  onImportClick,
}: {
  dealershipId: string;
  boards: BoardConfig[];
  refreshKey?: number;
  onImportClick: () => void;
}) {
  const [rows, setRows] = useState<LiveInventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showSold, setShowSold] = useState(false);
  const [selected, setSelected] = useState<LiveInventoryRow | null>(null);

  async function load() {
    setLoading(true);
    // Everything is fetched once, sold included — filtering which of it
    // to display happens client-side below. A dealership's live
    // inventory is small enough that this is simpler and faster than a
    // second round trip every time the toggle changes.
    const { data } = await supabase
      .from('live_inventory')
      .select('*')
      .eq('dealership_id', dealershipId)
      .order('stock_number', { ascending: true });
    setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealershipId, refreshKey]);

  const visibleRows = showSold ? rows : rows.filter((r) => !r.removed_at);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? visibleRows.filter((r) =>
        [r.stock_number, r.vin, r.make, r.model, r.trim, r.color]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(q))
      )
    : visibleRows;

  const soldCount = rows.filter((r) => r.removed_at).length;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="p-4 border-b border-gray-200 space-y-2">
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stock #, VIN, make, model…"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-base"
          />
          <button
            onClick={onImportClick}
            className="flex-shrink-0 bg-signal-blue text-white font-display font-semibold text-sm px-4 py-2.5 rounded-lg whitespace-nowrap"
          >
            Import
          </button>
        </div>
        {soldCount > 0 && (
          <button
            onClick={() => setShowSold((s) => !s)}
            className="text-xs text-signal-blue font-medium"
          >
            {showSold ? 'Hide sold vehicles' : `Show sold vehicles (${soldCount})`}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="text-steel text-sm p-4">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-steel text-sm mb-3">
              No live inventory yet. Import your current inventory export to get started.
            </p>
            <button
              onClick={onImportClick}
              className="bg-signal-blue text-white font-display font-semibold text-sm px-5 py-2.5 rounded-lg"
            >
              Import Inventory
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-steel text-sm p-4">No matches for "{search}".</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((r) => (
              <button key={r.id} onClick={() => setSelected(r)} className="w-full text-left px-4 py-3 hover:bg-asphalt">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display font-semibold text-ink text-sm truncate">
                    {r.stock_number ? `${r.stock_number}-` : ''}
                    {r.year ?? ''} {r.make} {r.model} {r.trim}
                  </p>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {r.removed_at && (
                      <span className="text-[11px] font-medium text-signal-red bg-signal-red/10 rounded-full px-2 py-0.5">
                        Sold
                      </span>
                    )}
                    {r.vehicle_type && (
                      <span className="text-[11px] font-medium text-steel bg-asphalt rounded-full px-2 py-0.5">
                        {r.vehicle_type}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-steel mt-0.5 tabular">
                  {r.mileage !== null ? `${r.mileage.toLocaleString()} mi` : ''}
                  {r.mileage !== null && r.color ? ' · ' : ''}
                  {r.color ?? ''}
                  {(r.mileage !== null || r.color) && ' · '}
                  {r.vin}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && <LiveVehicleDetailModal vehicle={selected} boards={boards} onClose={() => setSelected(null)} />}
    </div>
  );
}
