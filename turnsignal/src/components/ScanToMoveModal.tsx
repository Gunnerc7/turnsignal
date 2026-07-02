import { useState } from 'react';
import { scanVin } from '../lib/vinOcr';
import { moveVehicleToStage } from '../lib/moveVehicle';
import { BoardConfig } from '../lib/boards';
import { Vehicle } from '../lib/types';
import VinPhotoCapture from './VinPhotoCapture';
import ModalCloseButton from './ModalCloseButton';

function vehicleLabel(v: Vehicle): string {
  return `${v.stock_number ? v.stock_number + '-' : ''}${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''}`.trim();
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
  const [cameraOpen, setCameraOpen] = useState(true);
  const [phase, setPhase] = useState<'looking' | 'found' | 'error'>('looking');
  const [matchedVehicle, setMatchedVehicle] = useState<Vehicle | null>(null);
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

    // Matching against an existing VIN string exactly is itself strong
    // confirmation the scan is correct, on top of whatever the checksum
    // already told us — a wrong read is very unlikely to coincidentally
    // match a real VIN already in the system.
    const match = vehicles.find(
      (v) => !v.completed && v.vin && v.vin.toUpperCase() === detected.toUpperCase()
    );

    if (match) {
      setMatchedVehicle(match);
      setPhase('found');
    } else {
      // Not in the system yet — hand off to Add Vehicle with the VIN
      // already confirmed, defaulting to Inbound/Trade-In since scanning
      // an unrecognized VIN almost always means it's a fresh arrival.
      onNotFound(detected);
      onClose();
    }
  }

  async function handleMove(boardKey: string, stageKey: string) {
    if (!matchedVehicle) return;
    setMoving(`${boardKey}::${stageKey}`);
    await moveVehicleToStage(matchedVehicle.id, boardKey, stageKey);
    setMoving(null);
    onMoved();
    onClose();
  }

  function retry() {
    setErrorMsg('');
    setPhase('looking');
    setCameraOpen(true);
  }

  if (cameraOpen) {
    return <VinPhotoCapture onCapture={handleCapture} onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="font-display text-lg font-semibold text-ink">Scan to move</h2>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {phase === 'looking' && <p className="text-steel text-sm">Reading VIN…</p>}

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
