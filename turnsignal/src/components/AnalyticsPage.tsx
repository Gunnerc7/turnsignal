import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { BoardConfig, fetchBoards } from '../lib/boards';
import { isAgingRed, getThresholds } from '../lib/aging';
import { carryingCostSoFar } from '../lib/dates';
import { computePriorityScores, vehicleShortLabel } from '../lib/priorityScoring';
import TodaysPrioritiesModal from './TodaysPrioritiesModal';
import OverviewTile from './OverviewTile';
import TurnRateGauge from './TurnRateGauge';
import CompletionsTrendChart from './CompletionsTrendChart';
import ModalCloseButton from './ModalCloseButton';

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
  title_status_updated_at: string | null;
  loaner_track_carrying_cost: boolean;
  carrying_cost_excluded: boolean;
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
  const [prioritiesModalOpen, setPrioritiesModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<RangeKey>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [expandedZone, setExpandedZone] = useState<'attention' | 'turnrate' | 'improvements' | 'deepdive' | null>(null);
  const [simulatedTurnRate, setSimulatedTurnRate] = useState<number | null>(null);

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
          'id, board, stage, stage_entered_at, recon_started_at, completed, completed_at, has_damage, is_new, title_status, title_status_updated_at, loaner_track_carrying_cost, carrying_cost_excluded, loaner_return_date, created_at, stock_number, year, make, model, completed_by_name'
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

    // A single representative $/day figure, weighted by the actual
    // current mix of new vs. used active vehicles — used only by the
    // what-if turn rate simulator below, to translate "N fewer days"
    // into a real dollar estimate without needing a much heavier
    // per-vehicle projection.
    const activeMainBoardVehicles = vehicles.filter((v) => !v.completed && v.board === 'main');
    const activeNewCount = activeMainBoardVehicles.filter((v) => v.is_new).length;
    const activeUsedCount = activeMainBoardVehicles.length - activeNewCount;
    const blendedDailyRate =
      activeMainBoardVehicles.length > 0
        ? (activeNewCount * newRatePerDay + activeUsedCount * usedRatePerDay) / activeMainBoardVehicles.length
        : (newRatePerDay + usedRatePerDay) / 2;

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
        if (v.board === 'loaners' && !v.loaner_track_carrying_cost) return;
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
      .filter((v) => !v.carrying_cost_excluded && (v.board !== 'loaners' || v.loaner_track_carrying_cost))
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

    const addedInRange = vehicles.filter((v) => inRange(v.created_at)).length;

    // ── Weekly completions trend (last 8 weeks) ──────────────────────────
    // Deliberately independent of the Today/Week/Month picker above — this
    // is a fixed trailing window so the shape of the trend stays stable
    // and comparable regardless of what range is currently selected.
    // Chosen specifically because it's something we can compute exactly
    // from completed_at timestamps already in hand — a chart is only
    // trustworthy if the data behind it is real, not approximated.
    const weeklyTrend: { label: string; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() - i * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 7);
      const count = vehicles.filter((v) => {
        if (!v.completed || !v.completed_at) return false;
        const d = new Date(v.completed_at);
        return d >= weekStart && d < weekEnd;
      }).length;
      weeklyTrend.push({ label: weekEnd.toLocaleDateString([], { month: 'short', day: 'numeric' }), count });
    }

    // ── Priority Scores + Today's Priorities ──────────────────────────
    // Rule-based, fully explainable — see lib/priorityScoring.ts for the
    // exact point math. Spans every active vehicle on every board except
    // Loaners, which is excluded here the same way and for the same
    // reason it's excluded from carrying cost — those vehicles are
    // already on the lot, not stuck in recon — UNLESS one is still
    // waiting on title, since that's a real, live priority either way.
    const priorityResults = computePriorityScores(
      vehicles.filter((v) => !v.completed && (v.board !== 'loaners' || v.loaner_track_carrying_cost)),
      yellowDays,
      redDays,
      newRatePerDay,
      usedRatePerDay
    );
    // Kept at 10 rather than 5 now that the full list lives behind its
    // own "Today's Priorities" drill-in instead of directly on the main
    // page — no reason to hold back detail once it's not competing for
    // space with everything else.
    const todaysPriorities = priorityResults.filter((r) => r.score > 0).slice(0, 10);

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

        // The actual fix: a live snapshot of vehicles ACTIVELY sitting in
        // this stage right now, using their real current stage_entered_at
        // — not the historical avgDaysFor, which only ever sees a stay
        // once it's over (exited_at gets set the moment a vehicle moves
        // on). That's exactly why a stage could show "operating
        // efficiently" while real vehicles were quietly sitting there for
        // days — the old calculation was structurally blind to anything
        // still in progress.
        const activeInStage = vehicles.filter((v) => !v.completed && v.board === 'main' && v.stage === s.key);
        const currentDaysList = activeInStage.map(
          (v) => (Date.now() - new Date(v.stage_entered_at).getTime()) / 86400000
        );
        const liveAvg =
          currentDaysList.length > 0 ? currentDaysList.reduce((a, b) => a + b, 0) / currentDaysList.length : null;
        const waitingCount = activeInStage.length;

        // Two distinct live signals: vehicles already past the red
        // threshold, and vehicles in the yellow zone heading that way but
        // not there yet — the second one is new, and it's specifically
        // what was missing before (a vehicle at 4 days with a 5-day red
        // threshold is real and worth flagging, even though it hasn't
        // technically gone red).
        const exceedingCount = currentDaysList.filter((d) => d > redDays).length;
        const approachingCount = currentDaysList.filter((d) => d > yellowDays && d <= redDays).length;

        // Historical average — still useful as a longer-term trend signal
        // (how stays have gone over the selected date range), just no
        // longer the only thing driving the score.
        const historicalAvg = avgDaysFor('main', s.key);
        const prevArr = previousStageDurations.get(key);
        const previousAvg = prevArr && prevArr.length > 0 ? prevArr.reduce((a, b) => a + b, 0) / prevArr.length : null;

        let health = 100;
        const reasons: string[] = [];

        if (liveAvg !== null) {
          const excessDays = Math.max(0, liveAvg - redDays);
          if (excessDays > 0) {
            health -= Math.min(35, Math.round(excessDays * 6));
            reasons.push(`vehicles currently there are averaging ${excessDays.toFixed(1)} days over target`);
          }
        }
        if (exceedingCount > 0) {
          health -= Math.min(30, exceedingCount * 8);
          reasons.push(`${exceedingCount} vehicle${exceedingCount === 1 ? '' : 's'} currently over target`);
        }
        if (approachingCount > 0) {
          health -= Math.min(15, approachingCount * 5);
          reasons.push(`${approachingCount} vehicle${approachingCount === 1 ? '' : 's'} approaching the target`);
        }
        if (previousAvg !== null && historicalAvg !== null) {
          const trendDelta = previousAvg - historicalAvg; // positive = improved (faster)
          if (trendDelta > 0.1) {
            health = Math.min(100, health + Math.min(10, Math.round(trendDelta * 4)));
          } else if (trendDelta < -0.1) {
            health -= Math.min(15, Math.round(Math.abs(trendDelta) * 4));
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
          avgDays: liveAvg ?? historicalAvg,
          waitingCount,
          approachingCount,
          exceedingCount,
          recommendation,
        };
      });

    // ── Stage Impact ─────────────────────────────────────────────────────
    // Merges Stage Health and Cost by Stage into one list, sorted by
    // dollar impact — the two were answering closely related questions
    // ("how's this stage doing" and "what's it costing") as two separate
    // sections, which just meant looking in two places for one picture.
    const stageImpact = (mainBoard?.stages ?? [])
      .filter((s) => s.key !== 'inbound_trade_in')
      .map((s) => {
        const health = stageHealth.find((h) => h.key === s.key);
        const cost = vehicles
          .filter((v) => !v.completed && v.board === 'main' && v.stage === s.key)
          .reduce((sum, v) => sum + carryingCostSoFar(v, newRatePerDay, usedRatePerDay), 0);
        return {
          key: s.key,
          label: s.label,
          avgDays: health?.avgDays ?? null,
          waitingCount: health?.waitingCount ?? 0,
          cost,
          indicator: health?.indicator ?? ('green' as 'green' | 'yellow' | 'red'),
        };
      })
      .filter((s) => s.waitingCount > 0 || s.cost > 0)
      .sort((a, b) => b.cost - a.cost);

    // ── Board Watch ──────────────────────────────────────────────────────
    // Deliberately narrow — Stage Health already owns Main Board, so this
    // only watches the two things nothing else on the page sees: vehicles
    // sitting quietly on a sidebar board (Loaners, Body Shop, Waiting on
    // Title, Auction/Wholesale) longer than the dealership's own aging
    // threshold with nothing moving them along, and vehicles where Title
    // Status has been stuck at "Waiting" long enough that it's worth a
    // human double-checking whether that's still actually true — exactly
    // the gap that let a title sit marked "waiting" after it had already
    // arrived. Every item here is a plain rule against real timestamps,
    // nothing inferred or guessed at.
    const boardWatchItems: { emoji: string; text: string; vehicleId: string; board: string }[] = [];

    boards
      .filter((b) => b.key !== 'main' && b.key !== 'loaners')
      .forEach((b) => {
        vehicles
          .filter((v) => !v.completed && v.board === b.key)
          .forEach((v) => {
            const days = (Date.now() - new Date(v.stage_entered_at).getTime()) / 86400000;
            if (days >= redDays) {
              boardWatchItems.push({
                emoji: '🔸',
                text: `${vehicleLabel(v)} has been in ${b.label} for ${days.toFixed(0)} days with no update.`,
                vehicleId: v.id,
                board: v.board,
              });
            }
          });
      });

    // Title status stuck on "Waiting" — uses the real timestamp above,
    // not a guess. Same redDays threshold as everywhere else, so "stuck
    // too long" means the same thing here as it does anywhere else on
    // the page.
    vehicles
      .filter((v) => !v.completed && v.title_status === 'waiting' && v.title_status_updated_at)
      .forEach((v) => {
        const days = (Date.now() - new Date(v.title_status_updated_at!).getTime()) / 86400000;
        if (days >= redDays) {
          boardWatchItems.push({
            emoji: '🔸',
            text: `${vehicleLabel(v)} has shown "Waiting on Title" for ${days.toFixed(0)} days — worth confirming that's still accurate.`,
            vehicleId: v.id,
            board: v.board,
          });
        }
      });

    boardWatchItems.sort((a, b) => a.text.localeCompare(b.text));

    // ── Lost Money Dashboard extras ─────────────────────────────────────
    // Carrying cost avoided (or added) vs. the immediately preceding
    // period, plus a plain narrative sentence. No gross profit estimate —
    // only known rate data already configured for this dealership.
    let previousPeriodCarryingCost: number | null = null;
    if (previousBounds) {
      previousPeriodCarryingCost = vehicles
        .filter((v) => !v.carrying_cost_excluded && (v.board !== 'loaners' || v.loaner_track_carrying_cost))
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

    // ── What's Working ───────────────────────────────────────────────────
    // Answers "what can I show the owner" — deliberately built from
    // numbers already computed above, nothing new calculated here, same
    // reasoning as the old Executive Summary. Only ever states real,
    // verifiable facts about the selected period; no causal claim about
    // WHY something improved, just that it did.
    const whatsWorking: { emoji: string; text: string }[] = [];
    if (turnTimes.length > 0) {
      whatsWorking.push({
        emoji: '✅',
        text: `${turnTimes.length} vehicle${turnTimes.length === 1 ? '' : 's'} completed this period.`,
      });
    }
    if (avgTurnTime !== null && previousAvgTurnTime !== null) {
      const delta = previousAvgTurnTime - avgTurnTime;
      if (delta > 0.1) {
        whatsWorking.push({
          emoji: '✅',
          text: `Turn rate improved ${delta.toFixed(1)} days vs. the previous period (${avgTurnTime.toFixed(1)} days now).`,
        });
      }
    }
    if (carryingCostChangeVsPrevious !== null && carryingCostChangeVsPrevious < -1) {
      whatsWorking.push({
        emoji: '✅',
        text: `$${Math.abs(carryingCostChangeVsPrevious).toLocaleString(undefined, { maximumFractionDigits: 0 })} less spent on carrying cost vs. the previous period.`,
      });
    }

    // ── Opportunity Meter ────────────────────────────────────────────────
    // Not a savings promise — a plain, rule-based estimate of how much of
    // today's carrying cost is specifically the EXCESS beyond each
    // vehicle's own stage target, using only this dealership's own
    // configured rates and thresholds. A vehicle exactly at or under
    // target contributes $0 to this number, even though it's still
    // accruing real carrying cost overall.
    let opportunityAmount = 0;
    vehicles
      .filter((v) => !v.completed)
      .forEach((v) => {
        const thresholds = getThresholds(v.board, v.stage, yellowDays, redDays);
        if (!thresholds) return; // Inbound/Loaners aren't held to a target the same way
        const anchor = v.recon_started_at ?? v.stage_entered_at;
        const days = (Date.now() - new Date(anchor).getTime()) / 86400000;
        const excessDays = Math.max(0, days - thresholds.red);
        if (excessDays <= 0) return;
        const rate = v.is_new ? newRatePerDay : usedRatePerDay;
        opportunityAmount += excessDays * rate;
      });
    const targetCarryingCost = Math.max(0, totalCarryingCost - opportunityAmount);

    // Vehicles currently waiting on title — feeds a conditional line in
    // Executive Summary below (only appears when the count is actually
    // above zero, rather than a permanent fixture).
    const waitingOnTitleCount = vehicles.filter((v) => !v.completed && v.title_status === 'waiting').length;

    // Damage rate as a share of total inventory — more useful for
    // tracking a trend over time than the raw count alone.
    const damageRate = vehicles.length > 0 ? (damagedCount / vehicles.length) * 100 : null;

    return {
      currentCounts,
      avgDaysFor,
      bottleneck,
      avgTurnTime,
      previousAvgTurnTime,
      fastestTurn,
      slowestTurn,
      blendedDailyRate,
      completedInRange: turnTimes.length,
      addedInRange,
      longestAging,
      damagedCount,
      damageRate,
      overdueLoaners,
      mainBoardActive,
      agingRedCount,
      totalCarryingCost,
      periodCarryingCost,
      previousPeriodCarryingCost,
      carryingCostChangeVsPrevious,
      avgNewCarryingCost,
      avgUsedCarryingCost,
      avgTransitTime,
      todaysPriorities,
      stageHealth,
      boardWatchItems,
      opportunityAmount,
      targetCarryingCost,
      stageImpact,
      waitingOnTitleCount,
      whatsWorking,
      weeklyTrend,
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

    const summaryRows = buildExecutiveSummary()
      .map((s) => `<div class="summary-row"><span>${s.emoji}</span><span>${s.text}</span></div>`)
      .join('');

    const priorityRows = stats.todaysPriorities
      .map(
        (p, i) =>
          `<tr><td style="padding:5px 10px;border-top:1px solid #e5e7eb;">#${i + 1} ${vehicleShortLabel(p.vehicle)}</td><td style="padding:5px 10px;border-top:1px solid #e5e7eb;text-align:right;">${p.score}</td></tr>`
      )
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

${stats.todaysPriorities.length > 0 ? `
<h2>Today's Priorities (${stats.todaysPriorities.length})</h2>
<table>
  <thead><tr><th>Vehicle</th><th style="text-align:right;">Priority score</th></tr></thead>
  <tbody>${priorityRows}</tbody>
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
  <div class="stat"><div class="stat-num${stats.carryingCostChangeVsPrevious !== null && stats.carryingCostChangeVsPrevious > 0 ? ' red' : ''}">${stats.carryingCostChangeVsPrevious !== null ? (stats.carryingCostChangeVsPrevious <= 0 ? '−' : '+') + '$' + Math.abs(stats.carryingCostChangeVsPrevious).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</div><div class="stat-label">${stats.carryingCostChangeVsPrevious !== null && stats.carryingCostChangeVsPrevious <= 0 ? 'Avoided' : 'Added'} vs. previous period</div></div>
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

    // Turn rate + trend vs. the immediately preceding period of equal
    // length — kept short on purpose, since the only job of this line is
    // a fast glance, not a full paragraph.
    if (stats.avgTurnTime === null) {
      insights.push({ emoji: '🟡', text: 'No vehicles completed Price for Lot in this period yet.' });
    } else if (stats.previousAvgTurnTime === null) {
      insights.push({ emoji: '🟡', text: `Turn rate: ${stats.avgTurnTime.toFixed(1)} days. Not enough history yet for a trend.` });
    } else {
      const delta = stats.previousAvgTurnTime - stats.avgTurnTime; // positive = current period is faster
      if (delta > 0.1) {
        insights.push({ emoji: '🟢', text: `Turn rate: ${stats.avgTurnTime.toFixed(1)} days — ${delta.toFixed(1)} days faster than last period.` });
      } else if (delta < -0.1) {
        insights.push({ emoji: '🔴', text: `Turn rate: ${stats.avgTurnTime.toFixed(1)} days — ${Math.abs(delta).toFixed(1)} days slower than last period.` });
      } else {
        insights.push({ emoji: '🟡', text: `Turn rate: ${stats.avgTurnTime.toFixed(1)} days — steady vs. last period.` });
      }
    }

    // Carrying cost — always shown, even at $0, since it's still a real fact.
    insights.push({
      emoji: '💰',
      text: `Estimated carrying cost of active inventory is $${stats.totalCarryingCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}.`,
    });

    // The two genuinely non-redundant conditions from what used to be a
    // separate Recommendations section — the rest of that section was
    // dropped because it was just repeating what Stage Health and Today's
    // Priorities already say. These only appear when actually true.
    if (stats.waitingOnTitleCount > 0) {
      insights.push({
        emoji: '🟡',
        text: `${stats.waitingOnTitleCount} vehicle${stats.waitingOnTitleCount === 1 ? ' is' : 's are'} waiting on title — follow up on paperwork to avoid further delay.`,
      });
    }

    if (stats.carryingCostChangeVsPrevious !== null && stats.carryingCostChangeVsPrevious > 0) {
      insights.push({
        emoji: '🔴',
        text: `Carrying cost is up $${stats.carryingCostChangeVsPrevious.toLocaleString(undefined, { maximumFractionDigits: 0 })} vs. the previous period.`,
      });
    }

    return insights;
  }

  // Separate from the mainBoard used inside the stats calculation above —
  // that one is scoped to the useMemo and isn't reachable from render.
  const mainBoardForDisplay = boards.find((b) => b.key === 'main');

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
        <div className="flex-1 overflow-y-auto p-4">
          {/* Time-sensitive callouts only — nothing permanent lives here,
              so this stays empty (and invisible) most of the time. */}
          {stats.waitingOnTitleCount > 0 && (
            <div className="flex items-center gap-2 bg-signal-amber/10 border border-signal-amber/30 rounded-xl px-3 py-2.5 mb-3">
              <span className="text-base">🟡</span>
              <p className="text-sm text-ink">
                {stats.waitingOnTitleCount} vehicle{stats.waitingOnTitleCount === 1 ? ' is' : 's are'} waiting on
                title — follow up on paperwork.
              </p>
            </div>
          )}
          {stats.carryingCostChangeVsPrevious !== null && stats.carryingCostChangeVsPrevious > 0 && (
            <div className="flex items-center gap-2 bg-signal-red/10 border border-signal-red/30 rounded-xl px-3 py-2.5 mb-3">
              <span className="text-base">🔴</span>
              <p className="text-sm text-ink">
                Carrying cost is up $
                {stats.carryingCostChangeVsPrevious.toLocaleString(undefined, { maximumFractionDigits: 0 })} vs. the
                previous period.
              </p>
            </div>
          )}

          {/* The landing view — four bold, tappable squares. Nothing else
              lives here; every real number sits behind one of these
              four, one tap away. */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setExpandedZone('attention')}
              className="aspect-square flex flex-col items-center justify-center gap-3 bg-ink rounded-2xl p-4 active:scale-[0.98] transition"
            >
              <div className="w-14 h-14 rounded-xl bg-signal-red/20 text-signal-red flex items-center justify-center">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C10 2 8.5 3.5 8.5 5.5V6.5C6 7.5 4.5 10 4.5 13V17L2.5 19V20H21.5V19L19.5 17V13C19.5 10 18 7.5 15.5 6.5V5.5C15.5 3.5 14 2 12 2Z" fill="currentColor" />
                  <path d="M9.5 21C9.5 22.1 10.6 23 12 23C13.4 23 14.5 22.1 14.5 21H9.5Z" fill="currentColor" />
                </svg>
              </div>
              <p className="font-display text-sm font-semibold text-white text-center">Needs Attention</p>
            </button>

            <button
              onClick={() => setExpandedZone('turnrate')}
              className="aspect-square flex flex-col items-center justify-center gap-3 bg-ink rounded-2xl p-4 active:scale-[0.98] transition"
            >
              <div className="w-14 h-14 rounded-xl bg-signal-blue/20 text-signal-blue flex items-center justify-center">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                  <path d="M4 18C4 12.5 8 8 12 8C16 8 20 12.5 20 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <line x1="12" y1="15" x2="15" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="15" r="1.5" fill="currentColor" />
                </svg>
              </div>
              <p className="font-display text-sm font-semibold text-white text-center">Turn Rate &amp; Cost</p>
            </button>

            <button
              onClick={() => setExpandedZone('improvements')}
              className="aspect-square flex flex-col items-center justify-center gap-3 bg-ink rounded-2xl p-4 active:scale-[0.98] transition"
            >
              <div className="w-14 h-14 rounded-xl bg-signal-amber/20 text-signal-amber flex items-center justify-center">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                  <path d="M4 12H17M17 12L12 7M17 12L12 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="font-display text-sm font-semibold text-white text-center">Improvements</p>
            </button>

            <button
              onClick={() => setExpandedZone('deepdive')}
              className="aspect-square flex flex-col items-center justify-center gap-3 bg-ink rounded-2xl p-4 active:scale-[0.98] transition"
            >
              <div className="w-14 h-14 rounded-xl bg-white/10 text-mist flex items-center justify-center">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                  <rect x="5" y="3" width="14" height="6" rx="1" stroke="currentColor" strokeWidth="2" />
                  <rect x="5" y="10" width="14" height="6" rx="1" stroke="currentColor" strokeWidth="2" />
                  <rect x="5" y="17" width="14" height="4" rx="1" stroke="currentColor" strokeWidth="2" />
                </svg>
              </div>
              <p className="font-display text-sm font-semibold text-white text-center">Deep Dive</p>
            </button>
          </div>
        </div>
      )}

      {expandedZone !== null &&
        createPortal(
          <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md modal-h-85 flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
                <h2 className="font-display text-lg font-semibold text-ink">
                  {expandedZone === 'attention' && 'Needs Attention'}
                  {expandedZone === 'turnrate' && 'Turn Rate & Cost'}
                  {expandedZone === 'improvements' && 'Improvements'}
                  {expandedZone === 'deepdive' && 'Deep Dive'}
                </h2>
                <ModalCloseButton onClick={() => setExpandedZone(null)} />
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-5">
                {expandedZone === 'attention' && (
                  <>
                    {stats.todaysPriorities.length > 0 ? (
                      <div className="bg-ink rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-3 gap-2">
                          <p className="font-display text-lg font-bold text-white leading-tight">
                            {Math.min(3, stats.todaysPriorities.length)} Vehicle
                            {Math.min(3, stats.todaysPriorities.length) === 1 ? '' : 's'} Need Attention Now
                          </p>
                          {stats.todaysPriorities.length > 3 && (
                            <button
                              onClick={() => setPrioritiesModalOpen(true)}
                              className="text-mist text-xs flex-shrink-0 whitespace-nowrap"
                            >
                              +{stats.todaysPriorities.length - 3} more →
                            </button>
                          )}
                        </div>
                        <div className="space-y-2">
                          {stats.todaysPriorities.slice(0, 3).map((p) => {
                            const cost = carryingCostSoFar(p.vehicle, newRatePerDay, usedRatePerDay);
                            return (
                              <button
                                key={p.vehicle.id}
                                onClick={() => onNavigateToVehicle?.(p.vehicle.id, p.vehicle.board)}
                                disabled={!onNavigateToVehicle}
                                className="w-full text-left bg-white/[0.07] rounded-lg p-3 active:scale-[0.99] transition"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="font-display font-semibold text-white text-sm truncate">
                                    {vehicleShortLabel(p.vehicle)}
                                  </p>
                                  {cost > 0 && (
                                    <span className="text-signal-amber font-display font-bold text-sm tabular flex-shrink-0">
                                      ${cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </span>
                                  )}
                                </div>
                                <p className="text-mist text-xs mt-0.5">{p.recommendedAction}</p>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="w-full bg-signal-green/10 border border-signal-green/30 rounded-2xl p-5">
                        <p className="text-sm text-ink font-medium">🟢 Nothing needs immediate attention right now.</p>
                      </div>
                    )}

                    {stats.boardWatchItems.length > 0 && (
                      <div>
                        <h2 className="font-display font-semibold text-ink text-sm mb-2">Board Watch</h2>
                        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                          {stats.boardWatchItems.map((item, i) => (
                            <button
                              key={i}
                              onClick={() => onNavigateToVehicle?.(item.vehicleId, item.board)}
                              disabled={!onNavigateToVehicle}
                              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-asphalt disabled:hover:bg-transparent"
                            >
                              <span className="text-base leading-none flex-shrink-0 mt-0.5">{item.emoji}</span>
                              <p className="text-sm text-ink leading-snug">{item.text}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {expandedZone === 'turnrate' && (
                  <>
                    <div className="bg-ink rounded-2xl p-5">
                      <div className="max-w-[200px] mx-auto">
                        <TurnRateGauge
                          value={simulatedTurnRate ?? stats.avgTurnTime}
                          yellowDays={yellowDays}
                          redDays={redDays}
                        />
                      </div>
                      <p className="text-center font-display text-3xl font-bold text-white -mt-2">
                        {formatDays(simulatedTurnRate ?? stats.avgTurnTime)}
                      </p>
                      <p className="text-center text-mist text-xs mb-4">
                        {simulatedTurnRate !== null ? 'if turn rate were this' : 'average turn rate'}
                      </p>

                      {/* What-if simulator — dragging this slider moves the
                          needle above and estimates the dollar impact,
                          using this dealership's own configured rates.
                          Framed clearly as an estimate, same as the
                          Opportunity Meter — not a promise. */}
                      <div className="border-t border-white/10 pt-4">
                        <input
                          type="range"
                          min={0}
                          max={14}
                          step={0.5}
                          value={simulatedTurnRate ?? stats.avgTurnTime ?? 0}
                          onChange={(e) => setSimulatedTurnRate(parseFloat(e.target.value))}
                          className="w-full accent-signal-blue"
                        />
                        <div className="flex items-center justify-between text-[10px] text-mist mb-2">
                          <span>0 days</span>
                          <span>14 days</span>
                        </div>
                        {simulatedTurnRate !== null && stats.avgTurnTime !== null && (
                          (() => {
                            const delta = simulatedTurnRate - stats.avgTurnTime;
                            const impact = delta * stats.blendedDailyRate * stats.completedInRange;
                            return (
                              <p className="text-center text-sm">
                                <span className={impact < 0 ? 'text-signal-green font-semibold' : impact > 0 ? 'text-signal-red font-semibold' : 'text-mist'}>
                                  {Math.abs(impact) < 1
                                    ? 'About the same as today'
                                    : `~$${Math.abs(impact).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${impact < 0 ? 'saved' : 'more'} vs. today`}
                                </span>
                                <br />
                                <span className="text-mist text-xs">
                                  estimate across {stats.completedInRange} vehicle{stats.completedInRange === 1 ? '' : 's'} this period
                                </span>
                              </p>
                            );
                          })()
                        )}
                        {simulatedTurnRate !== null && (
                          <button
                            onClick={() => setSimulatedTurnRate(null)}
                            className="w-full text-center text-signal-blue text-xs font-medium mt-2"
                          >
                            Reset to current
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <OverviewTile
                        icon="⏱️"
                        accent="blue"
                        value={formatDays(stats.avgTurnTime)}
                        label="Turn Rate"
                        trend={
                          stats.previousAvgTurnTime !== null && stats.avgTurnTime !== null
                            ? {
                                direction: stats.previousAvgTurnTime - stats.avgTurnTime > 0 ? 'up' : 'down',
                                good: stats.previousAvgTurnTime - stats.avgTurnTime > 0,
                                label:
                                  Math.abs(stats.previousAvgTurnTime - stats.avgTurnTime) < 0.1
                                    ? 'Steady'
                                    : `${Math.abs(stats.previousAvgTurnTime - stats.avgTurnTime).toFixed(1)}d vs. last period`,
                              }
                            : undefined
                        }
                      />
                      <OverviewTile
                        icon="💰"
                        accent="amber"
                        value={`$${stats.totalCarryingCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                        label="Carrying Cost"
                        sublabel={
                          stats.opportunityAmount > 1
                            ? `~$${stats.opportunityAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} avoidable`
                            : undefined
                        }
                      />
                      <OverviewTile
                        icon="🚧"
                        accent="red"
                        value={bottleneckLabel()}
                        label="Bottleneck"
                        sublabel={stats.bottleneck ? `${formatDays(stats.bottleneck.avgDays)} avg` : undefined}
                      />
                      <OverviewTile
                        icon="⚠️"
                        accent="red"
                        value={String(stats.todaysPriorities.length)}
                        label="Vehicles at Risk"
                        onClick={stats.todaysPriorities.length > 0 ? () => setPrioritiesModalOpen(true) : undefined}
                      />
                    </div>

                    {stats.whatsWorking.length > 0 && (
                      <div>
                        <p className="text-[11px] text-steel uppercase tracking-wide font-semibold mb-1.5">
                          What can I show the owner?
                        </p>
                        <div className="bg-signal-green/5 border border-signal-green/20 rounded-lg divide-y divide-signal-green/10">
                          {stats.whatsWorking.map((item, i) => (
                            <div key={i} className="flex items-start gap-2.5 px-3 py-2.5">
                              <span className="text-base leading-none flex-shrink-0 mt-0.5">{item.emoji}</span>
                              <p className="text-sm text-ink leading-snug">{item.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <CompletionsTrendChart data={stats.weeklyTrend} />
                  </>
                )}

                {expandedZone === 'improvements' && (
                  <>
                    {stats.stageImpact.length > 0 && (
                      <div>
                        <p className="text-[11px] text-steel uppercase tracking-wide font-semibold mb-1.5">
                          Where is the money stuck?
                        </p>
                        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                          {stats.stageImpact.map((s) => {
                            const target = vehicles.find((v) => !v.completed && v.board === 'main' && v.stage === s.key);
                            return (
                              <button
                                key={s.key}
                                onClick={() => target && onNavigateToVehicle?.(target.id, 'main')}
                                disabled={!target || !onNavigateToVehicle}
                                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-asphalt disabled:hover:bg-transparent"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span
                                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                      s.indicator === 'green' ? 'bg-signal-green' : s.indicator === 'yellow' ? 'bg-signal-amber' : 'bg-signal-red'
                                    }`}
                                  />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-ink truncate">{s.label}</p>
                                    <p className="text-[11px] text-steel tabular">
                                      {formatDays(s.avgDays)} avg · {s.waitingCount} waiting
                                    </p>
                                  </div>
                                </div>
                                <span className="text-sm font-semibold text-ink tabular flex-shrink-0">
                                  ${s.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {mainBoardForDisplay && (
                      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
                        {mainBoardForDisplay.stages.map((s, i) => {
                          const health = stats.stageHealth.find((h) => h.key === s.key);
                          const dotColor =
                            s.key === 'inbound_trade_in'
                              ? 'bg-gray-300'
                              : health?.indicator === 'green'
                              ? 'bg-signal-green'
                              : health?.indicator === 'yellow'
                              ? 'bg-signal-amber'
                              : health?.indicator === 'red'
                              ? 'bg-signal-red'
                              : 'bg-gray-300';
                          return (
                            <div key={s.key} className="flex items-center flex-1 last:flex-none">
                              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                                <span className={`w-3 h-3 rounded-full ${dotColor}`} />
                                <span className="text-[9px] text-steel text-center leading-tight max-w-[52px]">{s.label}</span>
                              </div>
                              {i < mainBoardForDisplay.stages.length - 1 && <div className="h-px bg-gray-200 flex-1 mx-1" />}
                            </div>
                          );
                        })}
                      </div>
                    )}

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
                  </>
                )}

                {expandedZone === 'deepdive' && (
                  <>
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
                                {formatDays(s.avgDays)} average, active now · {s.waitingCount} waiting
                              </p>
                              {(s.approachingCount > 0 || s.exceedingCount > 0) && (
                                <p className="text-xs tabular mt-0.5">
                                  {s.approachingCount > 0 && (
                                    <span className="text-signal-amber font-medium">
                                      {s.approachingCount} approaching target
                                    </span>
                                  )}
                                  {s.approachingCount > 0 && s.exceedingCount > 0 && <span className="text-steel"> · </span>}
                                  {s.exceedingCount > 0 && (
                                    <span className="text-signal-red font-medium">{s.exceedingCount} over target</span>
                                  )}
                                </p>
                              )}
                              <p className="text-xs text-steel mt-1">{s.recommendation}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

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

                    <div className="bg-ink rounded-xl p-5 text-white">
                      <p className="text-xs text-mist uppercase tracking-wide mb-1">Avg. Transit Time (Inbound → Service)</p>
                      <p className="font-display text-2xl font-semibold">{formatDays(stats.avgTransitTime)}</p>
                      <div className="flex gap-4 mt-2 text-xs text-mist">
                        <span>Fastest turn: {formatDays(stats.fastestTurn)}</span>
                        <span>Slowest turn: {formatDays(stats.slowestTurn)}</span>
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
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {prioritiesModalOpen && (
        <TodaysPrioritiesModal
          priorities={stats.todaysPriorities}
          boards={boards}
          newRatePerDay={newRatePerDay}
          usedRatePerDay={usedRatePerDay}
          onClose={() => setPrioritiesModalOpen(false)}
          onNavigateToVehicle={onNavigateToVehicle}
        />
      )}
    </div>
  );
}
