import { createWorker, PSM } from 'tesseract.js';

// VINs use 0-9 and A-Z, but never I, O, or Q — those are excluded from the
// standard specifically because they're too easy to confuse with 1 and 0.
const VIN_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
const VIN_PATTERN = new RegExp(`[${VIN_CHARS}]{17}`);

export async function extractVinFromImage(imageDataUrl: string): Promise<string | null> {
  const worker = await createWorker('eng');

  // Telling Tesseract this is one line of VIN-style characters — not a full
  // page of mixed text — makes a real difference in accuracy.
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_LINE,
    tessedit_char_whitelist: VIN_CHARS,
  });

  const result = await worker.recognize(imageDataUrl);
  await worker.terminate();

  const cleaned = result.data.text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = cleaned.match(VIN_PATTERN);
  if (match) return match[0];

  // No clean 17-character match — still hand back whatever was read so
  // there's something to start correcting instead of an empty field.
  return cleaned.length > 0 ? cleaned.slice(0, 17) : null;
}
