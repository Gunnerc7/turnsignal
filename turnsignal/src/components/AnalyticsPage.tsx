import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BoardConfig, fetchBoards } from '../lib/boards';
import { isAgingRed } from '../lib/aging';
import { carryingCostSoFar } from '../lib/dates';

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
  is_new: boolean;
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
  const [yellowDays, setYellowDays] = useState(3);
  const [redDays, setRedDays] = useState(5);
  const [newRatePerDay, setNewRatePerDay] = useState(0);
  const [usedRatePerDay, setUsedRatePerDay] = useState(0);
  const [newRateInput, setNewRateInput] = useState('0');
  const [usedRateInput, setUsedRateInput] = useState('0');
  const [savingRates, setSavingRates] = useState(false);
  const [showRateSettings, setShowRateSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      const boardsData = await fetchBoards(dealershipId);

      const { data: dealershipData } = await supabase
        .from('dealerships')
        .select('yellow_threshold_days, red_threshold_days, new_carrying_cost_per_day, used_carrying_cost_per_day')
        .eq('id', dealershipId)
        .single();

      const { data: vehiclesData } = await supabase
        .from('vehicles')
        .select(
          'id, board, stage, stage_entered_at, recon_started_at, completed, has_damage, is_new, loaner_return_date, created_at, stock_number, year, make, model'
        )
        .eq('dealership_id', dealershipId);

      const vehicleIds = (vehiclesData ?? []).map((v) => v.id);

      // Fetched in full, unfiltered by date — a vehicle's Service entry can
      // predate the selected window even when its Price for Lot completion
      // falls inside it, so date filtering happens client-side below instead.
      let historyData: HistoryRow[] = [];
      if (vehicleIds.length > 0) {
        const { data } = await supabase
          .from('stage_history')
          .select('vehicle_id, board, stage, entered_at, exited_at')
          .in('vehicle_id', vehicleIds);
        historyData = data ?? [];
      }

      if (!cancelled) {
        setBoards(boardsData);
        setVehicles(vehiclesData ?? []);
        setHistory(historyData);
        setYellowDays(dealershipData?.yellow_threshold_days ?? 3);
        setRedDays(dealershipData?.red_threshold_days ?? 5);
        const fetchedNewRate = dealershipData?.new_carrying_cost_per_day ?? 0;
        const fetchedUsedRate = dealershipData?.used_carrying_cost_per_day ?? 0;
        setNewRatePerDay(fetchedNewRate);
        setUsedRatePerDay(fetchedUsedRate);
        setNewRateInput(String(fetchedNewRate));
        setUsedRateInput(String(fetchedUsedRate));
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [dealershipId]);

  async function handleSaveRates() {
    const newRate = parseFloat(newRateInput);
    const usedRate = parseFloat(usedRateInput);
    if (isNaN(newRate) || isNaN(usedRate) || newRate < 0 || usedRate < 0) return;

    setSavingRates(true);
    await supabase
      .from('dealerships')
      .update({ new_carrying_cost_per_day: newRate, used_carrying_cost_per_day: usedRate })
      .eq('id', dealershipId);
    setSavingRates(false);
    setNewRatePerDay(newRate);
    setUsedRatePerDay(usedRate);
  }

  const stats = useMemo(() => {
    const { start: rangeStart, end: rangeEnd } = getRangeBounds(range, customStart, customEnd);
    const inRange = (dateStr: string) => {
      const d = new Date(dateStr);
      if (rangeStart && d < rangeStart) return false;
      return d <= rangeEnd;
    };

    // Current count by stage — always "right now," a snapshot, not range-filtered.
    const currentCounts = new Map<string, number>();
    vehicles.forEach((v) => {
      const key = `${v.board}::${v.stage}`;
      currentCounts.set(key, (currentCounts.get(key) ?? 0) + 1);
    });

    // Completed stays within the selected range, grouped by stage.
    const stageDurations = new Map<string, number[]>();
    history.forEach((row) => {
      if (!row.exited_at || !inRange(row.entered_at)) return;
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

    // Bottleneck — NOT just average historical duration. This sums up how
    // many days are currently "stuck" in each stage right now: a stage with
    // one vehicle that's been sitting for a week shows up the same as a
    // stage with seven vehicles that have each been there a day — both are
    // "7 vehicle-days of backlog." A stage with lots of vehicles that are
    // all moving through quickly does NOT count as a bottleneck by this
    // measure, even though its raw count is high. Inbound is excluded,
    // same reasoning as the aging colors — that wait isn't on the dealership.
    // Restricted to the Main Board only — Loaners and similar boards have
    // naturally long stays (e.g. ~30 days for a service loaner) that aren't
    // a recon bottleneck, just how that board normally works.
    const currentBacklog = new Map<string, { count: number; totalDays: number }>();
    vehicles.forEach((v) => {
      if (v.completed || v.stage === 'inbound_trade_in' || v.board !== 'main') return;
      const key = `${v.board}::${v.stage}`;
      const days = (Date.now() - new Date(v.stage_entered_at).getTime()) / 86400000;
      const entry = currentBacklog.get(key) ?? { count: 0, totalDays: 0 };
      entry.count += 1;
      entry.totalDays += days;
      currentBacklog.set(key, entry);
    });

    const bottleneck =
      Array.from(currentBacklog.entries())
        .map(([key, { count, totalDays }]) => {
          const [board, stage] = key.split('::');
          return { board, stage, count, totalDays };
        })
        .sort((a, b) => b.totalDays - a.totalDays)[0] ?? null;

    // Turn Rate: Service → Price for Lot. Inbound time is excluded on
    // purpose — that's largely a pickup/transit wait, not something the
    // team controls, so it shouldn't count toward this number.
    // A vehicle's Service entry can predate the selected window even when
    // its Price for Lot completion falls inside it, so we look up the
    // Service entry from the full unfiltered history, but only count a
    // completion if it actually happened within the selected period.
    const serviceEnteredByVehicle = new Map<string, Date>();
    history.forEach((row) => {
      if (row.stage !== 'service') return;
      const entered = new Date(row.entered_at);
      const existing = serviceEnteredByVehicle.get(row.vehicle_id);
      if (!existing || entered < existing) {
        serviceEnteredByVehicle.set(row.vehicle_id, entered);
      }
    });

    const turnTimes: number[] = [];
    history.forEach((row) => {
      if (row.stage !== 'price_for_lot' || !inRange(row.entered_at)) return;
      const serviceEntered = serviceEnteredByVehicle.get(row.vehicle_id);
      if (!serviceEntered) return;
      const days = (new Date(row.entered_at).getTime() - serviceEntered.getTime()) / 86400000;
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

    // Total carrying cost currently accrued across active inventory —
    // a live number now that real rates exist, not a placeholder.
    const totalCarryingCost = vehicles
      .filter((v) => !v.completed)
      .reduce((sum, v) => sum + carryingCostSoFar(v.created_at, v.is_new, newRatePerDay, usedRatePerDay), 0);

    // Currently aging red right now — a count, distinct from "longest
    // aging" which only shows the single worst case. Loaners are excluded
    // here automatically too, since isAgingRed treats that board as
    // never color-coded.
    const agingRedCount = vehicles.filter((v) => {
      if (v.completed) return false;
      const anchor = v.recon_started_at ?? v.stage_entered_at;
      const days = (Date.now() - new Date(anchor).getTime()) / 86400000;
      return isAgingRed(v.board, v.stage, days, yellowDays, redDays);
    }).length;

    const addedInRange = vehicles.filter((v) => inRange(v.created_at)).length;

    return {
      currentCounts,
      avgDaysFor,
      bottleneck,
      avgTurnTime,
      fastestTurn,
      slowestTurn,
      completedInRange: turnTimes.length,
      addedInRange,
      longestAging,
      damagedCount,
      overdueLoaners,
      mainBoardActive,
      agingRedCount,
      totalCarryingCost,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, history, yellowDays, redDays, newRatePerDay, usedRatePerDay, range, customStart, customEnd]);

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
          <p className="text-[11px] text-mist uppercase tracking-wider leading-none">Analytics</p>
          <h1 className="font-display text-lg font-semibold leading-tight">{dealershipName}</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRateSettings((s) => !s)}
            className="text-xs text-mist hover:text-white py-2 whitespace-nowrap"
          >
            💰 Rates
          </button>
          <button onClick={onClose} className="text-sm text-mist hover:text-white py-2">
            Close
          </button>
        </div>
      </div>

      {showRateSettings && (
        <div className="flex-shrink-0 bg-asphalt border-b border-gray-200 px-4 py-3">
          <p className="text-xs text-steel mb-2">
            Per-day holding cost, separate for new vs used — shown on every card. Something you'd set once and
            barely touch, not a daily setting.
          </p>
          <div className="grid grid-cols-2 gap-3 mb-2">
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
            onClick={handleSaveRates}
            disabled={savingRates}
            className="w-full bg-signal-blue text-white text-sm font-medium rounded-lg py-2 disabled:opacity-60"
          >
            {savingRates ? 'Saving…' : 'Save rates'}
          </button>
        </div>
      )}

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
            <p className="text-xs text-mist uppercase tracking-wide mb-1">Turn Rate (Service → Price for Lot)</p>
            <p className="font-display text-3xl font-bold">{formatDays(stats.avgTurnTime)}</p>
            <div className="flex gap-4 mt-2 text-xs text-mist">
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
              <p className="text-2xl font-display font-bold text-ink tabular">{stats.addedInRange}</p>
              <p className="text-xs text-steel">Added in this period</p>
            </div>
            <div className="bg-asphalt rounded-lg p-3">
              <p className="text-2xl font-display font-bold text-ink tabular">{stats.completedInRange}</p>
              <p className="text-xs text-steel">Completed in this period</p>
            </div>
            <div className="bg-asphalt rounded-lg p-3">
              <p
                className={`text-2xl font-display font-bold tabular ${stats.agingRedCount > 0 ? 'text-signal-red' : 'text-ink'}`}
              >
                {stats.agingRedCount}
              </p>
              <p className="text-xs text-steel">Aging red right now</p>
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

          <div className="bg-asphalt rounded-lg p-3">
            <p className="text-2xl font-display font-bold text-ink tabular">
              ${stats.totalCarryingCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-steel">Total carrying cost across active inventory right now</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border border-signal-amber rounded-lg p-3">
              <p className="text-[11px] uppercase tracking-wide text-steel mb-1">Bottleneck stage</p>
              <p className="font-display font-semibold text-ink">{bottleneckLabel()}</p>
              <p className="text-xs text-steel tabular">
                {stats.bottleneck
                  ? `${stats.bottleneck.count} vehicle${stats.bottleneck.count === 1 ? '' : 's'} waiting · ${formatDays(stats.bottleneck.totalDays)} combined`
                  : '—'}
              </p>
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
