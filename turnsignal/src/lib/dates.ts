// Midnight-to-midnight day counting — the same definition of "a day" used
// everywhere in the app (the aging badge, and now carrying cost too), so
// these can never quietly disagree with each other.
export function daysSince(dateStr: string): number {
  const entered = new Date(dateStr);
  const enteredMidnight = new Date(entered.getFullYear(), entered.getMonth(), entered.getDate());
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const diffMs = todayMidnight.getTime() - enteredMidnight.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function carryingCostSoFar(
  createdAt: string,
  isNew: boolean,
  newRatePerDay: number,
  usedRatePerDay: number
): number {
  const days = daysSince(createdAt);
  const rate = isNew ? newRatePerDay : usedRatePerDay;
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
