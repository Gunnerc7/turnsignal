import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BoardConfig, fetchBoards } from '../lib/boards';
import { isAgingRed } from '../lib/aging';
import { carryingCostSoFar } from '../lib/dates';
import { computePriorityScores, vehicleShortLabel } from '../lib/priorityScoring';

// ── Data layer ───────────────────────────────────────────────────────────
// Fetching and stats computation are kept fully separate from rendering
// below, and `stats` is one flat object — that's deliberate so a future
// chart component (recharts is the natural fit) can consume the exact same
// shape without touching how it's calculated.

type RangeKey = 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
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

  if (range === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }

  if (range === 'yesterday') {
    const start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  const start = new Date(now);
  if (range === 'week') start.setDate(start.getDate() - 7);
  if (range === 'month') start.setDate(start.getDate() - 30);
  if (range === 'quarter') start.setDate(start.getDate() - 91);
  if (range === 'year') start.setFullYear(start.getFullYear() - 1);

  return { start, end: now };
}

// The immediately preceding period of the exact same length as whatever's
// currently selected — e.g. if the current range is the last 7 days, this
// is the 7 days before that. Works generically for every range type since
// it just shifts the already-computed current bounds back by their own
// duration, rather than re-deriving per-range-type logic.
function getPreviousRangeBounds(currentStart: Date | null, currentEnd: Date): { start: Date; end: Date } | null {
  if (!currentStart) return null;
  const durationMs = currentEnd.getTime() - currentStart.getTime();
  const previousEnd = new Date(currentStart.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - durationMs);
  return { start: previousStart, end: previousEnd };
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
  completed_at: string | null;
  has_damage: boolean;
  is_new: boolean;
  title_status: 'has_title' | 'poa' | 'waiting' | null;
  loaner_return_date: string | null;
  created_at: string;
  stock_number: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  completed_by_name: string | null;
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

function locationLabelForRow(v: { board: string; stage: string }, boards: BoardConfig[]): string {
  const b = boards.find((bd) => bd.key === v.board);
  const s = b?.stages.find((st) => st.key === v.stage);
  return b ? `${b.label}${s ? ` · ${s.label}` : ''}` : v.board;
}

export default function AnalyticsPage({
  dealershipId,
  dealershipName,
  onClose,
  onNavigateToVehicle,
}: {
  dealershipId: string;
  dealershipName: string;
  onClose: () => void;
  onNavigateToVehicle?: (vehicleId: string, board: string) => void;
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
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<RangeKey>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const load = useCallback(
    async (isInitial: boolean) => {
      if (isInitial) setLoading(true);
      else setRefreshing(true);

      const boardsData = await fetchBoards(dealershipId);

      const { data: dealershipData } = await supabase
        .from('dealerships')
        .select('yellow_threshold_days, red_threshold_days, new_carrying_cost_per_day, used_carrying_cost_per_day')
        .eq('id', dealershipId)
        .single();

      const { data: vehiclesData } = await supabase
        .from('vehicles')
        .select(
          'id, board, stage, stage_entered_at, recon_started_at, completed, completed_at, has_damage, is_new, title_status, loaner_return_date, created_at, stock_number, year, make, model, completed_by_name'
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
      setRefreshing(false);
    },
    [dealershipId]
  );

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealershipId]);

  // Pulling fresh data again whenever the selected range tab changes (not
  // on every custom-date keystroke, just the tab itself) — this is what
  // actually fixes the "feels stale" complaint: a range switch is treated
  // as a deliberate request to look at current reality, not just a
  // recompute against whatever happened to be loaded when the page opened.
  useEffect(() => {
    if (!loading) load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

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

    // Bottleneck — whichever Main Board stage has taken the longest on
    // average to get through, across completed stays in the selected
    // period. This is the same number as the "Avg. time" column in the
    // table below, just surfaced as its own callout. Inbound is excluded,
    // same reasoning as the aging colors — that wait isn't on the
    // dealership. Restricted to Main Board only — Loaners and similar
    // boards have naturally long stays (e.g. ~30 days for a service
    // loaner) that aren't a recon bottleneck, just how that board
    // normally works.
    const bottleneck =
      Array.from(stageDurations.entries())
        .map(([key, arr]) => {
          const [board, stage] = key.split('::');
          const avgDays = arr.reduce((a, b) => a + b, 0) / arr.length;
          return { board, stage, avgDays };
        })
        .filter((entry) => entry.board === 'main' && entry.stage !== 'inbound_trade_in')
        .sort((a, b) => b.avgDays - a.avgDays)[0] ?? null;

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

    // The end anchor is the moment it's actually marked complete while in
    // Price for Lot — not just the moment it arrived there. A vehicle can
    // sit in that column a while (photos, pricing, approval) before recon
    // work is genuinely finished, so completion is the truer finish line.
    const turnTimes: number[] = [];
    vehicles.forEach((v) => {
      if (v.stage !== 'price_for_lot' || !v.completed || !v.completed_at) return;
      if (!inRange(v.completed_at)) return;
      const serviceEntered = serviceEnteredByVehicle.get(v.id);
      if (!serviceEntered) return;
      const days = (new Date(v.completed_at).getTime() - serviceEntered.getTime()) / 86400000;
      turnTimes.push(days);
    });
    const avgTurnTime = turnTimes.length ? turnTimes.reduce((a, b) => a + b, 0) / turnTimes.length : null;
    const fastestTurn = turnTimes.length ? Math.min(...turnTimes) : null;
    const slowestTurn = turnTimes.length ? Math.max(...turnTimes) : null;

    // Same Turn Rate calculation, run again against the immediately
    // preceding period of equal length — this is what powers the trend
    // arrow in the Executive Summary ("1.2 days faster than last period").
    // Reuses the exact same serviceEnteredByVehicle map above; only the
    // date window being checked against changes.
    const previousBounds = getPreviousRangeBounds(rangeStart, rangeEnd);
    let previousAvgTurnTime: number | null = null;
    if (previousBounds) {
      const previousTurnTimes: number[] = [];
      vehicles.forEach((v) => {
        if (v.stage !== 'price_for_lot' || !v.completed || !v.completed_at) return;
        const completedAt = new Date(v.completed_at);
        if (completedAt < previousBounds.start || completedAt > previousBounds.end) return;
        const serviceEntered = serviceEnteredByVehicle.get(v.id);
        if (!serviceEntered) return;
        previousTurnTimes.push((completedAt.getTime() - serviceEntered.getTime()) / 86400000);
      });
      if (previousTurnTimes.length > 0) {
        previousAvgTurnTime = previousTurnTimes.reduce((a, b) => a + b, 0) / previousTurnTimes.length;
      }
    }

    // Longest-aging vehicle still active (not completed) right now.
    // Loaners is excluded — those vehicles are already on the lot, out
    // with a customer or manager, not stuck in recon, same reasoning as
    // every other aging calculation on this page. Inbound is excluded for
    // the same reason it always is: that wait is transit time, not
    // something the dealership controls.
    const longestAging =
      vehicles
        .filter((v) => !v.completed && v.board !== 'loaners' && v.stage !== 'inbound_trade_in')
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
      .reduce((sum, v) => sum + carryingCostSoFar(v, newRatePerDay, usedRatePerDay), 0);

    // Average carrying cost, split by new vs used — same underlying
    // per-vehicle numbers behind totalCarryingCost above, just grouped so
    // a manager can see whether new or used inventory is the bigger cost
    // driver, rather than only a single blended total.
    let newCostSum = 0, newCostCount = 0, usedCostSum = 0, usedCostCount = 0;
    vehicles
      .filter((v) => !v.completed)
      .forEach((v) => {
        const cost = carryingCostSoFar(v, newRatePerDay, usedRatePerDay);
        // Matches the same exception carryingCostSoFar itself applies —
        // a Loaners-board vehicle still waiting on title genuinely has a
        // real carrying cost and shouldn't be skipped from the average.
        if (v.board === 'loaners' && v.title_status !== 'waiting') return;
        if (v.is_new) { newCostSum += cost; newCostCount += 1; }
        else { usedCostSum += cost; usedCostCount += 1; }
      });
    const avgNewCarryingCost = newCostCount > 0 ? newCostSum / newCostCount : null;
    const avgUsedCarryingCost = usedCostCount > 0 ? usedCostSum / usedCostCount : null;

    // Average transit time: Inbound/Trade-In → Service. Reuses the exact
    // same serviceEnteredByVehicle map Turn Rate already builds above —
    // this is the other half of the same handoff, just measuring the
    // leg before Turn Rate's clock starts rather than after. Filtered by
    // when the vehicle actually reached Service, same pattern as Turn
    // Rate filtering on completion date.
    const inboundEnteredByVehicle = new Map<string, Date>();
    history.forEach((row) => {
      if (row.stage !== 'inbound_trade_in') return;
      const entered = new Date(row.entered_at);
      const existing = inboundEnteredByVehicle.get(row.vehicle_id);
      if (!existing || entered < existing) {
        inboundEnteredByVehicle.set(row.vehicle_id, entered);
      }
    });
    const transitTimes: number[] = [];
    serviceEnteredByVehicle.forEach((serviceEntered, vehicleId) => {
      if (!inRange(serviceEntered.toISOString())) return;
      const inboundEntered = inboundEnteredByVehicle.get(vehicleId);
      if (!inboundEntered) return;
      const days = (serviceEntered.getTime() - inboundEntered.getTime()) / 86400000;
      if (days >= 0) transitTimes.push(days);
    });
    const avgTransitTime = transitTimes.length ? transitTimes.reduce((a, b) => a + b, 0) / transitTimes.length : null;

    // Carrying cost specifically accrued DURING the selected period —
    // different question from the live total above ("what's it costing
    // us right now") versus this one ("what did holding inventory cost us
    // this week/month"). Computed as the overlap between each vehicle's
    // accrual window and the selected date range, so a vehicle that's
    // been sitting since before the period only counts the portion of
    // time that actually fell inside it.
    const periodCarryingCost = vehicles
      .filter((v) => v.board !== 'loaners' || v.title_status === 'waiting')
      .reduce((sum, v) => {
        const startDate = v.is_new ? v.recon_started_at : v.created_at;
        if (!startDate) return sum;
        const accrualStart = new Date(startDate);
        const accrualEnd = v.completed && v.completed_at ? new Date(v.completed_at) : new Date();
        const overlapStart = rangeStart && rangeStart > accrualStart ? rangeStart : accrualStart;
        const overlapEnd = rangeEnd < accrualEnd ? rangeEnd : accrualEnd;
        const overlapDays = Math.max(0, (overlapEnd.getTime() - overlapStart.getTime()) / 86400000);
        const rate = v.is_new ? newRatePerDay : usedRatePerDay;
        return sum + overlapDays * rate;
      }, 0);

    // Currently aging red right now — a count, distinct from "longest
    // aging" which only shows the single worst case. Loaners are excluded
    // here automatically too, since isAgingRed treats that board as
    // never color-coded.
    const agingRedVehicles = vehicles
      .filter((v) => {
        if (v.completed) return false;
        const anchor = v.recon_started_at ?? v.stage_entered_at;
        const days = (Date.now() - new Date(anchor).getTime()) / 86400000;
        return isAgingRed(v.board, v.stage, days, yellowDays, redDays);
      })
      .map((v) => {
        const anchor = v.recon_started_at ?? v.stage_entered_at;
        const days = (Date.now() - new Date(anchor).getTime()) / 86400000;
        return { vehicle: v, days };
      })
      .sort((a, b) => b.days - a.days);
    const agingRedCount = agingRedVehicles.length;

    // Full detail behind the Needs Attention panel — same underlying
    // vehicles as agingRedCount above, just carrying what's needed to
    // display and navigate to each one instead of only a number.
    const needsAttention = agingRedVehicles.map(({ vehicle: v, days }) => ({
      id: v.id,
      board: v.board,
      label: vehicleLabel(v),
      days,
    }));

    const addedInRange = vehicles.filter((v) => inRange(v.created_at)).length;

    // ── Priority Scores + Today's Priorities ──────────────────────────
    // Rule-based, fully explainable — see lib/priorityScoring.ts for the
    // exact point math. Spans every active vehicle on every board, not
    // just Main Board, since a loaner overdue on the Loaners board is
    // just as real a priority as one stuck in Service.
    const priorityResults = computePriorityScores(
      vehicles.filter((v) => !v.completed),
      yellowDays,
      redDays,
      newRatePerDay,
      usedRatePerDay
    );
    const todaysPriorities = priorityResults.filter((r) => r.score > 0).slice(0, 5);

    // ── Stage Health Dashboard ──────────────────────────────────────────
    // One health score per Main Board stage, 0-100, where higher is
    // healthier. Starts at 100 and only ever loses points for real,
    // named reasons — never a fabricated baseline.
    const mainBoard = boards.find((b) => b.key === 'main');
    const previousStageDurations = new Map<string, number[]>();
    if (previousBounds) {
      history.forEach((row) => {
        if (!row.exited_at) return;
        const entered = new Date(row.entered_at);
        if (entered < previousBounds.start || entered > previousBounds.end) return;
        const key = `${row.board}::${row.stage}`;
        const days = (new Date(row.exited_at).getTime() - entered.getTime()) / 86400000;
        const arr = previousStageDurations.get(key) ?? [];
        arr.push(days);
        previousStageDurations.set(key, arr);
      });
    }

    const stageHealth = (mainBoard?.stages ?? [])
      .filter((s) => s.key !== 'inbound_trade_in')
      .map((s) => {
        const key = `main::${s.key}`;
        const currentAvg = avgDaysFor('main', s.key);
        const waitingCount = currentCounts.get(key) ?? 0;
        const exceedingCount = vehicles.filter((v) => {
          if (v.completed || v.board !== 'main' || v.stage !== s.key) return false;
          const days = (Date.now() - new Date(v.stage_entered_at).getTime()) / 86400000;
          return days > redDays;
        }).length;

        const prevArr = previousStageDurations.get(key);
        const previousAvg = prevArr && prevArr.length > 0 ? prevArr.reduce((a, b) => a + b, 0) / prevArr.length : null;

        let health = 100;
        const reasons: string[] = [];

        if (currentAvg !== null) {
          const excessDays = Math.max(0, currentAvg - redDays);
          if (excessDays > 0) {
            const deduction = Math.min(40, Math.round(excessDays * 6));
            health -= deduction;
            reasons.push(`averaging ${excessDays.toFixed(1)} days over target`);
          }
        }
        if (exceedingCount > 0) {
          const deduction = Math.min(30, exceedingCount * 8);
          health -= deduction;
          reasons.push(`${exceedingCount} vehicle${exceedingCount === 1 ? '' : 's'} currently over target`);
        }
        if (previousAvg !== null && currentAvg !== null) {
          const trendDelta = previousAvg - currentAvg; // positive = improved (faster)
          if (trendDelta > 0.1) {
            health = Math.min(100, health + Math.min(10, Math.round(trendDelta * 4)));
          } else if (trendDelta < -0.1) {
            health -= Math.min(20, Math.round(Math.abs(trendDelta) * 4));
            reasons.push('slower than the previous period');
          }
        }
        health = Math.max(0, Math.min(100, Math.round(health)));

        const indicator: 'green' | 'yellow' | 'red' = health >= 70 ? 'green' : health >= 40 ? 'yellow' : 'red';
        const recommendation =
          reasons.length === 0
            ? `${s.label} is operating efficiently.`
            : `${s.label} is currently ${indicator === 'red' ? 'the slowest department' : 'running behind'} — ${reasons.join(', ')}. Consider prioritizing vehicles waiting in ${s.label}.`;

        return {
          key: s.key,
          label: s.label,
          health,
          indicator,
          avgDays: currentAvg,
          waitingCount,
          exceedingCount,
          recommendation,
        };
      });

    // ── Lost Money Dashboard extras ─────────────────────────────────────
    // Carrying cost avoided (or added) vs. the immediately preceding
    // period, plus a plain narrative sentence. No gross profit estimate —
    // only known rate data already configured for this dealership.
    let previousPeriodCarryingCost: number | null = null;
    if (previousBounds) {
      previousPeriodCarryingCost = vehicles
        .filter((v) => v.board !== 'loaners' || v.title_status === 'waiting')
        .reduce((sum, v) => {
          const startDate = v.is_new ? v.recon_started_at : v.created_at;
          if (!startDate) return sum;
          const accrualStart = new Date(startDate);
          const accrualEnd = v.completed && v.completed_at ? new Date(v.completed_at) : new Date();
          const overlapStart = previousBounds.start > accrualStart ? previousBounds.start : accrualStart;
          const overlapEnd = previousBounds.end < accrualEnd ? previousBounds.end : accrualEnd;
          const overlapDays = Math.max(0, (overlapEnd.getTime() - overlapStart.getTime()) / 86400000);
          const rate = v.is_new ? newRatePerDay : usedRatePerDay;
          return sum + overlapDays * rate;
        }, 0);
    }
    const carryingCostChangeVsPrevious =
      previousPeriodCarryingCost !== null ? periodCarryingCost - previousPeriodCarryingCost : null;

    // A blended per-day rate across current active inventory — powers the
    // "every additional day costs about $X" narrative sentence.
    const activeNewCount = vehicles.filter((v) => !v.completed && v.is_new && v.board !== 'loaners').length;
    const activeUsedCount = vehicles.filter((v) => !v.completed && !v.is_new && v.board !== 'loaners').length;
    const blendedDailyRate =
      activeNewCount + activeUsedCount > 0
        ? (activeNewCount * newRatePerDay + activeUsedCount * usedRatePerDay) / (activeNewCount + activeUsedCount)
        : null;

    // ── Dealership Performance Score ────────────────────────────────────
    // Five categories, 20 points each, no letter grade — just the number
    // and exactly where each category's points came from. A category with
    // no real data yet is left out of both the score and the max possible,
    // rather than guessed at or defaulted to a misleading value.
    const categories: { label: string; points: number; max: number; detail: string }[] = [];

    if (previousAvgTurnTime !== null && avgTurnTime !== null) {
      const delta = previousAvgTurnTime - avgTurnTime;
      const pts = delta > 0.1 ? 20 : delta < -0.1 ? 8 : 14;
      categories.push({
        label: 'Turn Rate',
        points: pts,
        max: 20,
        detail: delta > 0.1 ? 'improving vs. previous period' : delta < -0.1 ? 'slower vs. previous period' : 'steady vs. previous period',
      });
    }

    if (mainBoardActive > 0 || agingRedCount > 0) {
      const ratio = agingRedCount / Math.max(1, mainBoardActive);
      const pts = Math.round(20 * (1 - Math.min(1, ratio)));
      categories.push({
        label: 'Vehicle Aging',
        points: pts,
        max: 20,
        detail: `${agingRedCount} of ${mainBoardActive} active vehicles are past the aging target`,
      });
    }

    if (stageHealth.length > 0) {
      const avgHealth = stageHealth.reduce((a, b) => a + b.health, 0) / stageHealth.length;
      categories.push({
        label: 'Stage Efficiency',
        points: Math.round((avgHealth / 100) * 20),
        max: 20,
        detail: `average stage health is ${Math.round(avgHealth)}/100`,
      });
    }

    if (addedInRange > 0 || turnTimes.length > 0) {
      const ratio = turnTimes.length / Math.max(1, addedInRange);
      categories.push({
        label: 'Completion Rate',
        points: Math.min(20, Math.round(ratio * 20)),
        max: 20,
        detail: `${turnTimes.length} completed vs. ${addedInRange} added this period`,
      });
    }

    if (carryingCostChangeVsPrevious !== null) {
      const pts = carryingCostChangeVsPrevious <= 0 ? 20 : carryingCostChangeVsPrevious < periodCarryingCost * 0.15 ? 12 : 6;
      categories.push({
        label: 'Carrying Cost',
        points: pts,
        max: 20,
        detail:
          carryingCostChangeVsPrevious <= 0
            ? `down $${Math.abs(carryingCostChangeVsPrevious).toLocaleString(undefined, { maximumFractionDigits: 0 })} vs. the previous period`
            : `up $${carryingCostChangeVsPrevious.toLocaleString(undefined, { maximumFractionDigits: 0 })} vs. the previous period`,
      });
    }

    const dealershipScore =
      categories.length > 0
        ? Math.round((categories.reduce((sum, c) => sum + c.points, 0) / categories.reduce((sum, c) => sum + c.max, 0)) * 100)
        : null;

    // ── Recommendations Engine ──────────────────────────────────────────
    // Predefined conditions only — every recommendation names the exact
    // data that triggered it, right in the sentence itself.
    const recommendations: { emoji: string; text: string }[] = [];

    stageHealth.forEach((s) => {
      if (s.indicator === 'red') {
        recommendations.push({
          emoji: '🔴',
          text: `${s.label} average exceeds target (${formatDays(s.avgDays)} vs. a ${redDays}-day target) — consider reallocating attention there.`,
        });
      } else if (s.indicator === 'green' && s.avgDays !== null) {
        recommendations.push({ emoji: '🟢', text: `${s.label} is operating efficiently, averaging ${formatDays(s.avgDays)}.` });
      }
    });

    if (agingRedCount > 0 && previousAvgTurnTime !== null && avgTurnTime !== null && previousAvgTurnTime - avgTurnTime > 0.1) {
      recommendations.push({ emoji: '🟢', text: 'Aging inventory is improving compared to the previous period.' });
    }

    const waitingOnTitleCount = vehicles.filter((v) => !v.completed && v.title_status === 'waiting').length;
    if (waitingOnTitleCount > 0) {
      recommendations.push({
        emoji: '🟡',
        text: `${waitingOnTitleCount} vehicle${waitingOnTitleCount === 1 ? ' is' : 's are'} waiting on title — follow up on paperwork to avoid further delay.`,
      });
    }

    if (carryingCostChangeVsPrevious !== null && carryingCostChangeVsPrevious > 0) {
      recommendations.push({
        emoji: '🔴',
        text: `Carrying cost increased by $${carryingCostChangeVsPrevious.toLocaleString(undefined, { maximumFractionDigits: 0 })} compared to the previous period.`,
      });
    }

    // Damage rate as a share of total inventory — more useful for
    // tracking a trend over time than the raw count alone.
    const damageRate = vehicles.length > 0 ? (damagedCount / vehicles.length) * 100 : null;

    // Who's actually getting cars through, this period — a simple
    // completions leaderboard. Deliberately just a count, not a claimed
    // "performance" score: clicking complete isn't always exactly the
    // same person who did every bit of the work, so this answers "who's
    // closing out the most cars," not a stricter productivity claim.
    const completionsByPerson = new Map<string, number>();
    vehicles.forEach((v) => {
      if (!v.completed || !v.completed_at || !inRange(v.completed_at)) return;
      const name = v.completed_by_name ?? 'Unknown';
      completionsByPerson.set(name, (completionsByPerson.get(name) ?? 0) + 1);
    });
    const topPerformers = Array.from(completionsByPerson.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      currentCounts,
      avgDaysFor,
      bottleneck,
      avgTurnTime,
      previousAvgTurnTime,
      fastestTurn,
      slowestTurn,
      completedInRange: turnTimes.length,
      addedInRange,
      longestAging,
      damagedCount,
      damageRate,
      overdueLoaners,
      mainBoardActive,
      agingRedCount,
      needsAttention,
      totalCarryingCost,
      periodCarryingCost,
      previousPeriodCarryingCost,
      carryingCostChangeVsPrevious,
      blendedDailyRate,
      avgNewCarryingCost,
      avgUsedCarryingCost,
      avgTransitTime,
      topPerformers,
      todaysPriorities,
      stageHealth,
      dealershipScore,
      scoreCategories: categories,
      recommendations,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, history, boards, yellowDays, redDays, newRatePerDay, usedRatePerDay, range, customStart, customEnd]);

  function handleExportPDF() {
    const rangeLabel = RANGE_OPTIONS.find((r) => r.key === range)?.label ?? range;
    const now = new Date().toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });

    const stageRows = boards
      .flatMap((board) =>
        board.stages.map((stage) => {
          const count = stats.currentCounts.get(`${board.key}::${stage.key}`) ?? 0;
          const avg = stats.avgDaysFor(board.key, stage.key);
          return `<tr>
            <td style="padding:6px 10px;border-top:1px solid #e5e7eb;">${board.label} — ${stage.label}</td>
            <td style="padding:6px 10px;border-top:1px solid #e5e7eb;text-align:center;">${count}</td>
            <td style="padding:6px 10px;border-top:1px solid #e5e7eb;text-align:right;">${avg !== null ? avg.toFixed(1) + ' days' : '—'}</td>
          </tr>`;
        })
      )
      .join('');

    const performerRows = stats.topPerformers
      .map((p) => `<tr><td style="padding:5px 10px;border-top:1px solid #e5e7eb;">${p.name}</td><td style="padding:5px 10px;border-top:1px solid #e5e7eb;text-align:right;">${p.count}</td></tr>`)
      .join('');

    const summaryRows = buildExecutiveSummary()
      .map((s) => `<div class="summary-row"><span>${s.emoji}</span><span>${s.text}</span></div>`)
      .join('');

    const needsAttentionRows = stats.needsAttention
      .map((v) => `<tr><td style="padding:5px 10px;border-top:1px solid #e5e7eb;">${v.label}</td><td style="padding:5px 10px;border-top:1px solid #e5e7eb;text-align:right;color:#E5483D;">${v.days.toFixed(1)} days</td></tr>`)
      .join('');

    const html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"/>
<title>TurnSignal Analytics — ${dealershipName}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 32px 40px; color: #14171F; font-size: 13px; }
  h1 { font-size: 22px; font-weight: 700; margin: 0 0 2px; }
  .sub { color: #3A4150; margin: 0 0 24px; font-size: 12px; }
  .hero { background: #14171F; color: white; border-radius: 10px; padding: 18px 20px; margin-bottom: 20px; }
  .hero-num { font-size: 32px; font-weight: 700; margin: 4px 0; }
  .hero-sub { font-size: 11px; color: #B8BFCC; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .stat { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; }
  .stat-num { font-size: 24px; font-weight: 700; }
  .stat-label { font-size: 11px; color: #3A4150; margin-top: 2px; }
  .red { color: #E5483D; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #3A4150; padding: 6px 10px; background: #f3f4f6; }
  th:not(:first-child) { text-align: right; }
  h2 { font-size: 13px; font-weight: 600; margin: 20px 0 6px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .callout { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; }
  .callout-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #3A4150; margin-bottom: 4px; }
  .summary-box { border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 20px; overflow: hidden; }
  .summary-row { display: flex; gap: 8px; padding: 8px 12px; border-top: 1px solid #e5e7eb; font-size: 12px; }
  .summary-row:first-child { border-top: none; }
  @page { margin: 16mm 14mm; }
</style>
</head><body>
<h1>${dealershipName}</h1>
<p class="sub">Analytics · ${rangeLabel} · Exported ${now}</p>

<h2 style="margin-top:0;">Executive Summary</h2>
<div class="summary-box">${summaryRows}</div>

${stats.needsAttention.length > 0 ? `
<h2>Needs Attention (${stats.needsAttention.length})</h2>
<table>
  <thead><tr><th>Vehicle</th><th style="text-align:right;">Days over threshold</th></tr></thead>
  <tbody>${needsAttentionRows}</tbody>
</table>` : ''}

<div class="hero">
  <div class="hero-sub">TURN RATE (SERVICE → PRICE FOR LOT)</div>
  <div class="hero-num">${formatDays(stats.avgTurnTime)}</div>
  <div class="hero-sub">Fastest: ${formatDays(stats.fastestTurn)} &nbsp;&nbsp; Slowest: ${formatDays(stats.slowestTurn)}</div>
  <div class="hero-sub" style="margin-top:8px;">AVG. TRANSIT TIME (INBOUND → SERVICE): ${formatDays(stats.avgTransitTime)}</div>
</div>

<div class="grid">
  <div class="stat"><div class="stat-num">${stats.mainBoardActive}</div><div class="stat-label">Active on Main Board</div></div>
  <div class="stat"><div class="stat-num">${stats.addedInRange}</div><div class="stat-label">Added this period</div></div>
  <div class="stat"><div class="stat-num">${stats.completedInRange}</div><div class="stat-label">Completed this period</div></div>
  <div class="stat"><div class="stat-num${stats.agingRedCount > 0 ? ' red' : ''}">${stats.agingRedCount}</div><div class="stat-label">Aging red right now</div></div>
  <div class="stat"><div class="stat-num${stats.damagedCount > 0 ? ' red' : ''}">${stats.damagedCount}${stats.damageRate !== null ? ` <span style="font-size:14px;font-weight:400;">(${stats.damageRate.toFixed(0)}%)</span>` : ''}</div><div class="stat-label">Flagged with damage</div></div>
  <div class="stat"><div class="stat-num${stats.overdueLoaners > 0 ? ' red' : ''}">${stats.overdueLoaners}</div><div class="stat-label">Loaners overdue</div></div>
</div>

<div class="two">
  <div class="stat"><div class="stat-num">$${stats.totalCarryingCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div><div class="stat-label">Total carrying cost right now</div></div>
  <div class="stat"><div class="stat-num">$${stats.periodCarryingCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div><div class="stat-label">Carrying cost this period</div></div>
</div>

<div class="two">
  <div class="stat"><div class="stat-num">${stats.avgNewCarryingCost !== null ? '$' + stats.avgNewCarryingCost.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</div><div class="stat-label">Avg. cost — new vehicles</div></div>
  <div class="stat"><div class="stat-num">${stats.avgUsedCarryingCost !== null ? '$' + stats.avgUsedCarryingCost.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</div><div class="stat-label">Avg. cost — used vehicles</div></div>
</div>

<div class="two">
  <div class="callout"><div class="callout-label">Bottleneck stage</div><div style="font-weight:600;">${bottleneckLabel()}</div><div style="font-size:11px;color:#3A4150;">${stats.bottleneck ? formatDays(stats.bottleneck.avgDays) + ' average' : '—'}</div></div>
  <div class="callout"><div class="callout-label">Longest aging, active now</div><div style="font-weight:600;">${stats.longestAging?.label || 'None'}</div><div style="font-size:11px;color:#3A4150;">${stats.longestAging ? formatDays(stats.longestAging.days) : '—'}</div></div>
</div>

<h2>Stage breakdown</h2>
<table>
  <thead><tr><th>Stage</th><th style="text-align:center;">Now</th><th style="text-align:right;">Avg. time</th></tr></thead>
  <tbody>${stageRows}</tbody>
</table>

${stats.topPerformers.length > 0 ? `
<h2>Completions this period</h2>
<table>
  <thead><tr><th>Person</th><th style="text-align:right;">Completed</th></tr></thead>
  <tbody>${performerRows}</tbody>
</table>` : ''}

<p style="font-size:10px;color:#9ca3af;margin-top:32px;">Generated by TurnSignal</p>
</body></html>`;

    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) {
      alert('Allow pop-ups for this site to export PDF.');
      return;
    }
    win.document.write(html);
    win.document.close();
    // Brief delay so fonts/styles render before the print dialog opens
    setTimeout(() => { win.print(); }, 350);
  }

  function bottleneckLabel(): string {
    if (!stats.bottleneck) return '—';
    const board = boards.find((b) => b.key === stats.bottleneck!.board);
    const stage = board?.stages.find((s) => s.key === stats.bottleneck!.stage);
    return stage?.label ?? stats.bottleneck.stage;
  }

  // Turns the same numbers already computed above into short, plain-
  // language bullets — deliberately built from the exact stats already on
  // this page (nothing new is calculated here except the trend math),
  // so the summary can never quietly disagree with the detailed cards
  // below it.
  type Insight = { emoji: string; text: string };

  function buildExecutiveSummary(): Insight[] {
    const insights: Insight[] = [];

    // Turn rate + trend vs. the immediately preceding period of equal length.
    if (stats.avgTurnTime === null) {
      insights.push({ emoji: '🟡', text: 'No vehicles completed Price for Lot in this period yet.' });
    } else if (stats.previousAvgTurnTime === null) {
      insights.push({
        emoji: '🟡',
        text: `Turn rate is averaging ${stats.avgTurnTime.toFixed(1)} days. Not enough history yet to show a trend.`,
      });
    } else {
      const delta = stats.previousAvgTurnTime - stats.avgTurnTime; // positive = current period is faster
      if (delta > 0.1) {
        insights.push({
          emoji: '🟢',
          text: `Turn rate is improving. Average turn time is ${stats.avgTurnTime.toFixed(1)} days, ${delta.toFixed(1)} days faster than the previous period.`,
        });
      } else if (delta < -0.1) {
        insights.push({
          emoji: '🔴',
          text: `Turn rate has slowed. Average turn time is ${stats.avgTurnTime.toFixed(1)} days, ${Math.abs(delta).toFixed(1)} days slower than the previous period.`,
        });
      } else {
        insights.push({
          emoji: '🟡',
          text: `Turn rate is steady at ${stats.avgTurnTime.toFixed(1)} days, about the same as the previous period.`,
        });
      }
    }

    // Needs-attention count.
    if (stats.agingRedCount > 0) {
      insights.push({
        emoji: '🔴',
        text: `${stats.agingRedCount} vehicle${stats.agingRedCount === 1 ? '' : 's'} require${stats.agingRedCount === 1 ? 's' : ''} immediate attention — past the dealership's aging threshold.`,
      });
    } else {
      insights.push({ emoji: '🟢', text: "No vehicles are currently past the dealership's aging threshold." });
    }

    // Bottleneck stage — only shown when there's real data behind it.
    if (stats.bottleneck) {
      insights.push({
        emoji: '🟡',
        text: `${bottleneckLabel()} is currently the slowest stage, averaging ${stats.bottleneck.avgDays.toFixed(1)} days.`,
      });
    }

    // Carrying cost — always shown, even at $0, since it's still a real fact.
    insights.push({
      emoji: '💰',
      text: `Estimated carrying cost of active inventory is $${stats.totalCarryingCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`,
    });

    return insights;
  }

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3.5 bg-ink text-white flex-shrink-0 flex-wrap gap-y-2">
        <div className="flex items-center gap-2">
          <div>
            <p className="text-[11px] text-mist uppercase tracking-wider leading-none">Analytics</p>
            <h1 className="font-display text-lg font-semibold leading-tight">{dealershipName}</h1>
          </div>
          <button
            onClick={onClose}
            className="ml-2 text-xs font-semibold bg-signal-blue text-white rounded-full px-3 py-1.5 whitespace-nowrap"
          >
            ← Main Board
          </button>
        </div>
        <div className="flex items-center gap-3">
          {refreshing && <span className="text-xs text-mist">Refreshing…</span>}
          <button
            onClick={() => load(false)}
            disabled={refreshing}
            className="text-xs text-mist hover:text-white py-2 whitespace-nowrap disabled:opacity-50"
          >
            🔄 Refresh
          </button>
          <button
            onClick={() => setShowRateSettings((s) => !s)}
            className="text-xs text-mist hover:text-white py-2 whitespace-nowrap"
          >
            💰 Rates
          </button>
          <button
            onClick={handleExportPDF}
            className="text-xs text-mist hover:text-white py-2 whitespace-nowrap"
          >
            ⬇ Export PDF
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
          {/* Executive Summary — built for a 30-second glance. Deliberately
              placed above everything else, but nothing below it is removed
              or altered; this is a summary layer, not a replacement. */}
          <div>
            <h2 className="font-display font-semibold text-ink text-sm mb-2">Executive Summary</h2>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {buildExecutiveSummary().map((insight, i) => (
                <div key={i} className="flex items-start gap-2.5 px-3 py-2.5">
                  <span className="text-base leading-none flex-shrink-0 mt-0.5">{insight.emoji}</span>
                  <p className="text-sm text-ink leading-snug">{insight.text}</p>
                </div>
              ))}
            </div>
          </div>

          {stats.todaysPriorities.length > 0 && (
            <div>
              <h2 className="font-display font-semibold text-ink text-sm mb-2">Today's Priorities</h2>
              <div className="space-y-2">
                {stats.todaysPriorities.map((p, i) => (
                  <button
                    key={p.vehicle.id}
                    onClick={() => onNavigateToVehicle?.(p.vehicle.id, p.vehicle.board)}
                    disabled={!onNavigateToVehicle}
                    className="w-full text-left border border-gray-200 rounded-lg p-3 hover:bg-asphalt disabled:hover:bg-transparent"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-steel mb-0.5">#{i + 1} · {locationLabelForRow(p.vehicle, boards)}</p>
                        <p className="font-display font-semibold text-ink truncate">{vehicleShortLabel(p.vehicle)}</p>
                      </div>
                      <div className="flex-shrink-0 w-11 h-11 rounded-full bg-ink text-white flex items-center justify-center">
                        <span className="font-display font-bold text-sm tabular">{p.score}</span>
                      </div>
                    </div>
                    <p className="text-xs text-steel mt-1.5">
                      {p.reasons.map((r) => r.label).join(' · ') || 'No contributing factors'}
                    </p>
                    <p className="text-xs text-signal-blue font-medium mt-1">→ {p.recommendedAction}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {stats.needsAttention.length > 0 && (
            <div>
              <h2 className="font-display font-semibold text-ink text-sm mb-2">
                Needs Attention ({stats.needsAttention.length})
              </h2>
              <div className="border border-signal-red/30 rounded-lg divide-y divide-gray-100">
                {stats.needsAttention.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => onNavigateToVehicle?.(v.id, v.board)}
                    disabled={!onNavigateToVehicle}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-asphalt disabled:hover:bg-transparent"
                  >
                    <span className="text-sm text-ink truncate">{v.label}</span>
                    <span className="text-xs text-signal-red font-medium tabular flex-shrink-0">
                      {v.days.toFixed(1)}d →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {stats.dealershipScore !== null && (
            <div>
              <h2 className="font-display font-semibold text-ink text-sm mb-2">Dealership Performance Score</h2>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-4 mb-3">
                  <div className="w-16 h-16 rounded-full bg-ink text-white flex items-center justify-center flex-shrink-0">
                    <span className="font-display font-bold text-xl tabular">{stats.dealershipScore}</span>
                  </div>
                  <p className="text-xs text-steel">
                    Out of 100, built only from categories with enough data to score fairly right now.
                  </p>
                </div>
                <div className="space-y-2">
                  {stats.scoreCategories.map((c) => (
                    <div key={c.label} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-ink">{c.label}</span>
                      <span className="text-steel text-xs">{c.detail}</span>
                      <span className="tabular font-medium text-ink flex-shrink-0">{c.points}/{c.max}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {stats.stageHealth.length > 0 && (
            <div>
              <h2 className="font-display font-semibold text-ink text-sm mb-2">Stage Health — Main Board</h2>
              <div className="space-y-2">
                {stats.stageHealth.map((s) => (
                  <div key={s.key} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                            s.indicator === 'green' ? 'bg-signal-green' : s.indicator === 'yellow' ? 'bg-signal-amber' : 'bg-signal-red'
                          }`}
                        />
                        <p className="font-display font-semibold text-ink truncate">{s.label}</p>
                      </div>
                      <span className="font-display font-bold text-ink tabular flex-shrink-0">{s.health}</span>
                    </div>
                    <p className="text-xs text-steel tabular">
                      {formatDays(s.avgDays)} average · {s.waitingCount} waiting
                      {s.exceedingCount > 0 && ` · ${s.exceedingCount} over target`}
                    </p>
                    <p className="text-xs text-steel mt-1">{s.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="font-display font-semibold text-ink text-sm mb-2">Lost Money Dashboard</h2>
            <div className="border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-ink mb-3">
                {stats.blendedDailyRate !== null
                  ? `Every additional day active inventory remains in recon is currently estimated to add approximately $${stats.blendedDailyRate.toLocaleString(undefined, { maximumFractionDigits: 0 })} in carrying costs.`
                  : 'Set carrying cost rates (💰 Rates above) to see a daily cost estimate.'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-asphalt rounded-lg p-3">
                  <p className="text-xl font-display font-bold text-ink tabular">
                    ${stats.totalCarryingCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-steel">Current total carrying cost</p>
                </div>
                <div className="bg-asphalt rounded-lg p-3">
                  <p className="text-xl font-display font-bold text-ink tabular">
                    ${stats.periodCarryingCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-steel">This period</p>
                </div>
              </div>
              {stats.carryingCostChangeVsPrevious !== null && (
                <p className={`text-xs mt-3 font-medium ${stats.carryingCostChangeVsPrevious <= 0 ? 'text-signal-green' : 'text-signal-red'}`}>
                  {stats.carryingCostChangeVsPrevious <= 0
                    ? `$${Math.abs(stats.carryingCostChangeVsPrevious).toLocaleString(undefined, { maximumFractionDigits: 0 })} avoided vs. the previous period`
                    : `$${stats.carryingCostChangeVsPrevious.toLocaleString(undefined, { maximumFractionDigits: 0 })} more than the previous period`}
                </p>
              )}
            </div>
          </div>

          {stats.recommendations.length > 0 && (
            <div>
              <h2 className="font-display font-semibold text-ink text-sm mb-2">Recommendations</h2>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                {stats.recommendations.map((r, i) => (
                  <div key={i} className="flex items-start gap-2.5 px-3 py-2.5">
                    <span className="text-base leading-none flex-shrink-0 mt-0.5">{r.emoji}</span>
                    <p className="text-sm text-ink leading-snug">{r.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-ink rounded-xl p-5 text-white">
            <p className="text-xs text-mist uppercase tracking-wide mb-1">Turn Rate (Service → Price for Lot)</p>
            <p className="font-display text-3xl font-bold">{formatDays(stats.avgTurnTime)}</p>
            <div className="flex gap-4 mt-2 text-xs text-mist">
              <span>Fastest: {formatDays(stats.fastestTurn)}</span>
              <span>Slowest: {formatDays(stats.slowestTurn)}</span>
            </div>
            <div className="mt-3 pt-3 border-t border-white/10">
              <p className="text-xs text-mist uppercase tracking-wide mb-1">Avg. Transit Time (Inbound → Service)</p>
              <p className="font-display text-xl font-semibold">{formatDays(stats.avgTransitTime)}</p>
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
              <p className="text-xs text-steel">
                Flagged with damage{stats.damageRate !== null && ` (${stats.damageRate.toFixed(0)}%)`}
              </p>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-asphalt rounded-lg p-3">
              <p className="text-2xl font-display font-bold text-ink tabular">
                ${stats.totalCarryingCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-steel">Total carrying cost right now</p>
            </div>
            <div className="bg-asphalt rounded-lg p-3">
              <p className="text-2xl font-display font-bold text-ink tabular">
                ${stats.periodCarryingCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-steel">Carrying cost added this period</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-asphalt rounded-lg p-3">
              <p className="text-2xl font-display font-bold text-ink tabular">
                {stats.avgNewCarryingCost !== null
                  ? `$${stats.avgNewCarryingCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : '—'}
              </p>
              <p className="text-xs text-steel">Avg. cost — new vehicles</p>
            </div>
            <div className="bg-asphalt rounded-lg p-3">
              <p className="text-2xl font-display font-bold text-ink tabular">
                {stats.avgUsedCarryingCost !== null
                  ? `$${stats.avgUsedCarryingCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : '—'}
              </p>
              <p className="text-xs text-steel">Avg. cost — used vehicles</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border border-signal-amber rounded-lg p-3">
              <p className="text-[11px] uppercase tracking-wide text-steel mb-1">Bottleneck stage</p>
              <p className="font-display font-semibold text-ink">{bottleneckLabel()}</p>
              <p className="text-xs text-steel tabular">
                {stats.bottleneck ? `${formatDays(stats.bottleneck.avgDays)} average to get through` : '—'}
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

          {stats.topPerformers.length > 0 && (
            <div>
              <h2 className="font-display font-semibold text-ink text-sm mb-2">Completions this period</h2>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {stats.topPerformers.map((p, i) => (
                  <div
                    key={p.name}
                    className={`flex items-center justify-between px-3 py-2 text-sm ${i > 0 ? 'border-t border-gray-100' : ''}`}
                  >
                    <span className="text-ink">{p.name}</span>
                    <span className="tabular text-steel font-medium">{p.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
