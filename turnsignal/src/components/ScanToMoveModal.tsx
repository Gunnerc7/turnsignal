import { useState } from 'react';
import { scanVin } from '../lib/vinOcr';
import { moveVehicleToStage } from '../lib/moveVehicle';
import { useAuth } from '../lib/AuthContext';
import { BoardConfig } from '../lib/boards';
import { Vehicle } from '../lib/types';
import VinPhotoCapture from './VinPhotoCapture';
import ModalCloseButton from './ModalCloseButton';

function vehicleLabel(v: Vehicle): string {
  return `${v.stock_number ? v.stock_number + '-' : ''}${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.trim();
}

// How many of the 17 positions differ between two VINs of equal length.
// Used as a tolerant fallback below — even reliable OCR can occasionally
// read a single character differently between two separate photos of the
// same sticker, and an exact-string match alone would silently treat that
// as "not found," even though it's clearly the same vehicle to a human.
function hammingDistance(a: string, b: string): number {
  if (a.length !== 17 || b.length !== 17) return 99;
  let distance = 0;
  for (let i = 0; i < 17; i++) {
    if (a[i] !== b[i]) distance++;
  }
  return distance;
}

export default function ScanToMoveModal({
  boards,
  vehicles,
  onClose,
  onMoved,
  onNotFound,
}: {
  boards: BoardConfig[];
  vehicles: Vehicle[];
  onClose: () => void;
  onMoved: () => void;
  onNotFound: (vin: string) => void;
}) {
  const { session, userName } = useAuth();
  const [cameraOpen, setCameraOpen] = useState(true);
  const [phase, setPhase] = useState<'looking' | 'found' | 'confirm' | 'error'>('looking');
  const [matchedVehicle, setMatchedVehicle] = useState<Vehicle | null>(null);
  const [scannedVin, setScannedVin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [moving, setMoving] = useState<string | null>(null); // "board::stage" currently being moved to

  async function handleCapture(dataUrl: string) {
    setCameraOpen(false);
    setPhase('looking');

    const { vin: detected } = await scanVin(dataUrl);

    if (!detected) {
      setErrorMsg("Couldn't read a VIN clearly — try again with the whole sticker in frame.");
      setPhase('error');
      return;
    }

    const detectedClean = detected.toUpperCase().trim();
    const activeVehicles = vehicles.filter((v) => !v.completed && v.vin);

    // Exact match first — matching against an existing VIN string exactly
    // is itself strong confirmation the scan is correct, on top of
    // whatever the checksum already told us.
    const exact = activeVehicles.find((v) => v.vin!.toUpperCase().trim() === detectedClean);
    if (exact) {
      setMatchedVehicle(exact);
      setPhase('found');
      return;
    }

    // No exact match — check for a close one (off by 1-2 characters) before
    // assuming this is a brand new vehicle. Only acts on it if there's
    // exactly one such close candidate; if two vehicles are both a
    // plausible near-match, that's genuinely ambiguous and guessing wrong
    // would be worse than just asking the person to confirm normally.
    const close = activeVehicles
      .map((v) => ({ vehicle: v, distance: hammingDistance(v.vin!.toUpperCase().trim(), detectedClean) }))
      .filter((c) => c.distance > 0 && c.distance <= 2)
      .sort((a, b) => a.distance - b.distance);

    if (close.length === 1) {
      setMatchedVehicle(close[0].vehicle);
      setScannedVin(detectedClean);
      setPhase('confirm');
      return;
    }

    // Nothing close enough found — hand off to Add Vehicle with the VIN
    // already confirmed, defaulting to Inbound/Trade-In since scanning an
    // unrecognized VIN almost always means it's a fresh arrival.
    onNotFound(detected);
    onClose();
  }

  async function handleMove(boardKey: string, stageKey: string) {
    if (!matchedVehicle) return;
    setMoving(`${boardKey}::${stageKey}`);
    await moveVehicleToStage(matchedVehicle.id, boardKey, stageKey, session?.user.id ?? null, userName);
    setMoving(null);
    onMoved();
    onClose();
  }

  function retry() {
    setErrorMsg('');
    setPhase('looking');
    setCameraOpen(true);
  }

  function handleRejectMatch() {
    onNotFound(scannedVin);
    onClose();
  }

  if (cameraOpen) {
    return <VinPhotoCapture onCapture={handleCapture} onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm modal-h-85 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="font-display text-lg font-semibold text-ink">Scan to move</h2>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {phase === 'looking' && (
            <p className="text-steel text-sm">Reading VIN… this can take a few seconds on a slow connection.</p>
          )}

          {phase === 'error' && (
            <div>
              <p className="text-signal-red text-sm mb-4">{errorMsg}</p>
              <button
                onClick={retry}
                className="w-full bg-signal-blue text-white font-medium rounded-lg py-2.5"
              >
                Try again
              </button>
            </div>
          )}

          {phase === 'confirm' && matchedVehicle && (
            <div>
              <p className="text-sm text-signal-amber font-medium mb-1">Close match — please confirm</p>
              <p className="text-xs text-steel mb-3">
                The scan wasn't a perfect read, but this is very close to a vehicle already on the board.
                Is this it?
              </p>
              <div className="border border-gray-200 rounded-lg p-3 mb-4">
                <p className="font-display font-semibold text-ink">{vehicleLabel(matchedVehicle)}</p>
                <p className="text-xs text-steel mt-1 tabular">On file: {matchedVehicle.vin}</p>
                <p className="text-xs text-steel tabular">Scanned: {scannedVin}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleRejectMatch}
                  className="flex-1 text-sm text-steel border border-gray-300 rounded-lg py-2.5"
                >
                  No, it's new
                </button>
                <button
                  onClick={() => setPhase('found')}
                  className="flex-1 text-sm bg-signal-blue text-white font-medium rounded-lg py-2.5"
                >
                  Yes, that's it
                </button>
              </div>
            </div>
          )}

          {phase === 'found' && matchedVehicle && (
            <div>
              <p className="text-sm text-steel mb-1">Found</p>
              <p className="font-display font-semibold text-ink mb-4">{vehicleLabel(matchedVehicle)}</p>

              <p className="text-xs text-steel uppercase tracking-wide mb-2">Move to</p>
              <div className="space-y-3">
                {boards.map((b) => (
                  <div key={b.key}>
                    <p className="text-xs font-semibold text-steel mb-1.5">{b.label}</p>
                    <div className="flex flex-wrap gap-2">
                      {b.stages.map((s) => {
                        const isCurrent = matchedVehicle.board === b.key && matchedVehicle.stage === s.key;
                        const key = `${b.key}::${s.key}`;
                        return (
                          <button
                            key={s.key}
                            disabled={isCurrent || moving !== null}
                            onClick={() => handleMove(b.key, s.key)}
                            className={`text-sm rounded-full px-3.5 py-2 font-medium transition disabled:opacity-50 ${
                              isCurrent
                                ? 'bg-asphalt text-steel'
                                : 'bg-signal-blue text-white active:scale-95'
                            }`}
                          >
                            {moving === key ? 'Moving…' : isCurrent ? `${s.label} (current)` : s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
