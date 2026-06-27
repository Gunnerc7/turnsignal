import { createWorker, PSM } from 'tesseract.js';

// VINs use 0-9 and A-Z, but never I, O, or Q — those are excluded from the
// standard specifically because they're too easy to confuse with 1 and 0.
const VIN_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
const VALID_RUN_PATTERN = new RegExp(`[${VIN_CHARS}]{17,}`, 'g');

// Every North American VIN has a built-in check digit at position 9,
// defined by NHTSA (49 CFR Part 565) and ISO 3779. It's a real checksum —
// computing it lets us actually verify a scanned VIN is internally
// consistent, not just "17 characters from the right alphabet."
const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function isValidVinChecksum(vin: string): boolean {
  if (vin.length !== 17) return false;

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i];
    let value: number;
    if (ch >= '0' && ch <= '9') value = Number(ch);
    else if (ch in TRANSLITERATION) value = TRANSLITERATION[ch];
    else return false;
    sum += value * WEIGHTS[i];
  }

  const remainder = sum % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);
  return vin[8] === expected;
}

function cleanText(rawText: string): string {
  return rawText.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Pulls every possible 17-character window out of runs of 17+ valid
// characters in a row. Real photos often DON'T produce one unbroken clean
// run — this only covers the cases where one exists; the lenient fallback
// below covers everything else.
function findCandidatesFromCleanRuns(cleaned: string): string[] {
  const runs = cleaned.match(VALID_RUN_PATTERN) ?? [];
  const candidates: string[] = [];
  for (const run of runs) {
    for (let i = 0; i + 17 <= run.length; i++) {
      candidates.push(run.slice(i, i + 17));
    }
  }
  return candidates;
}

async function recognizeWithMode(imageDataUrl: string, mode: PSM): Promise<string> {
  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_pageseg_mode: mode,
    tessedit_char_whitelist: VIN_CHARS,
  });
  const result = await worker.recognize(imageDataUrl);
  await worker.terminate();
  return result.data.text;
}

export async function extractVinFromImage(
  imageDataUrl: string
): Promise<{ vin: string | null; verified: boolean }> {
  // Always run both passes — RAW_LINE skips some of Tesseract's internal
  // text-line heuristics, which can be exactly what causes characters to
  // get silently dropped or misread on SINGLE_LINE.
  const firstCleaned = cleanText(await recognizeWithMode(imageDataUrl, PSM.SINGLE_LINE));
  const secondCleaned = cleanText(await recognizeWithMode(imageDataUrl, PSM.RAW_LINE));

  const allCandidates = [
    ...findCandidatesFromCleanRuns(firstCleaned),
    ...findCandidatesFromCleanRuns(secondCleaned),
  ];

  // Prefer anything that actually passes the official checksum.
  const validated = allCandidates.find(isValidVinChecksum);
  if (validated) return { vin: validated, verified: true };

  // Nothing passed the checksum, but at least one full 17-character run
  // was found — hand back the first one, flagged as unverified.
  if (allCandidates.length > 0) {
    return { vin: allCandidates[0], verified: false };
  }

  // No clean 17-character run from either pass at all — fall back to
  // whichever attempt read more usable characters, so there's still a
  // real starting point to correct instead of a dead end.
  const best = secondCleaned.length > firstCleaned.length ? secondCleaned : firstCleaned;
  return { vin: best.length > 0 ? best.slice(0, 17) : null, verified: false };
}
