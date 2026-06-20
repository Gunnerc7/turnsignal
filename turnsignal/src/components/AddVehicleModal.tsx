import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { decodeVin } from '../lib/vinDecode';
import VinScanner from './VinScanner';

export default function AddVehicleModal({
  dealershipId,
  board,
  stage,
  onClose,
  onCreated,
}: {
  dealershipId: string;
  board: string;
  stage: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [vin, setVin] = useState('');
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [trim, setTrim] = useState('');
  const [stockNumber, setStockNumber] = useState('');
  const [mileage, setMileage] = useState('');
  const [decoding, setDecoding] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function runDecode(vinToDecode: string) {
    setError(null);
    setDecoding(true);
    const result = await decodeVin(vinToDecode);
    setDecoding(false);

    if (!result) {
      setError("Couldn't decode that VIN — double check it, or fill in the details manually.");
      return;
    }
    setYear(result.year ? String(result.year) : '');
    setMake(result.make);
    setModel(result.model);
    setTrim(result.trim);
  }

  function handleScan(text: string) {
    setScannerOpen(false);
    setVin(text);
    runDecode(text);
  }

  async function handleSubmit() {
    if (!mileage.trim()) {
      setError('Mileage is required.');
      return;
    }

    setSaving(true);
    setError(null);

    const now = new Date().toISOString();
    const startsRecon = stage !== 'inbound_trade_in';

    const { data: created, error: insertError } = await supabase
      .from('vehicles')
      .insert({
        dealership_id: dealershipId,
        board,
        stage,
        stage_entered_at: now,
        recon_started_at: startsRecon ? now : null,
        vin: vin.trim() || null,
        year: year ? parseInt(year, 10) : null,
        make: make.trim() || null,
        model: model.trim() || null,
        trim: trim.trim() || null,
        stock_number: stockNumber.trim() || null,
        mileage: parseInt(mileage, 10),
      })
      .select()
      .single();

    if (!insertError && created) {
      await supabase.from('stage_history').insert({
        vehicle_id: created.id,
        board,
        stage,
        entered_at: now,
      });
    }

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }
    onCreated();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-ink">Add vehicle</h2>
          <button onClick={onClose} className="text-steel text-sm">
            Close
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">VIN</label>
            <div className="flex gap-2">
              <input
                value={vin}
                onChange={(e) => setVin(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-base"
                placeholder="17-character VIN"
                maxLength={17}
              />
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="px-3 rounded-lg bg-ink text-white text-sm font-medium"
              >
                Scan
              </button>
            </div>
            <button
              type="button"
              disabled={vin.length !== 17 || decoding}
              onClick={() => runDecode(vin)}
              className="mt-2 text-sm text-signal-blue font-medium disabled:text-gray-400"
            >
              {decoding ? 'Decoding…' : 'Decode VIN'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Year</label>
              <input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Make</label>
              <input
                value={make}
                onChange={(e) => setMake(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Model</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Trim</label>
              <input
                value={trim}
                onChange={(e) => setTrim(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">Stock number (optional)</label>
            <input
              value={stockNumber}
              onChange={(e) => setStockNumber(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">Mileage *</label>
            <input
              type="number"
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
            />
          </div>

          {error && <p className="text-signal-red text-sm">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full bg-signal-blue text-white font-semibold rounded-lg py-2.5 disabled:opacity-60"
          >
            {saving ? 'Adding…' : 'Add vehicle'}
          </button>
        </div>
      </div>

      {scannerOpen && <VinScanner onScan={handleScan} onClose={() => setScannerOpen(false)} />}
    </div>
  );
}
