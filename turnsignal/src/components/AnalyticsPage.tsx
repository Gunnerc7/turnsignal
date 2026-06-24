import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BoardConfig, fetchBoards } from '../lib/boards';

// ── Data layer ───────────────────────────────────────────────────────────
// Fetching and stats computation are kept fully separate from rendering
// below, and `stats` is one flat object — that's deliberate so a future
// chart component (recharts is the natural fit) can consume the exact same
// shape without touching how it's calculated.

type RangeKey = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
  { key: 'custom', label: 'Custom' },
];

function getRangeBounds(
  range: RangeKey,
  customStart: string,
  customEnd: string
): { start: Date | null; end: Date } {
  const now = new Date();

  if (range === 'custom') {
    const start = customStart ? new Date(`${customStart}T00:00:00`) : null;
    const end = customEnd ? new Date(`${customEnd}T23:59:59`) : now;
    return { start, end };
  }

  const start = new Date(now);
  if (range === 'today') start.setHours(0, 0, 0, 0);
  if (range === 'week') start.setDate(start.getDate() - 7);
  if (range === 'month') start.setDate(start.getDate() - 30);
  if (range === 'quarter') start.setDate(start.getDate() - 91);
  if (range === 'year') start.setFullYear(start.getFullYear() - 1);

  return { start, end: now };
}

function formatDays(days: number | null): string {
  if (days === null) return '—';
  if (days < 1) return '<1 day';
  return `${days.toFixed(1)} days`;
}

type VehicleRow = {
  id: string;
  board: string;
  stage: string;
  stage_entered_at: string;
  recon_started_at: string | null;
  completed: boolean;
  has_damage: boolean;
  loaner_return_date: string | null;
  created_at: string;
  stock_number: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
};

type HistoryRow = {
  vehicle_id: string;
  board: string;
  stage: string;
  entered_at: string;
  exited_at: string | null;
};

function vehicleLabel(v: VehicleRow): string {
  return `${v.stock_number ? v.stock_number + '-' : ''}${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.trim();
}

export default function AnalyticsPage({
  dealershipId,
  dealershipName,
  onClose,
}: {
  dealershipId: string;
  dealershipName: string;
  onClose: () => void;
}) {
  const [boards, setBoards] = useState<BoardConfig[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const { start: rangeStart, end: rangeEnd } = getRangeBounds(range, customStart, customEnd);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      const boardsData = await fetchBoards(dealershipId);

      const { data: vehiclesData } = await supabase
        .from('vehicles')
        .select(
          'id, board, stage, stage_entered_at, recon_started_at, completed, has_damage, loaner_return_date, created_at, stock_number, year, make, model'
        )
        .eq('dealership_id', dealershipId);

      const vehicleIds = (vehiclesData ?? []).map((v) => v.id);

      let historyData: HistoryRow[] = [];
      if (vehicleIds.length > 0) {
        let query = supabase
          .from('stage_history')
          .select('vehicle_id, board, stage, entered_at, exited_at')
          .in('vehicle_id', vehicleIds)
          .lte('entered_at', rangeEnd.toISOString());
        if (rangeStart) query = query.gte('entered_at', rangeStart.toISOString());
        const { data } = await query;
        historyData = data ?? [];
      }

      if (!cancelled) {
        setBoards(boardsData);
        setVehicles(vehiclesData ?? []);
        setHistory(historyData);
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealershipId, range, customStart, customEnd]);

  const stats = useMemo(() => {
    const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

    // Current count by stage — always "right now," a snapshot, not range-filtered.
    const currentCounts = new Map<string, number>();
    vehicles.forEach((v) => {
      const key = `${v.board}::${v.stage}`;
      currentCounts.set(key, (currentCounts.get(key) ?? 0) + 1);
    });

    // Completed stays within the selected range, grouped by stage.
    const stageDurations = new Map<string, number[]>();
    history.forEach((row) => {
      if (!row.exited_at) return;
      const key = `${row.board}::${row.stage}`;
      const days = (new Date(row.exited_at).getTime() - new Date(row.entered_at).getTime()) / 86400000;
      const arr = stageDurations.get(key) ?? [];
      arr.push(days);
      stageDurations.set(key, arr);
    });

    function avgDaysFor(boardKey: string, stageKey: string): number | null {
      const arr = stageDurations.get(`${boardKey}::${stageKey}`);
      if (!arr || arr.length === 0) return null;
      return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    // Bottleneck — whichever stage has the highest average duration.
    const bottleneck =
      Array.from(stageDurations.entries())
        .map(([key, arr]) => {
          const [board, stage] = key.split('::');
          const avgDays = arr.reduce((a, b) => a + b, 0) / arr.length;
          return { board, stage, avgDays };
        })
        .sort((a, b) => b.avgDays - a.avgDays)[0] ?? null;

    // Turn time: Inbound → Price for Lot, for vehicles that reached it in range.
    const turnTimes: number[] = [];
    history.forEach((row) => {
      if (row.stage !== 'price_for_lot') return;
      const vehicle = vehicleById.get(row.vehicle_id);
      if (!vehicle?.recon_started_at) return;
      const days =
        (new Date(row.entered_at).getTime() - new Date(vehicle.recon_started_at).getTime()) / 86400000;
      turnTimes.push(days);
    });
    const avgTurnTime = turnTimes.length ? turnTimes.reduce((a, b) => a + b, 0) / turnTimes.length : null;
    const fastestTurn = turnTimes.length ? Math.min(...turnTimes) : null;
    const slowestTurn = turnTimes.length ? Math.max(...turnTimes) : null;

    // Longest-aging vehicle still active (not completed) right now.
    const longestAging =
      vehicles
        .filter((v) => !v.completed)
        .map((v) => {
          const anchor = v.recon_started_at ?? v.stage_entered_at;
          const days = (Date.now() - new Date(anchor).getTime()) / 86400000;
          return { label: vehicleLabel(v), days };
        })
        .sort((a, b) => b.days - a.days)[0] ?? null;

    const damagedCount = vehicles.filter((v) => v.has_damage).length;
    const overdueLoaners = vehicles.filter(
      (v) => v.loaner_return_date && new Date(v.loaner_return_date) < new Date()
    ).length;
    const mainBoardActive = vehicles.filter((v) => v.board === 'main' && !v.completed).length;

    return {
      currentCounts,
      avgDaysFor,
      bottleneck,
      avgTurnTime,
      fastestTurn,
      slowestTurn,
      completedInRange: turnTimes.length,
      longestAging,
      damagedCount,
      overdueLoaners,
      mainBoardActive,
    };
  }, [vehicles, history]);

  function bottleneckLabel(): string {
    if (!stats.bottleneck) return '—';
    const board = boards.find((b) => b.key === stats.bottleneck!.board);
    const stage = board?.stages.find((s) => s.key === stats.bottleneck!.stage);
    return stage?.label ?? stats.bottleneck.stage;
  }

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3.5 bg-ink text-white flex-shrink-0">
        <div>
          <p className="text-[11px] text-steel uppercase tracking-wider leading-none">Analytics</p>
          <h1 className="font-display text-lg font-semibold leading-tight">{dealershipName}</h1>
        </div>
        <button onClick={onClose} className="text-sm text-steel hover:text-white py-2">
          Close
        </button>
      </div>

      <div className="flex-shrink-0 bg-asphalt border-b border-gray-200">
        <div className="flex gap-1.5 overflow-x-auto px-4 py-2.5">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setRange(opt.key)}
              className={`font-display px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                range === opt.key ? 'bg-signal-blue text-white' : 'text-steel bg-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="flex gap-2 px-4 pb-3">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="flex-1 text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white"
            />
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="flex-1 text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white"
            />
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-steel text-sm p-4">Loading…</p>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div className="bg-ink rounded-xl p-5 text-white">
            <p className="text-xs text-steel uppercase tracking-wide mb-1">Avg. Inbound → Price for Lot</p>
            <p className="font-display text-3xl font-bold">{formatDays(stats.avgTurnTime)}</p>
            <div className="flex gap-4 mt-2 text-xs text-steel">
              <span>Fastest: {formatDays(stats.fastestTurn)}</span>
              <span>Slowest: {formatDays(stats.slowestTurn)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-asphalt rounded-lg p-3">
              <p className="text-2xl font-display font-bold text-ink tabular">{stats.mainBoardActive}</p>
              <p className="text-xs text-steel">Active on Main Board</p>
            </div>
            <div className="bg-asphalt rounded-lg p-3">
              <p className="text-2xl font-display font-bold text-ink tabular">{stats.completedInRange}</p>
              <p className="text-xs text-steel">Completed in this period</p>
            </div>
            <div className="bg-asphalt rounded-lg p-3">
              <p
                className={`text-2xl font-display font-bold tabular ${stats.damagedCount > 0 ? 'text-signal-red' : 'text-ink'}`}
              >
                {stats.damagedCount}
              </p>
              <p className="text-xs text-steel">Flagged with damage</p>
            </div>
            <div className="bg-asphalt rounded-lg p-3">
              <p
                className={`text-2xl font-display font-bold tabular ${stats.overdueLoaners > 0 ? 'text-signal-red' : 'text-ink'}`}
              >
                {stats.overdueLoaners}
              </p>
              <p className="text-xs text-steel">Loaners overdue</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border border-signal-amber rounded-lg p-3">
              <p className="text-[11px] uppercase tracking-wide text-steel mb-1">Bottleneck stage</p>
              <p className="font-display font-semibold text-ink">{bottleneckLabel()}</p>
              <p className="text-xs text-steel tabular">{formatDays(stats.bottleneck?.avgDays ?? null)} average</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-3">
              <p className="text-[11px] uppercase tracking-wide text-steel mb-1">Longest aging, active now</p>
              <p className="font-display font-semibold text-ink truncate">
                {stats.longestAging?.label || 'None'}
              </p>
              <p className="text-xs text-steel tabular">
                {stats.longestAging ? formatDays(stats.longestAging.days) : '—'}
              </p>
            </div>
          </div>

          {boards.map((board) => (
            <div key={board.id}>
              <h2 className="font-display font-semibold text-ink text-sm mb-2">{board.label}</h2>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="grid grid-cols-3 bg-asphalt text-[11px] uppercase tracking-wide text-steel px-3 py-2">
                  <span>Stage</span>
                  <span className="text-center">Now</span>
                  <span className="text-right">Avg. time</span>
                </div>
                {board.stages.map((stage) => (
                  <div
                    key={stage.key}
                    className="grid grid-cols-3 px-3 py-2 border-t border-gray-100 text-sm items-center"
                  >
                    <span className="text-ink">{stage.label}</span>
                    <span className="text-center tabular text-steel">
                      {stats.currentCounts.get(`${board.key}::${stage.key}`) ?? 0}
                    </span>
                    <span className="text-right tabular text-steel">
                      {formatDays(stats.avgDaysFor(board.key, stage.key))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
