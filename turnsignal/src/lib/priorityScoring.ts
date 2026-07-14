import { getThresholds } from './aging';
import { carryingCostSoFar, CarryingCostInput } from './dates';

// A vehicle's Priority Score is built entirely from real, currently-known
// facts — no AI, no model, nothing a manager can't verify by hand. Every
// point awarded is paired with the exact reason it was awarded, and the
// six factors are each capped so their maximum possible total is exactly
// 100 — that ceiling is deliberate, so "out of 100" always means something
// real rather than an arbitrary scale.
//
// Point caps, at a glance:
//   Days over the aging target        up to 25
//   Carrying cost above average       up to 20
//   Days stuck in the current stage   up to 15
//   Total time in recon so far        up to 15
//   Waiting on title                        10
//   Loaner overdue                          15
//                                     ─────────
//                                          100

export type PriorityVehicleInput = {
  id: string;
  board: string;
  stage: string;
  stage_entered_at: string;
  recon_started_at: string | null;
  completed: boolean;
  completed_at: string | null;
  is_new: boolean;
  created_at: string;
  title_status: 'has_title' | 'poa' | 'waiting' | null;
  loaner_return_date: string | null;
  loaner_track_carrying_cost: boolean;
  carrying_cost_excluded: boolean;
  stock_number: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
};

export type PriorityReason = { label: string; points: number };

export type PriorityResult = {
  vehicle: PriorityVehicleInput;
  score: number;
  reasons: PriorityReason[];
  recommendedAction: string;
};

export function vehicleShortLabel(v: PriorityVehicleInput): string {
  return `${v.stock_number ? v.stock_number + '-' : ''}${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.trim();
}

function toCarryingCostInput(v: PriorityVehicleInput): CarryingCostInput {
  return {
    board: v.board,
    created_at: v.created_at,
    recon_started_at: v.recon_started_at,
    is_new: v.is_new,
    completed: v.completed,
    completed_at: v.completed_at,
    loaner_track_carrying_cost: v.loaner_track_carrying_cost,
    carrying_cost_excluded: v.carrying_cost_excluded,
  };
}

export function computePriorityScores(
  activeVehicles: PriorityVehicleInput[],
  yellowDays: number,
  redDays: number,
  newRatePerDay: number,
  usedRatePerDay: number
): PriorityResult[] {
  if (activeVehicles.length === 0) return [];

  // Two dealership-wide reference points every vehicle is compared
  // against — recomputed fresh from today's actual active vehicles every
  // time, never a fixed or fabricated benchmark.
  const carryingCosts = activeVehicles.map((v) =>
    carryingCostSoFar(toCarryingCostInput(v), newRatePerDay, usedRatePerDay)
  );
  const avgCarryingCost = carryingCosts.reduce((a, b) => a + b, 0) / carryingCosts.length;

  const reconDaysList = activeVehicles.map((v) => {
    const anchor = v.recon_started_at ?? v.stage_entered_at;
    return (Date.now() - new Date(anchor).getTime()) / 86400000;
  });
  const longestReconDays = Math.max(...reconDaysList, 0.01); // guards against divide-by-zero

  const results = activeVehicles.map((v, i) => {
    const reasons: PriorityReason[] = [];
    const reconDays = reconDaysList[i];
    const daysInStage = (Date.now() - new Date(v.stage_entered_at).getTime()) / 86400000;
    const cost = carryingCosts[i];

    // 1. Days over the dealership's own aging target — reuses the exact
    // same threshold logic driving the red aging color on cards, so this
    // can never quietly disagree with what's already shown there.
    const thresholds = getThresholds(v.board, v.stage, yellowDays, redDays);
    if (thresholds) {
      const overBy = reconDays - thresholds.red;
      if (overBy > 0) {
        const pts = Math.min(25, Math.round(overBy * 3));
        if (pts > 0) reasons.push({ label: `${overBy.toFixed(0)} day${overBy >= 2 ? 's' : ''} over the aging target`, points: pts });
      }
    }

    // 2. Carrying cost above the dealership's current average.
    if (avgCarryingCost > 0 && cost > avgCarryingCost) {
      const pts = Math.min(20, Math.round(((cost - avgCarryingCost) / avgCarryingCost) * 20));
      if (pts > 0) reasons.push({ label: 'Carrying cost above dealership average', points: pts });
    }

    // 3. Days sitting in the current stage specifically — distinct from
    // total recon time below, since a vehicle can have a long recon
    // history but only just arrived in its current stage, or vice versa.
    if (daysInStage >= 1) {
      const pts = Math.min(15, Math.round(daysInStage * 1.5));
      if (pts > 0) reasons.push({ label: `${daysInStage.toFixed(0)} day${daysInStage >= 2 ? 's' : ''} in current stage`, points: pts });
    }

    // 4. Total time in recon, scaled against the single longest-active
    // vehicle right now — that vehicle always gets the full 15 points,
    // everything else scales proportionally against it.
    if (reconDays >= 1) {
      const pts = Math.min(15, Math.round((reconDays / longestReconDays) * 15));
      if (pts > 0) reasons.push({ label: `${reconDays.toFixed(0)} total days in recon`, points: pts });
    }

    // 5. Waiting on title.
    if (v.title_status === 'waiting') {
      reasons.push({ label: 'Waiting on title', points: 10 });
    }

    // 6. Loaner overdue.
    if (v.board === 'loaners' && v.loaner_return_date && new Date(v.loaner_return_date) < new Date()) {
      reasons.push({ label: 'Loaner overdue', points: 15 });
    }

    reasons.sort((a, b) => b.points - a.points);
    const score = Math.min(100, reasons.reduce((sum, r) => sum + r.points, 0));

    // One concrete next action — derived from whichever single reason
    // contributed the most points, not a generic catch-all.
    let recommendedAction = 'No immediate action needed.';
    if (reasons.length > 0) {
      const top = reasons[0];
      if (top.label.includes('aging target')) recommendedAction = 'Move to the next stage as soon as possible.';
      else if (top.label.startsWith('Carrying cost')) recommendedAction = 'Prioritize for completion to limit further cost.';
      else if (top.label.includes('current stage')) recommendedAction = "Follow up on why it's stalled in its current stage.";
      else if (top.label.includes('total days')) recommendedAction = 'One of the oldest active vehicles — review its status.';
      else if (top.label === 'Waiting on title') recommendedAction = 'Follow up on title paperwork.';
      else if (top.label === 'Loaner overdue') recommendedAction = 'Contact the customer to recover the loaner.';
    }

    return { vehicle: v, score, reasons, recommendedAction };
  });

  return results.sort((a, b) => b.score - a.score);
}
