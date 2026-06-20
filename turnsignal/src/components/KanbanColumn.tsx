import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Vehicle } from '../lib/types';
import VehicleCard from './VehicleCard';

export default function KanbanColumn({
  label,
  stageKey,
  vehicles,
  onAddClick,
  onMoved,
}: {
  label: string;
  stageKey: string;
  vehicles: Vehicle[];
  onAddClick: () => void;
  onMoved: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageKey });

  return (
    <div
      ref={setNodeRef}
      className={`snap-col w-[86vw] sm:w-72 flex-shrink-0 flex flex-col max-h-full rounded-xl p-3 transition-colors duration-150 ${
        isOver ? 'bg-blue-50 ring-2 ring-signal-blue ring-inset' : 'bg-asphalt'
      }`}
    >
      <div className="flex items-center justify-between mb-3 px-0.5">
        <p className="font-display font-semibold text-ink text-sm">
          {label} <span className="text-steel font-normal">({vehicles.length})</span>
        </p>
        <button
          onClick={onAddClick}
          aria-label={`Add vehicle to ${label}`}
          className="w-9 h-9 rounded-full bg-signal-blue text-white text-xl leading-none flex items-center justify-center active:scale-90 transition shadow-sm"
        >
          +
        </button>
      </div>

      <div className="overflow-y-auto flex-1">
        {vehicles.length === 0 ? (
          <p className="text-steel text-sm py-6 text-center">No vehicles here</p>
        ) : (
          <SortableContext items={vehicles.map((v) => v.id)} strategy={verticalListSortingStrategy}>
            {vehicles.map((v) => (
              <VehicleCard key={v.id} vehicle={v} onMoved={onMoved} />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  );
}
