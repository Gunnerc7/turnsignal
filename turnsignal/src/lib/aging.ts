// Inbound/Trade-In is time waiting on pickup or transit — largely out of the
// dealership's control, so it shouldn't carry the same urgency colors as
// stages the team actually controls. The Loaners board is vehicles already
// on the lot, out with customers or managers — not a recon delay, so it
// doesn't get color-coded either, even though it still tracks days.
// Returning null means "track the days, but don't color-code it." Every
// other stage uses the dealership's own configured thresholds.
export function getThresholds(
  board: string,
  stage: string,
  yellowDays: number,
  redDays: number
): { yellow: number; red: number } | null {
  if (stage === 'inbound_trade_in') return null;
  if (board === 'loaners') return null;
  return { yellow: yellowDays, red: redDays };
}

export function isAgingRed(board: string, stage: string, days: number, yellowDays: number, redDays: number): boolean {
  const thresholds = getThresholds(board, stage, yellowDays, redDays);
  return thresholds ? days >= thresholds.red : false;
}
