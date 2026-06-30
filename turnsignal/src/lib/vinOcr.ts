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

function cleanLine(rawLine: string): string {
  return rawLine.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Pulls every possible 17-character window out of runs of 17+ valid
// characters within a SINGLE line of text. Deliberately operates one line
// at a time, never across line breaks — concatenating separate physical
// rows together before scanning is exactly what let a neighboring line's
// text corrupt the real VIN read in earlier versions of this scanner.
function findCandidatesInLine(line: string): string[] {
  const cleaned = cleanLine(line);
  const runs = cleaned.match(VALID_RUN_PATTERN) ?? [];
  const candidates: string[] = [];
  for (const run of runs) {
    for (let i = 0; i + 17 <= run.length; i++) {
      candidates.push(run.slice(i, i + 17));
    }
  }
  return candidates;
}

async function recognizeLines(imageDataUrl: string, mode: PSM): Promise<string[]> {
  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_pageseg_mode: mode,
    tessedit_char_whitelist: VIN_CHARS,
  });
  const result = await worker.recognize(imageDataUrl);
  await worker.terminate();
  // Splitting the combined text output on real line breaks is a reliable,
  // version-independent way to get per-row text — it doesn't depend on
  // Tesseract.js's internal hierarchical block/line API shape.
  return (result.data.text ?? '').split(/\r?\n/).filter((l) => l.trim().length > 0);
}

export async function extractVinFromImage(
  imageDataUrl: string
): Promise<{ vin: string | null; verified: boolean }> {
  const allCandidates: string[] = [];

  // PSM.AUTO treats the photo as a genuine multi-line page and segments it
  // into separate rows on its own — this is the real fix for "near miss"
  // framing: forcing a single-line read onto a photo that, the instant
  // framing isn't pixel-perfect, contains slivers of the row above or
  // below corrupts the whole read by jumbling two rows into one string.
  // Scanning each detected row separately means a stray neighboring line
  // of sticker text can no longer bleed into the real VIN line.
  for (const mode of [PSM.AUTO, PSM.SPARSE_TEXT]) {
    const lines = await recognizeLines(imageDataUrl, mode);
    for (const line of lines) {
      allCandidates.push(...findCandidatesInLine(line));
    }
    // A checksum-valid match already turned up — no need to run the
    // second, slower pass too.
    if (allCandidates.some(isValidVinChecksum)) break;
  }

  const validated = allCandidates.find(isValidVinChecksum);
  if (validated) return { vin: validated, verified: true };

  // No checksum-valid match, but at least one full, real 17-character run
  // of valid VIN characters was found on some line — hand that back
  // flagged as unverified rather than nothing.
  if (allCandidates.length > 0) {
    return { vin: allCandidates[0], verified: false };
  }

  // Nothing resembling a complete 17-character VIN was found anywhere in
  // the photo. Deliberately return nothing here rather than a handful of
  // stray characters — a 3-4 character fragment is worse than no read at
  // all, since it looks like a real answer but isn't one.
  return { vin: null, verified: false };
}
