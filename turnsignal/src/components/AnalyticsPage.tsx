import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BoardConfig, fetchBoards } from '../lib/boards';
import { isAgingRed, getThresholds } from '../lib/aging';
import { carryingCostSoFar } from '../lib/dates';
import { computePriorityScores, vehicleShortLabel } from '../lib/priorityScoring';
import TodaysPrioritiesModal from './TodaysPrioritiesModal';
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
    const slowestStage =
      Array.from(stageDurations.entries())
        .map(([key, arr]) => {
          const [board, stage] = key.split('::');
          const avgDays = arr.reduce((a, b) => a + b, 0) / arr.length;
          return { board, stage, avgDays };
        })
        .filter((entry) => entry.board === 'main' && entry.stage !== 'inbound_trade_in')
        .sort((a, b) => b.avgDays - a.avgDays)[0] ?? null;

    // A stage is only called a true bottleneck when it is slower than the
    // dealership's own red aging target. If everything is within target,
    // we still show the slowest stage for context without falsely labeling
    // it as a problem.
    const bottleneck =
      slowestStage &&
      (() => {
        const thresholds = getThresholds(slowestStage.board, slowestStage.stage, yellowDays, redDays);
        return thresholds && slowestStage.avgDays > thresholds.red;
      })()
        ? slowestStage
        : null;

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
    const turnTimeDetails: { vehicle: VehicleRow; days: number }[] = [];
    vehicles.forEach((v) => {
      if (v.stage !== 'price_for_lot' || !v.completed || !v.completed_at) return;
      if (!inRange(v.completed_at)) return;
      const serviceEntered = serviceEnteredByVehicle.get(v.id);
      if (!serviceEntered) return;
      const days = (new Date(v.completed_at).getTime() - serviceEntered.getTime()) / 86400000;
      turnTimes.push(days);
      turnTimeDetails.push({ vehicle: v, days });
    });
    const fastestVehicleThisPeriod =
      turnTimeDetails.length > 0
        ? turnTimeDetails.reduce((min, cur) => (cur.days < min.days ? cur : min))
        : null;
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
          return { label: vehicleLabel(v), days, vehicleId: v.id, board: v.board };
        })
        .sort((a, b) => b.days - a.days)[0] ?? null;

    const damagedCount = vehicles.filter((v) => v.has_damage).length;
    const overdueLoaners = vehicles.filter(
      (v) => !v.completed && v.loaner_return_date && new Date(v.loaner_return_date) < new Date()
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
    const stageImpact = (mainBoard?.stages ?? []).map((s) => {
      const health = stageHealth.find((h) => h.key === s.key);
      const activeVehicles = vehicles.filter((v) => !v.completed && v.board === 'main' && v.stage === s.key);
      const cost = activeVehicles.reduce(
        (sum, v) => sum + carryingCostSoFar(v, newRatePerDay, usedRatePerDay),
        0
      );
      const thresholds = getThresholds('main', s.key, yellowDays, redDays);
      const targetDays = thresholds?.red ?? null;
      const avgDays = health?.avgDays ?? avgDaysFor('main', s.key);
      return {
        key: s.key,
        label: s.label,
        avgDays,
        waitingCount: activeVehicles.length,
        cost,
        targetDays,
        differenceDays: avgDays !== null && targetDays !== null ? avgDays - targetDays : null,
        indicator: health?.indicator ?? ('green' as 'green' | 'yellow' | 'red'),
        firstVehicleId: activeVehicles[0]?.id,
        firstVehicleBoard: activeVehicles[0]?.board,
      };
    });

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

    // ── Wins This Month ──────────────────────────────────────────────────
    // Answers "what can I show the owner" — deliberately built from
    // numbers already computed above, nothing new calculated here. Only
    // ever states real, verifiable facts about the selected period; no
    // causal claim about WHY something improved, just that it did.
    // Naming a specific vehicle is a genuine highlight worth pointing to
    // — a bare completion count on its own doesn't actually say anything
    // useful about how the period went.
    const wins: { emoji: string; text: string }[] = [];
    if (fastestVehicleThisPeriod) {
      const v = fastestVehicleThisPeriod.vehicle;
      const label = `${v.stock_number ? v.stock_number + '-' : ''}${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.trim();
      wins.push({
        emoji: '🏆',
        text: `${label} was your fastest turn this period — ${fastestVehicleThisPeriod.days.toFixed(1)} days.`,
      });
    }
    if (avgTurnTime !== null && previousAvgTurnTime !== null) {
      const delta = previousAvgTurnTime - avgTurnTime;
      if (delta > 0.1) {
        wins.push({
          emoji: '✅',
          text: `Turn rate improved ${delta.toFixed(1)} days vs. the previous period (${avgTurnTime.toFixed(1)} days now).`,
        });
      }
    }
    if (carryingCostChangeVsPrevious !== null && carryingCostChangeVsPrevious < -1) {
      wins.push({
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
    type OpportunityVehicle = {
      vehicleId: string;
      board: string;
      stage: string;
      label: string;
      stageLabel: string;
      daysOverTarget: number;
      dailyRate: number;
      amount: number;
    };

    const opportunityVehicles: OpportunityVehicle[] = [];
    const opportunityByStageMap = new Map<
      string,
      { board: string; stage: string; label: string; amount: number; vehicleCount: number; firstVehicleId: string }
    >();

    vehicles
      .filter(
        (v) =>
          !v.completed &&
          !v.carrying_cost_excluded &&
          (v.board !== 'loaners' || v.loaner_track_carrying_cost)
      )
      .forEach((v) => {
        const thresholds = getThresholds(v.board, v.stage, yellowDays, redDays);
        if (!thresholds) return; // Inbound/Loaners without a target do not create an opportunity estimate.

        // Stage targets must use time in the CURRENT stage. Using recon_started_at
        // here would incorrectly charge Service, Detail, etc. for time accumulated
        // elsewhere in the workflow.
        const daysInStage = Math.max(
          0,
          (Date.now() - new Date(v.stage_entered_at).getTime()) / 86400000
        );
        const excessDays = Math.max(0, daysInStage - thresholds.red);
        if (excessDays <= 0) return;

        const dailyRate = v.is_new ? newRatePerDay : usedRatePerDay;
        if (dailyRate <= 0) return;

        const amount = excessDays * dailyRate;
        const board = boards.find((b) => b.key === v.board);
        const stageLabel = board?.stages.find((stage) => stage.key === v.stage)?.label ?? v.stage;

        opportunityVehicles.push({
          vehicleId: v.id,
          board: v.board,
          stage: v.stage,
          label: vehicleShortLabel(v),
          stageLabel,
          daysOverTarget: excessDays,
          dailyRate,
          amount,
        });

        const key = `${v.board}::${v.stage}`;
        const existing = opportunityByStageMap.get(key);
        opportunityByStageMap.set(key, {
          board: v.board,
          stage: v.stage,
          label: stageLabel,
          amount: (existing?.amount ?? 0) + amount,
          vehicleCount: (existing?.vehicleCount ?? 0) + 1,
          firstVehicleId: existing?.firstVehicleId ?? v.id,
        });
      });

    opportunityVehicles.sort((a, b) => b.amount - a.amount);
    const opportunityByStage = [...opportunityByStageMap.values()].sort((a, b) => b.amount - a.amount);
    const opportunityAmount = opportunityVehicles.reduce((sum, item) => sum + item.amount, 0);
    const targetCarryingCost = Math.max(0, totalCarryingCost - opportunityAmount);

    // Saved Money Counter: compares the dealership only against its own
    // immediately preceding equal-length period. It estimates the carrying
    // cost avoided by turning the vehicles completed this period faster.
    // It is intentionally zero when there is no improvement or insufficient
    // history, and is presented as an estimate rather than guaranteed savings.
    const turnRateImprovementDays =
      avgTurnTime !== null && previousAvgTurnTime !== null
        ? Math.max(0, previousAvgTurnTime - avgTurnTime)
        : null;
    const estimatedSavingsThisPeriod =
      turnRateImprovementDays !== null && turnTimes.length > 0 && blendedDailyRate > 0
        ? turnRateImprovementDays * turnTimes.length * blendedDailyRate
        : null;

    // Vehicles currently waiting on title — feeds a conditional line in
    // Executive Summary below (only appears when the count is actually
    // above zero, rather than a permanent fixture).
    const waitingOnTitleCount = vehicles.filter((v) => !v.completed && v.title_status === 'waiting').length;

    // Damage rate as a share of total inventory — more useful for
    // tracking a trend over time than the raw count alone.
    const damageRate = vehicles.length > 0 ? (damagedCount / vehicles.length) * 100 : null;

    // ── Action Center vehicles ──────────────────────────────────────────
    // Always surface the three highest-priority individual vehicles here.
    // Broader operational issues such as title delays and stage bottlenecks
    // remain visible in How to Save More, Stage Health, and the KPI row.
    // This keeps Action Center concrete: every card is a vehicle a manager
    // can click, find on the board, and act on immediately.
    type ActionIssue = {
      title: string;
      badge: string;
      sublabel: string;
      cost: number;
      actionLabel: string;
      vehicleId: string;
      board: string;
      score: number;
      reason: string;
      recommendedAction: string;
    };

    const actionIssues: ActionIssue[] = priorityResults
      .slice(0, 3)
      .map((result) => {
        const vehicle = result.vehicle;
        const board = boards.find((b) => b.key === vehicle.board);
        const stage = board?.stages.find((s) => s.key === vehicle.stage);
        const daysInStage = Math.max(
          0,
          (Date.now() - new Date(vehicle.stage_entered_at).getTime()) / 86400000
        );

        return {
          title: vehicleShortLabel(vehicle),
          badge: `${daysInStage.toFixed(1)} Days`,
          sublabel: `${board?.label ?? vehicle.board}${stage ? ` — ${stage.label}` : ''}`,
          cost: carryingCostSoFar(vehicle, newRatePerDay, usedRatePerDay),
          actionLabel: 'View Vehicle',
          vehicleId: vehicle.id,
          board: vehicle.board,
          score: result.score,
          reason: result.reasons[0]?.label ?? 'Highest-priority active vehicle',
          recommendedAction: result.recommendedAction,
        };
      });

    // ── Money Snapshot extras ────────────────────────────────────────────
    const monthlyProjection = blendedDailyRate * mainBoardActive * 30;
    const moneySavedThisMonth = carryingCostChangeVsPrevious !== null && carryingCostChangeVsPrevious < 0 ? -carryingCostChangeVsPrevious : 0;

    // ── How to Save More ─────────────────────────────────────────────────
    // Same underlying data as the Action Center issues above, reframed as
    // a specific action with a dollar estimate attached, instead of just
    // stating the problem and leaving the math to whoever's reading it.
    const waitingVehicles = vehicles.filter(
      (v) => !v.completed && v.title_status === 'waiting' && v.title_status_updated_at
    );

    const saveMoreTips: { icon: string; title: string; text: string; actionLabel?: string; vehicleId?: string; board?: string }[] = [];
    if (bottleneck) {
      const bLabel = boards.find((b) => b.key === bottleneck.board)?.stages.find((s) => s.key === bottleneck.stage)?.label ?? bottleneck.stage;
      const count = stageImpact.find((s) => s.key === bottleneck.stage)?.waitingCount ?? 0;
      if (count > 0) {
        saveMoreTips.push({
          icon: '⏱️',
          title: `Reduce ${bLabel} Time`,
          text: `If ${bLabel} averaged 1 day faster, that's about $${(count * blendedDailyRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}/month.`,
          actionLabel: `View ${bLabel}`,
          vehicleId: vehicles.find((v) => !v.completed && v.board === bottleneck.board && v.stage === bottleneck.stage)?.id,
          board: bottleneck.board,
        });
      }
    }
    if (waitingVehicles.length > 0) {
      saveMoreTips.push({
        icon: '📄',
        title: 'Speed Up Titles',
        text: `Clearing ${waitingVehicles.length} pending title${waitingVehicles.length === 1 ? '' : 's'} could save about $${(waitingVehicles.length * blendedDailyRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}/month.`,
        actionLabel: 'View title vehicle',
        vehicleId: waitingVehicles[0]?.id,
        board: waitingVehicles[0]?.board,
      });
    }
    const secondStage = stageImpact.filter((s) => s.key !== bottleneck?.stage)[0];
    if (secondStage && secondStage.cost > 1) {
      saveMoreTips.push({
        icon: '📸',
        title: `Watch ${secondStage.label}`,
        text: `${secondStage.waitingCount} vehicle${secondStage.waitingCount === 1 ? '' : 's'} here — about $${secondStage.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })} in current carrying cost.`,
        actionLabel: `View ${secondStage.label}`,
        vehicleId: secondStage.firstVehicleId,
        board: secondStage.firstVehicleBoard,
      });
    }

    // ── Performance Overview extra ───────────────────────────────────────
    const activeStageDays = stageHealth.map((s) => s.avgDays).filter((d): d is number => d !== null);
    const avgStageTime = activeStageDays.length > 0 ? activeStageDays.reduce((a, b) => a + b, 0) / activeStageDays.length : null;

    return {
      currentCounts,
      avgDaysFor,
      bottleneck,
      slowestStage,
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
      opportunityVehicles,
      opportunityByStage,
      targetCarryingCost,
      turnRateImprovementDays,
      estimatedSavingsThisPeriod,
      stageImpact,
      waitingOnTitleCount,
      wins,
      weeklyTrend,
      actionIssues,
      monthlyProjection,
      moneySavedThisMonth,
      saveMoreTips,
      avgStageTime,
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

  const bottleneckDisplay = stats.bottleneck
    ? boards.find((b) => b.key === stats.bottleneck?.board)?.stages.find((s) => s.key === stats.bottleneck?.stage)?.label ?? stats.bottleneck.stage
    : 'No bottleneck';

  const slowestStageDisplay = stats.slowestStage
    ? boards.find((b) => b.key === stats.slowestStage?.board)?.stages.find((s) => s.key === stats.slowestStage?.stage)?.label ?? stats.slowestStage.stage
    : '';

  const turnTrend =
    stats.avgTurnTime !== null && stats.previousAvgTurnTime !== null
      ? stats.previousAvgTurnTime - stats.avgTurnTime
      : null;

  const simulatorValue = simulatedTurnRate ?? stats.avgTurnTime ?? 0;
  const simulatorImpact =
    simulatedTurnRate !== null && stats.avgTurnTime !== null
      ? (simulatedTurnRate - stats.avgTurnTime) * stats.blendedDailyRate * stats.completedInRange
      : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#F6F8FC]">
      <header className="flex-shrink-0 bg-ink text-white">
        <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mist">Analytics</p>
              <h1 className="font-display text-xl font-bold leading-tight">Mission Control</h1>
              <p className="mt-0.5 text-xs text-mist">{dealershipName}</p>
            </div>
            <button onClick={onClose} className="rounded-full bg-signal-blue px-3 py-2 text-xs font-semibold text-white shadow-sm">
              ← Main Board
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-mist">
            {refreshing && <span>Refreshing…</span>}
            <button onClick={() => load(false)} disabled={refreshing} className="hover:text-white disabled:opacity-50">↻ Refresh</button>
            <button onClick={() => setShowRateSettings((v) => !v)} className="hover:text-white">$ Rates</button>
            <button onClick={handleExportPDF} className="hover:text-white">⇩ Export PDF</button>
          </div>
        </div>
      </header>

      {showRateSettings && (
        <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto grid max-w-[900px] gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="text-xs font-medium text-ink">New ($/day)
              <input type="number" min="0" step="0.01" value={newRateInput} onChange={(e) => setNewRateInput(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-medium text-ink">Used ($/day)
              <input type="number" min="0" step="0.01" value={usedRateInput} onChange={(e) => setUsedRateInput(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <button onClick={handleSaveRates} disabled={savingRates} className="rounded-lg bg-signal-blue px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {savingRates ? 'Saving…' : 'Save rates'}
            </button>
          </div>
        </div>
      )}

      <div className="flex-shrink-0 border-b border-gray-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1500px] gap-2 overflow-x-auto px-4 py-3 sm:px-6">
          {RANGE_OPTIONS.map((opt) => (
            <button key={opt.key} onClick={() => setRange(opt.key)} className={`rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap ${range === opt.key ? 'bg-signal-blue text-white shadow-sm' : 'bg-asphalt text-steel'}`}>
              {opt.label}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="mx-auto flex max-w-[1500px] gap-2 px-4 pb-3 sm:px-6">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
        )}
      </div>

      {loading ? (
        <p className="p-6 text-sm text-steel">Loading Mission Control…</p>
      ) : (
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1500px] space-y-5 px-4 py-5 sm:px-6 lg:py-6">
            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-2xl bg-gradient-to-br from-[#163B9F] to-signal-blue p-5 text-white shadow-lift md:col-span-2 xl:col-span-1">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-100">Turn Rate</p>
                  {turnTrend !== null && Math.abs(turnTrend) >= 0.1 && <span className={`text-xs font-semibold ${turnTrend > 0 ? 'text-emerald-200' : 'text-red-200'}`}>{turnTrend > 0 ? '↓' : '↑'} {Math.abs(turnTrend).toFixed(1)}d</span>}
                </div>
                <div className="mx-auto mt-2 max-w-[230px]"><TurnRateGauge value={simulatorValue} yellowDays={yellowDays} redDays={redDays} /></div>
                <p className="-mt-2 text-center font-display text-4xl font-bold">{formatDays(simulatorValue)}</p>
                <p className="text-center text-xs text-blue-100">{simulatedTurnRate === null ? 'Current average' : 'What-if turn rate'}</p>
                <div className="mt-4 border-t border-white/20 pt-3">
                  <input type="range" min={0} max={14} step={0.5} value={simulatorValue} onChange={(e) => setSimulatedTurnRate(parseFloat(e.target.value))} className="w-full accent-white" aria-label="Simulated turn rate" />
                  <div className="mt-1 flex justify-between text-[10px] text-blue-100"><span>0 days</span><span>Drag to test savings</span><span>14 days</span></div>
                  {simulatorImpact !== null && (
                    <div className={`mt-3 rounded-xl px-3 py-2 text-center text-sm font-semibold ${simulatorImpact < 0 ? 'bg-emerald-400/20 text-emerald-100' : simulatorImpact > 0 ? 'bg-red-400/20 text-red-100' : 'bg-white/10 text-white'}`}>
                      {Math.abs(simulatorImpact) < 1 ? 'About the same as today' : `≈ $${Math.abs(simulatorImpact).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${simulatorImpact < 0 ? 'saved' : 'added'} this period`}
                    </div>
                  )}
                  {simulatedTurnRate !== null && <button onClick={() => setSimulatedTurnRate(null)} className="mt-2 w-full text-center text-xs text-blue-100 underline">Reset to current</button>}
                </div>
              </div>

              <div className="rounded-2xl bg-[#16244A] p-5 text-white shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-200">Active Carrying Cost</p>
                <p className="mt-4 font-display text-4xl font-bold">${stats.totalCarryingCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                <p className="mt-1 text-sm text-blue-100">${stats.blendedDailyRate.toFixed(0)} average per vehicle/day</p>
                <div className="mt-5 rounded-xl bg-white/10 p-3"><p className="text-[11px] text-blue-100">Opportunity beyond target</p><p className="font-display text-2xl font-bold text-white">${stats.opportunityAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p></div>
              </div>

              <div className="rounded-2xl bg-[#1D356D] p-5 text-white shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-200">Vehicles In Process</p>
                <p className="mt-4 font-display text-4xl font-bold">{stats.mainBoardActive}</p>
                <p className="mt-1 text-sm text-blue-100">Active on Main Board</p>
                <div className="mt-5 space-y-2 text-sm"><div className="flex justify-between"><span className="text-blue-100">Added</span><b>{stats.addedInRange}</b></div><div className="flex justify-between"><span className="text-blue-100">Aging red</span><b className={stats.agingRedCount ? 'text-red-200' : ''}>{stats.agingRedCount}</b></div></div>
              </div>

              <div className="rounded-2xl bg-[#21417F] p-5 text-white shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-200">Completions</p>
                <p className="mt-4 font-display text-4xl font-bold">{stats.completedInRange}</p>
                <p className="mt-1 text-sm text-blue-100">This selected period</p>
                <div className="mt-5 rounded-xl bg-emerald-400/15 p-3"><p className="text-[11px] text-emerald-100">Average stage time</p><p className="font-display text-2xl font-bold">{formatDays(stats.avgStageTime)}</p></div>
              </div>

              <div className="rounded-2xl bg-[#2A4C90] p-5 text-white shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-100">Current Bottleneck</p>
                <p className="mt-4 font-display text-2xl font-bold">{bottleneckDisplay}</p>
                <p className="mt-1 text-sm text-blue-100">{stats.bottleneck ? `${formatDays(stats.bottleneck.avgDays)} average — over target` : stats.slowestStage ? `${slowestStageDisplay} is slowest at ${formatDays(stats.slowestStage.avgDays)}, but within target` : 'No completed-stage data yet'}</p>
                <button
                  type="button"
                  onClick={() => stats.longestAging && onNavigateToVehicle?.(stats.longestAging.vehicleId, stats.longestAging.board)}
                  disabled={!stats.longestAging || !onNavigateToVehicle}
                  className="mt-5 w-full rounded-xl bg-white/10 p-3 text-left transition hover:bg-white/15 disabled:cursor-default"
                ><p className="text-[11px] text-blue-100">Longest active vehicle</p><p className="truncate text-sm font-semibold">{stats.longestAging?.label ?? 'None'}</p>{stats.longestAging && <p className="mt-1 text-[10px] text-blue-200">Open vehicle →</p>}</button>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(300px,1fr)]">
              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-red">Act Now</p><h2 className="font-display text-xl font-bold text-ink">Action Center</h2><p className="text-xs text-steel">Only the highest-impact items are shown here.</p></div><button onClick={() => setPrioritiesModalOpen(true)} className="text-xs font-semibold text-signal-blue">View all issues →</button></div>
                {stats.actionIssues.length > 0 ? <div className="grid gap-3 md:grid-cols-3">{stats.actionIssues.map((issue, i) => {
                  const severity = issue.score >= 60 ? 'Critical' : issue.score >= 35 ? 'High' : 'Watch';
                  const isCritical = severity === 'Critical';
                  return <article key={issue.vehicleId} className={`flex h-full flex-col rounded-xl border p-4 ${isCritical ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60'}`}><div className="flex items-center justify-between gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${isCritical ? 'bg-red-100 text-signal-red' : 'bg-amber-100 text-amber-700'}`}>{severity} · {issue.score}</span><span className="text-xs font-semibold text-steel">{issue.badge}</span></div><h3 className="mt-3 font-display text-base font-bold text-ink">{issue.title}</h3><p className="mt-1 text-xs text-steel">{issue.sublabel}</p><div className="mt-3 rounded-lg bg-white/70 p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-steel">Why it is here</p><p className="mt-1 text-xs font-medium text-ink">{issue.reason}</p><p className="mt-2 text-xs text-steel">{issue.recommendedAction}</p></div><div className="mt-auto pt-4"><p className="text-xs text-steel">Current carrying cost</p><p className="font-display text-2xl font-bold text-ink">${issue.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p><button onClick={() => onNavigateToVehicle?.(issue.vehicleId, issue.board)} disabled={!onNavigateToVehicle} className="mt-4 w-full rounded-lg border border-signal-blue px-3 py-2 text-xs font-semibold text-signal-blue disabled:opacity-50">{issue.actionLabel}</button></div></article>})}</div> : <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-medium text-emerald-800">Everything is flowing normally. No active vehicles need attention right now.</div>}
              </div>

              <aside className="rounded-2xl bg-gradient-to-br from-[#ECFDF3] to-white p-5 shadow-sm ring-1 ring-emerald-100">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-green">Turn Signal Opportunity Meter™</p>
                    <h2 className="mt-1 font-display text-xl font-bold text-ink">How to Save More</h2>
                  </div>
                  <details className="relative text-right">
                    <summary className="cursor-pointer text-[11px] font-semibold text-signal-green">How it works</summary>
                    <div className="absolute right-0 z-10 mt-2 w-72 rounded-xl bg-white p-3 text-left text-[11px] leading-relaxed text-steel shadow-lift ring-1 ring-emerald-100">
                      <b>Recoverable opportunity</b> equals each active vehicle's days beyond its current-stage target multiplied by that vehicle's dealer-configured daily carrying cost. It excludes vehicles with carrying cost turned off. <b>Estimated savings</b> compares the selected period's turn rate with the immediately preceding equal-length period.
                    </div>
                  </details>
                </div>

                <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-emerald-100">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-steel">Recoverable Opportunity Right Now</p>
                  <p className="mt-1 font-display text-4xl font-bold text-signal-green">${stats.opportunityAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  <p className="mt-1 text-xs text-steel">Excess carrying cost above this dealer's own stage targets.</p>
                </div>

                <div className="mt-3 rounded-2xl bg-[#083A8C] p-4 text-white shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-blue-100">Saved Money Counter</p>
                  <p className="mt-1 font-display text-3xl font-bold">
                    {stats.estimatedSavingsThisPeriod === null
                      ? '—'
                      : `$${stats.estimatedSavingsThisPeriod.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                  </p>
                  <p className="mt-1 text-xs text-blue-100">
                    {stats.estimatedSavingsThisPeriod === null
                      ? 'Not enough comparable turn-rate history yet.'
                      : stats.turnRateImprovementDays && stats.turnRateImprovementDays > 0
                        ? `Estimated saved this period from turning ${stats.completedInRange} vehicle${stats.completedInRange === 1 ? '' : 's'} ${stats.turnRateImprovementDays.toFixed(1)} day${stats.turnRateImprovementDays === 1 ? '' : 's'} faster.`
                        : 'No estimated savings versus the previous period yet.'}
                  </p>
                </div>

                {stats.opportunityVehicles.length > 0 ? (
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-steel">Where the opportunity is</p>
                      <p className="text-[10px] text-steel">Top vehicles</p>
                    </div>
                    <div className="space-y-2">
                      {stats.opportunityVehicles.slice(0, 3).map((item) => (
                        <button
                          type="button"
                          key={item.vehicleId}
                          onClick={() => onNavigateToVehicle?.(item.vehicleId, item.board)}
                          disabled={!onNavigateToVehicle}
                          className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left ring-1 ring-emerald-100 transition hover:-translate-y-0.5 hover:shadow-sm disabled:transform-none disabled:cursor-default"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-ink">{item.label}</p>
                            <p className="mt-0.5 text-[11px] text-steel">{item.stageLabel} · {item.daysOverTarget.toFixed(1)} days over target · ${item.dailyRate}/day</p>
                          </div>
                          <div className="text-right">
                            <p className="font-display text-lg font-bold text-signal-green">${item.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                            <p className="text-[10px] font-semibold text-signal-blue">Open →</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
                    No active vehicles are currently beyond their configured stage targets.
                  </div>
                )}

                {stats.opportunityByStage.length > 0 && (
                  <div className="mt-4 border-t border-emerald-100 pt-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-steel">Opportunity by stage</p>
                    <div className="mt-2 space-y-2">
                      {stats.opportunityByStage.slice(0, 3).map((stage) => (
                        <button
                          type="button"
                          key={`${stage.board}-${stage.stage}`}
                          onClick={() => onNavigateToVehicle?.(stage.firstVehicleId, stage.board)}
                          disabled={!onNavigateToVehicle}
                          className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left disabled:cursor-default"
                        >
                          <span className="text-xs text-steel">{stage.label} · {stage.vehicleCount} vehicle{stage.vehicleCount === 1 ? '' : 's'}</span>
                          <span className="text-xs font-bold text-ink">${stage.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            </section>

            {stats.stageImpact.length > 0 && <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-signal-blue">Performance</p><h2 className="font-display text-xl font-bold text-ink">Stage Health</h2><p className="text-xs text-steel">See the workflow from left to right and find where inventory is slowing.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{stats.stageImpact.map((s) => { const vsTarget = s.differenceDays; return <div key={s.key} className={`rounded-xl border p-4 ${s.indicator === 'red' ? 'border-red-200 bg-red-50/50' : s.indicator === 'yellow' ? 'border-amber-200 bg-amber-50/50' : 'border-emerald-200 bg-emerald-50/40'}`}><div className="flex items-center justify-between"><span className={`h-2.5 w-2.5 rounded-full ${s.indicator === 'red' ? 'bg-signal-red' : s.indicator === 'yellow' ? 'bg-signal-amber' : 'bg-signal-green'}`} /><span className="text-xs font-semibold text-steel">{s.waitingCount} waiting</span></div><h3 className="mt-3 font-display font-bold text-ink">{s.label}</h3><p className="mt-2 font-display text-2xl font-bold text-ink">{formatDays(s.avgDays)}</p><p className={`text-xs font-semibold ${vsTarget === null ? 'text-steel' : vsTarget > 0 ? 'text-signal-red' : 'text-signal-green'}`}>{vsTarget === null ? 'No target comparison' : `${vsTarget > 0 ? '+' : ''}${vsTarget.toFixed(1)} days vs target`}</p><div className="mt-3 border-t border-black/5 pt-3"><p className="text-[10px] uppercase tracking-wide text-steel">Carrying cost impact</p><p className="font-display text-lg font-bold text-ink">${s.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p></div></div>})}</div></section>}

            <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
              <div className="min-w-0"><div className="mb-2"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-600">Trends</p><h2 className="font-display text-xl font-bold text-ink">Performance Over Time</h2></div><CompletionsTrendChart data={stats.weeklyTrend} /></div>
              <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-3 flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-steel">Deep Dive</p><h2 className="font-display text-xl font-bold text-ink">Operational Details</h2><p className="mt-1 text-xs text-steel">Every configured Main Board stage is shown in board order, including empty stages.</p></div><details className="text-right"><summary className="cursor-pointer text-[11px] font-semibold text-signal-blue">How calculations work</summary><div className="mt-2 max-w-xs rounded-lg bg-asphalt p-3 text-left text-[11px] leading-relaxed text-steel"><b>Now</b> is the live active count. <b>Avg time</b> uses completed stage stays in the selected period, with live time used when available. <b>Target</b> is this dealership's red aging threshold. <b>Current carrying cost</b> is the cost accumulated by active vehicles currently in that stage.</div></details></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wide text-steel"><th className="py-2">Stage</th><th className="py-2 text-right">Active now</th><th className="py-2 text-right">Avg time</th><th className="py-2 text-right">Target</th><th className="py-2 text-right">Difference</th><th className="py-2 text-right">Current carrying cost</th></tr></thead><tbody>{stats.stageImpact.map((s) => <tr key={s.key} className="border-b border-gray-100 last:border-0"><td className="py-3 font-medium text-ink">{s.label}</td><td className="py-3 text-right text-steel">{s.waitingCount}</td><td className="py-3 text-right text-steel">{formatDays(s.avgDays)}</td><td className="py-3 text-right text-steel">{s.targetDays === null ? 'Not tracked' : formatDays(s.targetDays)}</td><td className={`py-3 text-right font-semibold ${s.differenceDays === null ? 'text-steel' : s.differenceDays > 0 ? 'text-signal-red' : 'text-signal-green'}`}>{s.differenceDays === null ? '—' : Math.abs(s.differenceDays) < 0.05 ? 'On target' : `${Math.abs(s.differenceDays).toFixed(1)} day${Math.abs(s.differenceDays) === 1 ? '' : 's'} ${s.differenceDays > 0 ? 'over' : 'under'}`}</td><td className="py-3 text-right font-semibold text-ink">${s.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td></tr>)}</tbody></table></div>{stats.boardWatchItems.length > 0 && <div className="mt-5 border-t border-gray-100 pt-4"><h3 className="font-display text-sm font-bold text-ink">Board Watch</h3><div className="mt-2 space-y-2">{stats.boardWatchItems.slice(0, 5).map((item, i) => <button type="button" key={`${item.vehicleId}-${i}`} onClick={() => onNavigateToVehicle?.(item.vehicleId, item.board)} disabled={!onNavigateToVehicle} className="flex w-full items-start gap-2 rounded-lg bg-asphalt px-3 py-2 text-left text-xs text-steel transition hover:bg-gray-200"><span>{item.emoji}</span><span className="flex-1">{item.text}</span><span className="font-semibold text-signal-blue">Open →</span></button>)}</div></div>}</div>
            </section>

            <p className="pb-3 text-center text-[10px] text-steel">Estimates use this dealership's configured rates: ${usedRatePerDay}/day used and ${newRatePerDay}/day new. Savings are estimates, not guarantees.</p>
          </div>
        </main>
      )}

      {prioritiesModalOpen && <TodaysPrioritiesModal priorities={stats.todaysPriorities} boards={boards} newRatePerDay={newRatePerDay} usedRatePerDay={usedRatePerDay} onClose={() => setPrioritiesModalOpen(false)} onNavigateToVehicle={onNavigateToVehicle} />}
    </div>
  );
}
