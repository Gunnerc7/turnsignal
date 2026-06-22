import { createWorker, PSM } from 'tesseract.js';

// VINs use 0-9 and A-Z, but never I, O, or Q — those are excluded from the
// standard specifically because they're too easy to confuse with 1 and 0.
const VIN_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
const VIN_PATTERN = new RegExp(`[${VIN_CHARS}]{17}`);

async function recognizeWithMode(imageDataUrl: string, mode: PSM): Promise<string> {
  const worker = await createWorker('eng');
  await worker.setParameters({
    tessedit_pageseg_mode: mode,
    tessedit_char_whitelist: VIN_CHARS,
  });
  const result = await worker.recognize(imageDataUrl);
  await worker.terminate();
  return result.data.text.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export async function extractVinFromImage(imageDataUrl: string): Promise<string | null> {
  const firstPass = await recognizeWithMode(imageDataUrl, PSM.SINGLE_LINE);
  const firstMatch = firstPass.match(VIN_PATTERN);
  if (firstMatch) return firstMatch[0];

  // SINGLE_LINE didn't land on a clean 17 characters — RAW_LINE skips some
  // of Tesseract's internal text-line heuristics, which can be exactly
  // what causes characters to get silently dropped rather than misread.
  const secondPass = await recognizeWithMode(imageDataUrl, PSM.RAW_LINE);
  const secondMatch = secondPass.match(VIN_PATTERN);
  if (secondMatch) return secondMatch[0];

  // Neither pass found a clean 17-character run — hand back whichever
  // attempt read more characters, so there's a real starting point to
  // correct instead of an empty field.
  const best = secondPass.length > firstPass.length ? secondPass : firstPass;
  return best.length > 0 ? best.slice(0, 17) : null;
}
