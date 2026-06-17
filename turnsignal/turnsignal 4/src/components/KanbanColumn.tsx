import { StageConfig } from '../lib/boards';
import { Vehicle } from '../lib/types';
import VehicleCard from './VehicleCard';

export default function KanbanColumn({
  label,
  stageKey,
  allStagesInBoard,
  vehicles,
  onAddClick,
  onMoved,
}: {
  label: string;
  stageKey: string;
  allStagesInBoard: StageConfig[];
  vehicles: Vehicle[];
  onAddClick: () => void;
  onMoved: () => void;
}) {
  const otherStages = allStagesInBoard.filter((s) => s.key !== stageKey);

  return (
    <div className="bg-gray-100 rounded-xl p-3 w-72 flex-shrink-0 flex flex-col max-h-full">
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-ink text-sm">
          {label} <span className="text-steel font-normal">({vehicles.length})</span>
        </p>
        <button
          onClick={onAddClick}
          aria-label={`Add vehicle to ${label}`}
          className="w-7 h-7 rounded-full bg-signal-blue text-white text-lg leading-none flex items-center justify-center"
        >
          +
        </button>
      </div>

      <div className="overflow-y-auto flex-1">
        {vehicles.length === 0 ? (
          <p className="text-steel text-sm py-4 text-center">No vehicles here</p>
        ) : (
          vehicles.map((v) => (
            <VehicleCard key={v.id} vehicle={v} otherStages={otherStages} onMoved={onMoved} />
          ))
        )}
      </div>
    </div>
  );
}
