// Runs server-side on Vercel — this is the ONLY place the Google Vision
// API key ever exists. The browser calls this endpoint with just a photo;
// this function calls Google, gets back the text it read, and returns
// only the final { vin, verified } result. The key itself never appears
// anywhere the browser (or anyone using dev tools) could see it.
//
// Uses the classic Vercel Node function signature (req, res) — no extra
// @vercel/node type package needed, and this file lives outside the Vite
// build entirely, so it can't affect `npm run build` for the main app.

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Google Vision API key not configured' });
    return;
  }

  const { image } = req.body ?? {};
  if (!image || typeof image !== 'string') {
    res.status(400).json({ error: 'Missing image' });
    return;
  }

  // Strip the "data:image/jpeg;base64,..." prefix if present — Google
  // Vision wants just the raw base64 bytes, nothing else.
  const base64 = image.includes(',') ? image.split(',')[1] : image;

  try {
    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64 },
              features: [{ type: 'TEXT_DETECTION' }],
            },
          ],
        }),
      }
    );

    const data = await visionRes.json();
    const apiError = data?.responses?.[0]?.error;

    if (!visionRes.ok || apiError) {
      res.status(502).json({ error: apiError?.message ?? 'Google Vision request failed' });
      return;
    }

    const fullText: string = data?.responses?.[0]?.fullTextAnnotation?.text ?? '';
    const lines = fullText.split(/\r?\n/).filter((l: string) => l.trim().length > 0);

    const result = findVinInLines(lines);
    res.status(200).json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? 'Unexpected error calling Google Vision' });
  }
}

// ── Same VIN rules as the on-device scanner (src/lib/vinOcr.ts) ──────────
// Deliberately duplicated here rather than imported: this function is
// built and deployed by Vercel's separate serverless function pipeline,
// not the Vite app build, so keeping it fully self-contained avoids any
// cross-boundary import/bundling issues between the two.

const VIN_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
const VALID_RUN_PATTERN = new RegExp(`[${VIN_CHARS}]{17,}`, 'g');

const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

function isValidVinChecksum(vin: string): boolean {
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

function findCandidatesInLine(line: string): string[] {
  const cleaned = line.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const runs = cleaned.match(VALID_RUN_PATTERN) ?? [];
  const candidates: string[] = [];
  for (const run of runs) {
    for (let i = 0; i + 17 <= run.length; i++) {
      candidates.push(run.slice(i, i + 17));
    }
  }
  return candidates;
}

function findVinInLines(lines: string[]): { vin: string | null; verified: boolean } {
  const allCandidates: string[] = [];
  for (const line of lines) {
    allCandidates.push(...findCandidatesInLine(line));
  }

  const validated = allCandidates.find(isValidVinChecksum);
  if (validated) return { vin: validated, verified: true };

  if (allCandidates.length > 0) {
    return { vin: allCandidates[0], verified: false };
  }

  return { vin: null, verified: false };
}
