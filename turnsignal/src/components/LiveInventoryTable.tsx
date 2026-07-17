import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

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
};

export default function LiveInventoryTable({
  dealershipId,
  refreshKey,
  onImportClick,
}: {
  dealershipId: string;
  refreshKey?: number;
  onImportClick: () => void;
}) {
  const [rows, setRows] = useState<LiveInventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('live_inventory')
      .select('*')
      .eq('dealership_id', dealershipId)
      .is('removed_at', null)
      .order('stock_number', { ascending: true });
    setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealershipId, refreshKey]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) =>
        [r.stock_number, r.vin, r.make, r.model, r.trim, r.color]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(q))
      )
    : rows;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="p-4 border-b border-gray-200 flex items-center gap-2">
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
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display font-semibold text-ink text-sm truncate">
                    {r.stock_number ? `${r.stock_number}-` : ''}
                    {r.year ?? ''} {r.make} {r.model} {r.trim}
                  </p>
                  {r.vehicle_type && (
                    <span className="flex-shrink-0 text-[11px] font-medium text-steel bg-asphalt rounded-full px-2 py-0.5">
                      {r.vehicle_type}
                    </span>
                  )}
                </div>
                <p className="text-xs text-steel mt-0.5 tabular">
                  {r.mileage !== null ? `${r.mileage.toLocaleString()} mi` : ''}
                  {r.mileage !== null && r.color ? ' · ' : ''}
                  {r.color ?? ''}
                  {(r.mileage !== null || r.color) && ' · '}
                  {r.vin}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
