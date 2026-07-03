// Midnight-to-midnight day counting — the same definition of "a day" used
// everywhere in the app (the aging badge, and carrying cost too), so these
// can never quietly disagree with each other.
export function daysBetween(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr);
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const end = new Date(endDateStr);
  const endMidnight = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const diffMs = endMidnight.getTime() - startMidnight.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function daysSince(dateStr: string): number {
  return daysBetween(dateStr, new Date().toISOString());
}

export type CarryingCostInput = {
  board: string;
  created_at: string;
  recon_started_at: string | null;
  is_new: boolean;
  completed: boolean;
  completed_at: string | null;
  title_status: 'has_title' | 'poa' | 'waiting' | null;
};

// New: the clock starts when it actually enters Service (or later) —
// recon_started_at is set at exactly that moment, so transit/inbound time
// never counts. Still sitting in Inbound? No cost has started yet.
// Used: the clock starts the moment the card is added — inbound/transit
// time counts on purpose, since that's already "we own it" time.
// Either way, the clock freezes the moment it's marked complete, rather
// than continuing to climb forever. The Loaners board is normally
// excluded entirely — those are vehicles already on the lot, not recon
// inventory accruing holding cost — EXCEPT when title_status is "waiting":
// a loaner that's still waiting on title is genuinely still a real
// carrying cost, not just a car out with a customer, so that specific
// combination is deliberately not excluded.
export function carryingCostSoFar(
  vehicle: CarryingCostInput,
  newRatePerDay: number,
  usedRatePerDay: number
): number {
  if (vehicle.board === 'loaners' && vehicle.title_status !== 'waiting') return 0;

  const startDate = vehicle.is_new ? vehicle.recon_started_at : vehicle.created_at;
  if (!startDate) return 0;

  const endDate = vehicle.completed && vehicle.completed_at ? vehicle.completed_at : new Date().toISOString();
  const days = Math.max(0, daysBetween(startDate, endDate));
  const rate = vehicle.is_new ? newRatePerDay : usedRatePerDay;
  return Math.round(days * rate * 100) / 100;
}

// "Within a model year" — current year or the year before. Used as a
// smart default for the New/Used checkbox when a vehicle's year is known;
// always overridable by hand.
export function suggestIsNew(year: number | null): boolean {
  if (!year) return false;
  const currentYear = new Date().getFullYear();
  return year >= currentYear - 1;
}
