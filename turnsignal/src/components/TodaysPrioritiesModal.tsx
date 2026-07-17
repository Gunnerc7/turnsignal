import { PriorityResult, vehicleShortLabel } from '../lib/priorityScoring';
import { BoardConfig } from '../lib/boards';
import { carryingCostSoFar } from '../lib/dates';
import ModalCloseButton from './ModalCloseButton';

function locationLabel(v: { board: string; stage: string }, boards: BoardConfig[]): string {
  const b = boards.find((bd) => bd.key === v.board);
  const s = b?.stages.find((st) => st.key === v.stage);
  return b ? `${b.label}${s ? ` · ${s.label}` : ''}` : v.board;
}

export default function TodaysPrioritiesModal({
  priorities,
  boards,
  newRatePerDay,
  usedRatePerDay,
  onClose,
  onNavigateToVehicle,
}: {
  priorities: PriorityResult[];
  boards: BoardConfig[];
  newRatePerDay: number;
  usedRatePerDay: number;
  onClose: () => void;
  onNavigateToVehicle?: (vehicleId: string, board: string) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md modal-h-85 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="font-display text-lg font-semibold text-ink">Today's Priorities</h2>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {priorities.map((p, i) => {
            const cost = carryingCostSoFar(p.vehicle, newRatePerDay, usedRatePerDay);
            return (
              <button
                key={p.vehicle.id}
                onClick={() => {
                  onNavigateToVehicle?.(p.vehicle.id, p.vehicle.board);
                  onClose();
                }}
                disabled={!onNavigateToVehicle}
                className="w-full text-left border border-gray-200 rounded-lg p-3 hover:bg-asphalt disabled:hover:bg-transparent"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-steel mb-0.5">#{i + 1} · {locationLabel(p.vehicle, boards)}</p>
                    <p className="font-display font-semibold text-ink truncate">{vehicleShortLabel(p.vehicle)}</p>
                  </div>
                  <div className="flex-shrink-0 w-11 h-11 rounded-full bg-ink text-white flex items-center justify-center">
                    <span className="font-display font-bold text-sm tabular">{p.score}</span>
                  </div>
                </div>
                <p className="text-xs text-steel mt-1.5">
                  {p.reasons.map((r) => r.label).join(' · ') || 'No contributing factors'}
                  {cost > 0 && ` · $${cost.toLocaleString(undefined, { maximumFractionDigits: 0 })} carrying cost`}
                </p>
                <p className="text-xs text-signal-blue font-medium mt-1">→ {p.recommendedAction}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
