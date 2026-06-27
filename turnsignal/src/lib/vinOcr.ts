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

// Pulls every possible 17-character window out of the OCR'd text and
// prefers whichever one actually passes the checksum — this is what lets
// us recover the right answer even when the VIN is embedded in a longer
// run of text (e.g. surrounding sticker clutter that leaked into the crop).
function findBestVinCandidate(rawText: string): string | null {
  const cleaned = rawText.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const runs = cleaned.match(VALID_RUN_PATTERN) ?? [];

  const candidates: string[] = [];
  for (const run of runs) {
    for (let i = 0; i + 17 <= run.length; i++) {
      candidates.push(run.slice(i, i + 17));
    }
  }

  return candidates.find(isValidVinChecksum) ?? candidates[0] ?? null;
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
  const firstPass = await recognizeWithMode(imageDataUrl, PSM.SINGLE_LINE);
  const candidate1 = findBestVinCandidate(firstPass);
  if (candidate1 && isValidVinChecksum(candidate1)) {
    return { vin: candidate1, verified: true };
  }

  // SINGLE_LINE didn't land on a checksum-valid 17 characters — RAW_LINE
  // skips some of Tesseract's internal text-line heuristics, which can be
  // exactly what causes characters to get silently dropped or misread.
  const secondPass = await recognizeWithMode(imageDataUrl, PSM.RAW_LINE);
  const candidate2 = findBestVinCandidate(secondPass);
  if (candidate2 && isValidVinChecksum(candidate2)) {
    return { vin: candidate2, verified: true };
  }

  // Neither pass produced a checksum-valid VIN — hand back the best guess
  // we have, but flagged as unverified so the UI can ask for a double-check
  // instead of silently accepting something that's likely wrong.
  return { vin: candidate1 ?? candidate2, verified: false };
}
