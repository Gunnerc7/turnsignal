import Tesseract from 'tesseract.js';

// VINs use 0-9 and A-Z, but never I, O, or Q — those are excluded from the
// standard specifically because they're too easy to confuse with 1 and 0.
const VIN_PATTERN = /[ABCDEFGHJKLMNPRSTUVWXYZ0-9]{17}/;

export async function extractVinFromImage(imageDataUrl: string): Promise<string | null> {
  const result = await Tesseract.recognize(imageDataUrl, 'eng');
  const cleaned = result.data.text.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = cleaned.match(VIN_PATTERN);
  return match ? match[0] : null;
}
