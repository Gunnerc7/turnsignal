export type DecodedVin = {
  year: number | null;
  make: string;
  model: string;
  trim: string;
};

export async function decodeVin(vin: string): Promise<DecodedVin | null> {
  const cleaned = vin.trim().toUpperCase();
  if (cleaned.length !== 17) return null;

  const res = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${cleaned}?format=json`
  );
  if (!res.ok) return null;

  const data = await res.json();
  const result = data?.Results?.[0];
  if (!result) return null;

  return {
    year: result.ModelYear ? parseInt(result.ModelYear, 10) : null,
    make: result.Make || '',
    model: result.Model || '',
    trim: result.Trim || '',
  };
}
